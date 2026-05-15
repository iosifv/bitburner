import { log }        from "lib/logger.js";
import { getServers } from "lib/scout.js";
import { getConfig }  from "lib/config.js";

// ── dispatch ─────────────────────────────────────────────────────────────────
export async function dispatch(ns, mode = "print") {
  const VIRUS_SCRIPT = "spores/bacteria.js";
  const HOME_RAM     = getConfig(ns, "engine-free-home-ram");
  const quiet        = mode === "port" ? "silent" : mode;

  const zombies = getServers(ns, "zombies");
  const victims  = getServers(ns, "victims");

  if (zombies.length === 0) { log(ns, mode, "OVERLORD", "ERROR", "no zombie servers found"); return; }
  if (victims.length === 0) { log(ns, mode, "OVERLORD", "ERROR", "no victim servers found"); return; }

  const forcedName = getConfig(ns, "batching-forced-target");
  let best;
  if (forcedName && forcedName.trim() !== "") {
    const all   = getServers(ns, "all");
    const match = all.find(s => s.name === forcedName.trim());
    if (!match) {
      log(ns, mode, "OVERLORD", "ERROR", `forced target "${forcedName}" not found on network — falling back to auto`);
      best = victims[0];
    } else {
      best = match;
      log(ns, quiet, "OVERLORD", "FORCED", `using forced target ${best.name}`);
    }
  } else {
    best = victims[0];
  }

  const scriptRam = ns.getScriptRam(VIRUS_SCRIPT, "home");
  if (!scriptRam || scriptRam <= 0) {
    log(ns, mode, "OVERLORD", "ERROR", `cannot read RAM cost for ${VIRUS_SCRIPT}`);
    return;
  }

  let totalProcs   = 0;
  let totalThreads = 0;

  for (const z of zombies) {
    const server = z.name;

    await ns.scp(VIRUS_SCRIPT, server, "home");

    const running        = ns.ps(server).filter(p => p.filename === VIRUS_SCRIPT);
    const currentThreads = running.reduce((sum, p) => sum + p.threads, 0);
    const alreadyCorrect = running.some(p => p.args[0] === best.name);

    const reserve      = server === "home" ? HOME_RAM : 0;
    const freeRam      = ns.getServerMaxRam(server) - ns.getServerUsedRam(server) - reserve;
    const extraThreads = Math.floor(freeRam / scriptRam);

    if (!alreadyCorrect && running.length > 0) {
      for (const proc of running) ns.kill(proc.pid);
      log(ns, quiet, "OVERLORD", "KILL", `${server.padEnd(25)} killed ${String(running.length).padStart(2)} worker(s)  (wrong target)`);
    }

    if (alreadyCorrect && extraThreads <= 0) {
      log(ns, quiet, "OVERLORD", "OK", `${server.padEnd(25)} threads: ${String(currentThreads).padStart(4)}  (full)`);
      totalProcs++;
      totalThreads += currentThreads;
      continue;
    }

    const threads = alreadyCorrect ? extraThreads : Math.floor(freeRam / scriptRam);
    if (!Number.isFinite(threads) || threads <= 0) {
      log(ns, quiet, "OVERLORD", "SKIP", `${server.padEnd(25)} freeRam: ${`${freeRam.toFixed(1)}GB`.padStart(8)} — not enough for 1 thread`);
      continue;
    }

    const reason = alreadyCorrect ? "top-up" : "fresh";
    const pid    = ns.exec(VIRUS_SCRIPT, server, threads, best.name);
    if (pid === 0) {
      log(ns, mode, "OVERLORD", "WARN", `${server.padEnd(25)} exec() failed  threads: ${String(threads).padStart(4)}`);
    } else {
      log(ns, quiet, "OVERLORD", "SPAWN", `${server.padEnd(25)} threads: ${String(threads).padStart(4)}  pid: ${String(pid).padStart(5)}  (${reason})`);
      totalProcs++;
      totalThreads += currentThreads + threads;
    }
  }

  // Security: current / min
  const secStr = `${best.serverSecurity.toFixed(0)}/${best.serverMinSecurity.toFixed(0)}`;

  // Hack chance
  const chanceStr = `${(best.hackChance * 100).toFixed(0)}%`;

  log(
    ns, mode, "OVERLORD", "TARGET", 
    `${best.name.padEnd(16)} ` + 
    `🖥️:${String(totalProcs).padStart(2)} ` + 
    `🤖:${String(totalThreads).padStart(5)}  ` + 
    `🏆:${best.score.toFixed(0).padStart(4)}  ` + 
    `🔐:${secStr.padStart(5)}  ` + 
    `🔑:${chanceStr.padStart(3)}`
  );
}
