/**
 * 20-brainworm-dispatcher.js
 * Shares free RAM across all zombie servers with your faction.
 *
 * Usage:
 *   run 20-brainworm-dispatcher.js          — start sharing
 *   run 20-brainworm-dispatcher.js --stop   — kill all brainworm workers
 */
export async function main(ns) {
  ns.disableLog("ALL");

  const BRAINWORM_SCRIPT = "20-brainworm.js";
  const DATA_FILE        = "servers.json";
  const HOME_RESERVE_GB  = 16; // GB to keep free on home for other scripts
  const STOP_MODE        = ns.args.includes("--stop");

  // ── Load servers.json ────────────────────────────────────────────────────
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

  // Only zombie servers have enough RAM to be useful workers
  const zombies = allServers.filter(s => s.zombie);

  if (zombies.length === 0) {
    ns.tprint("ERROR  No zombie servers found — run 01-discovery.js first");
    return;
  }

  // ── Stop mode ────────────────────────────────────────────────────────────
  if (STOP_MODE) {
    let killed = 0;
    for (const z of zombies) {
      const procs = ns.ps(z.name).filter(p => p.filename === BRAINWORM_SCRIPT);
      for (const p of procs) { ns.kill(p.pid); killed++; }
    }
    ns.tprint(`Brainworm stopped — killed ${killed} worker(s)`);
    return;
  }

  // ── Script RAM — ALWAYS measure on home ──────────────────────────────────
  const scriptRam = ns.getScriptRam(BRAINWORM_SCRIPT, "home");
  if (!scriptRam || scriptRam <= 0) {
    ns.tprint(`ERROR  Cannot read RAM cost for ${BRAINWORM_SCRIPT} — is it on home?`);
    return;
  }
  ns.tprint(`${"INFO".padEnd(6)} ${BRAINWORM_SCRIPT.padEnd(25)} ${`${scriptRam}GB/thread`.padStart(12)}`);

  // ── Dispatch ─────────────────────────────────────────────────────────────
  let totalProcs   = 0;
  let totalThreads = 0;

  for (const z of zombies) {
    const server = z.name;

    // Copy worker to remote servers (skip home — already there)
    if (server !== "home") {
      await ns.scp(BRAINWORM_SCRIPT, server, "home");
    }

    // Kill existing workers before re-spawning — prevents stacking on re-runs
    const running = ns.ps(server).filter(p => p.filename === BRAINWORM_SCRIPT);
    for (const proc of running) ns.kill(proc.pid);

    // Reserve some RAM on home for other scripts (discovery, dispatcher, etc.)
    const reserve = server === "home" ? HOME_RESERVE_GB : 0;
    const freeRam = ns.getServerMaxRam(server) - ns.getServerUsedRam(server) - reserve;
    const threads = Math.floor(freeRam / scriptRam);

    if (!Number.isFinite(threads) || threads <= 0) {
      ns.tprint(`${"SKIP".padEnd(6)} ${server.padEnd(25)} ${"free:".padStart(8)} ${`${freeRam.toFixed(1)}GB`.padStart(8)} — not enough for 1 thread`);
      continue;
    }

    const pid = ns.exec(BRAINWORM_SCRIPT, server, threads);

    if (pid === 0) {
      ns.tprint(`${"WARN".padEnd(6)} ${server.padEnd(25)} exec() failed  threads: ${String(threads).padStart(4)}`);
    } else {
      ns.tprint(
        `${"SHARE".padEnd(6)} ${server.padEnd(25)}` +
        ` threads: ${String(threads).padStart(4)}` +
        `  shared: ${`${(threads * scriptRam).toFixed(1)}GB`.padStart(8)}` +
        `  pid: ${String(pid).padStart(5)}`
      );
      totalProcs++;
      totalThreads += threads;
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  ns.tprint("─".repeat(70));
  ns.tprint(
    `${"TOTAL".padEnd(6)} ${`${totalProcs} servers`.padEnd(25)}` +
    ` threads: ${String(totalThreads).padStart(4)}` +
    `  shared: ${`${(totalThreads * scriptRam).toFixed(1)}GB`.padStart(8)}`
  );
  ns.tprint(`To stop: run 20-brainworm-dispatcher.js --stop`);
}
