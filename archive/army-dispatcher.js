/**
 * army-dispatcher.js
 * Reads servers.json, then distributes farm.js workers across all zombie
 * servers, round-robining targets across victim servers.
 *
 * KEY FIXES vs original:
 *  - scriptRam is always measured on "home" (where file is guaranteed present)
 *  - threads clamped to a safe positive integer before exec()
 *  - already-running instances on a server are killed first so re-runs are safe
 *  - skips servers with insufficient RAM gracefully
 *  - validates victim list before assigning targets
 */
export async function main(ns) {
  ns.disableLog("ALL");

  const FARM_SCRIPT = "farm.js";
  const DATA_FILE   = "servers.json";

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

  const zombies = allServers.filter(s => s.zombie);
  const victims = allServers.filter(s => s.victim);

  if (zombies.length === 0) { ns.tprint("ERROR  No zombie servers found"); return; }
  if (victims.length === 0) { ns.tprint("ERROR  No victim servers found"); return; }

  // ── Script RAM — ALWAYS measure on home ─────────────────────────────────
  // getScriptRam() on a remote host returns 0 if the file isn't there yet,
  // causing Math.floor(freeRam / 0) = Infinity → exec() throws.
  const scriptRam = ns.getScriptRam(FARM_SCRIPT, "home");
  if (!scriptRam || scriptRam <= 0) {
    ns.tprint(`ERROR  Could not determine RAM for ${FARM_SCRIPT} — is it present on home?`);
    return;
  }
  ns.tprint(`INFO  ${FARM_SCRIPT} costs ${scriptRam} GB RAM per thread`);

  // ── Dispatch ─────────────────────────────────────────────────────────────
  let tIndex     = 0;   // round-robin victim index
  let totalProcs = 0;
  let totalThreads = 0;

  for (const z of zombies) {
    const server = z.name;

    // Ensure the farm script is present (idempotent)
    await ns.scp(FARM_SCRIPT, server, "home");

    // Kill any existing farm.js on this server so we start clean.
    // This prevents duplicate workers when re-running the dispatcher.
    const running = ns.ps(server).filter(p => p.filename === FARM_SCRIPT);
    for (const proc of running) ns.kill(proc.pid);

    // Calculate available RAM
    const maxRam  = ns.getServerMaxRam(server);
    const usedRam = ns.getServerUsedRam(server);   // should be ~0 after kills
    const freeRam = maxRam - usedRam;

    const threads = Math.floor(freeRam / scriptRam);

    if (!Number.isFinite(threads) || threads <= 0) {
      ns.print(`SKIP  ${server}  freeRam:${freeRam.toFixed(1)}GB — not enough for 1 thread`);
      continue;
    }

    // Pick a victim (round-robin)
    const target = victims[tIndex % victims.length].name;
    tIndex++;

    const pid = ns.exec(FARM_SCRIPT, server, threads, target);

    if (pid === 0) {
      ns.tprint(`WARN  exec() failed on ${server} (threads:${threads}, target:${target})`);
    } else {
      ns.print(`SPAWN ${server} → ${target}  threads:${threads}  pid:${pid}`);
      totalProcs++;
      totalThreads += threads;
    }
  }

  ns.tprint(`Dispatch complete — ${totalProcs} processes, ${totalThreads} total threads`);
  ns.tprint(`Targets: ${victims.map(v => v.name).join(", ")}`);
}
