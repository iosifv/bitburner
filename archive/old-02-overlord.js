/**
 * 02-overlord.js
 * Dispatches virus workers across all zombie servers,
 * all targeting the single highest-scored victim.
 *
 * Smart restart logic:
 *  - Leaves workers alone if they're on the right target and RAM hasn't increased
 *  - Kills and respawns if target changed or server was upgraded (more threads available)
 */
export async function main(ns) {
  ns.disableLog("ALL");

  const VIRUS_SCRIPT = "00-virus.js";
  const DATA_FILE    = "servers.json";
  const HOME_RAM     = 10;

  // ── Load servers.json ────────────────────────────────────────────────────
  const raw = ns.read(DATA_FILE);
  if (!raw || raw === "NULL PORT DATA") {
    ns.tprint(`ERROR  ${DATA_FILE} not found — run 01-scout.js first`);
    return;
  }

  let allServers;
  try {
    allServers = JSON.parse(raw);
  } catch {
    ns.tprint(`ERROR  ${DATA_FILE} is corrupt — re-run 01-scout.js`);
    return;
  }

  const zombies = allServers.filter(s => s.zombie);
  const victims = allServers.filter(s => s.victim);

  if (zombies.length === 0) { ns.tprint("ERROR  No zombie servers found"); return; }
  if (victims.length === 0) { ns.tprint("ERROR  No victim servers found"); return; }

  // ── Pick best target by score ─────────────────────────────────────────────
  const best = victims.sort((a, b) => b.score - a.score)[0];
  ns.tprint(`TARGET  ${best.name.padEnd(25)} score: ${best.score.toFixed(2).padStart(10)}`);

  // ── Script RAM — ALWAYS measure on home ──────────────────────────────────
  const scriptRam = ns.getScriptRam(VIRUS_SCRIPT, "home");
  if (!scriptRam || scriptRam <= 0) {
    ns.tprint(`ERROR  Could not determine RAM for ${VIRUS_SCRIPT} — is it present on home?`);
    return;
  }

  // ── Dispatch ─────────────────────────────────────────────────────────────
  let totalProcs   = 0;
  let totalThreads = 0;

  for (const z of zombies) {
    const server = z.name;

    await ns.scp(VIRUS_SCRIPT, server, "home");

    const running        = ns.ps(server).filter(p => p.filename === VIRUS_SCRIPT);
    const currentThreads = running.reduce((sum, p) => sum + p.threads, 0);

    const reserve    = server === "home" ? HOME_RAM : 0;
    const freeRam    = ns.getServerMaxRam(server) - ns.getServerUsedRam(server) - reserve;
    const maxThreads = Math.floor(freeRam / scriptRam) + currentThreads;

    const alreadyCorrect = running.some(p => p.args[0] === best.name);
    const hasMoreRam     = maxThreads > currentThreads;

    if (alreadyCorrect && !hasMoreRam) {
      // Right target, no extra RAM — leave it running
      ns.print(`OK    ${server.padEnd(25)} already running  threads: ${String(currentThreads).padStart(4)}`);
      totalProcs++;
      totalThreads += currentThreads;
      continue;
    }

    // Kill and respawn — either wrong target or RAM was upgraded
    const reason = !alreadyCorrect ? "wrong target" : "RAM upgraded";
    for (const proc of running) ns.kill(proc.pid);
    if (running.length > 0) ns.tprint(`KILL  ${server.padEnd(25)} killed ${String(running.length).padStart(2)} worker(s)  (${reason})`);

    const threads = Math.floor(freeRam / scriptRam);

    if (!Number.isFinite(threads) || threads <= 0) {
      ns.print(`SKIP  ${server.padEnd(25)} freeRam: ${`${freeRam.toFixed(1)}GB`.padStart(8)} — not enough for 1 thread`);
      continue;
    }

    const pid = ns.exec(VIRUS_SCRIPT, server, threads, best.name);

    if (pid === 0) {
      ns.tprint(`WARN  ${server.padEnd(25)} exec() failed  threads: ${String(threads).padStart(4)}`);
    } else {
      ns.print(`SPAWN ${server.padEnd(25)} threads: ${String(threads).padStart(4)}  pid: ${String(pid).padStart(5)}  (${reason})`);
      totalProcs++;
      totalThreads += threads;
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  ns.tprint("─".repeat(65));
  ns.tprint(
    `${"TOTAL".padEnd(26)} procs: ${String(totalProcs).padStart(4)}  threads: ${String(totalThreads).padStart(5)}`
  );
}