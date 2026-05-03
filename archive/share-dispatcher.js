/**
 * share-dispatcher.js
 * Distributes share-worker.js across all rooted servers from servers.json,
 * using every available thread on each machine.
 *
 * Usage:
 *   run share-dispatcher.js          — start sharing
 *   run share-dispatcher.js --stop   — kill all share workers everywhere
 */
export async function main(ns) {
  ns.disableLog("ALL");

  const WORKER     = "share-worker.js";
  const DATA_FILE  = "servers.json";
  const STOP_MODE  = ns.args.includes("--stop");

  // ── Load server list ─────────────────────────────────────────────────────
  const raw = ns.read(DATA_FILE);
  if (!raw || raw === "NULL PORT DATA") {
    ns.tprint(`ERROR  ${DATA_FILE} not found — run 01-discovery.js first`);
    return;
  }

  let allServers;
  try {
    allServers = JSON.parse(raw);
  } catch {
    ns.tprint(`ERROR  ${DATA_FILE} is corrupt — re-run 01-discovery.js`);
    return;
  }

  // Only zombie servers (have usable RAM) — includes home from discovery
  const zombies = allServers.filter(s => s.zombie);

  if (zombies.length === 0) {
    ns.tprint("ERROR  No zombie servers in servers.json — run 01-discovery.js first");
    return;
  }

  // ── Stop mode: kill all running share workers ────────────────────────────
  if (STOP_MODE) {
    let killed = 0;
    for (const z of zombies) {
      const procs = ns.ps(z.name).filter(p => p.filename === WORKER);
      for (const p of procs) {
        ns.kill(p.pid);
        killed++;
      }
    }
    ns.tprint(`Share stopped — killed ${killed} worker(s)`);
    return;
  }

  // ── Script RAM (always measured on home) ─────────────────────────────────
  const scriptRam = ns.getScriptRam(WORKER, "home");
  if (!scriptRam || scriptRam <= 0) {
    ns.tprint(`ERROR  Cannot read RAM cost for ${WORKER} — is it on home?`);
    return;
  }

  // ── Deploy and launch ────────────────────────────────────────────────────
  let totalThreads = 0;
  let totalProcs   = 0;

  for (const z of zombies) {
    const server = z.name;

    // Kill any existing share workers so re-runs don't stack
    const existing = ns.ps(server).filter(p => p.filename === WORKER);
    for (const p of existing) ns.kill(p.pid);

    // Copy worker to remote servers (no-op for home)
    if (server !== "home") {
      await ns.scp(WORKER, server, "home");
    }

    const freeRam = ns.getServerMaxRam(server) - ns.getServerUsedRam(server);
    const threads = Math.floor(freeRam / scriptRam);

    if (!Number.isFinite(threads) || threads <= 0) {
      ns.print(`SKIP  ${server}  freeRam:${freeRam.toFixed(2)}GB — not enough for 1 thread`);
      continue;
    }

    const pid = ns.exec(WORKER, server, threads);

    if (pid === 0) {
      ns.tprint(`WARN  exec() failed on ${server} (threads:${threads})`);
    } else {
      ns.print(`SHARE ${server}  threads:${threads}  (${(threads * scriptRam).toFixed(2)}GB shared)`);
      totalProcs++;
      totalThreads += threads;
    }
  }

  const totalRam = (totalThreads * scriptRam).toFixed(2);
  ns.tprint(`Share active — ${totalProcs} servers, ${totalThreads} threads, ${totalRam}GB shared`);
  ns.tprint(`To stop: run share-dispatcher.js --stop`);
}
