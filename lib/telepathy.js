// Part of the engine-v2 system — lib/telepathy.js: telepathy (RAM share) tick logic
import { getConfig }              from "lib/quonfig.js";
import { logPropulsion, logTail } from "lib/logger.js";
import { getServers }             from "lib/scout.js";

const BRAINWORM_SCRIPT = "spores/brainworm.js";
const BACTERIA_SCRIPT  = "spores/bacteria.js";

export async function tickTelepathy(ns) {
  const cap         = getConfig(ns, "ops-telepathy-size");
  const homeReserve = getConfig(ns, "ops-free-home-ram");

  const zombies = getServers(ns, "zombies");
  if (zombies.length === 0) {
    logPropulsion(ns, "TELEPATHY", "ERROR", "no zombie servers");
    return;
  }

  const scriptRam   = ns.getScriptRam(BRAINWORM_SCRIPT, "home");
  const bacteriaRam = ns.getScriptRam(BACTERIA_SCRIPT, "home");
  if (!scriptRam || scriptRam <= 0) {
    logPropulsion(ns, "TELEPATHY", "ERROR", `cannot read RAM cost for ${BRAINWORM_SCRIPT}`);
    return;
  }

  // Pre-check: if total running brainworm exceeds cap, kill everything and
  // let the normal allocation loop re-allocate cleanly on the next tick.
  const allBrainworm = zombies.flatMap(z =>
    ns.ps(z.name).filter(p => p.filename === BRAINWORM_SCRIPT).map(p => ({ server: z.name, pid: p.pid, threads: p.threads }))
  );
  const runningGB = allBrainworm.reduce((sum, p) => sum + p.threads * scriptRam, 0);
  if (runningGB > cap) {
    for (const { pid } of allBrainworm) ns.kill(pid);
    logPropulsion(ns, "TELEPATHY", "RESET", `over cap (${runningGB.toFixed(0)}GB > ${cap}GB) — killed all, re-allocating`);
  }

  let totalProcs   = 0;
  let totalThreads = 0;
  let totalGB      = 0;

  for (const z of zombies) {
    const server = z.name;

    if (totalGB >= cap) {
      const procs = ns.ps(server).filter(p => p.filename === BRAINWORM_SCRIPT);
      for (const p of procs) ns.kill(p.pid);
      continue;
    }

    await ns.scp(BRAINWORM_SCRIPT, server, "home");

    const running        = ns.ps(server).filter(p => p.filename === BRAINWORM_SCRIPT);
    const currentThreads = running.reduce((s, p) => s + p.threads, 0);

    const reserve      = server === "home" ? homeReserve : 0;
    const remainingCap = cap - totalGB;

    const maxAddByBudget = Math.max(0,
      Math.floor((remainingCap - currentThreads * scriptRam) / scriptRam));

    let freeRam     = ns.getServerMaxRam(server) - ns.getServerUsedRam(server) - reserve;
    let maxAddByRam = Math.floor(freeRam / scriptRam);

    if (maxAddByBudget > maxAddByRam && bacteriaRam > 0) {
      const bacteriaProcs = ns.ps(server).filter(p => p.filename === BACTERIA_SCRIPT);
      let gbNeeded = (maxAddByBudget - maxAddByRam) * scriptRam;
      for (const proc of bacteriaProcs) {
        if (gbNeeded <= 0) break;
        ns.kill(proc.pid);
        gbNeeded -= proc.threads * bacteriaRam;
      }
      freeRam     = ns.getServerMaxRam(server) - ns.getServerUsedRam(server) - reserve;
      maxAddByRam = Math.floor(freeRam / scriptRam);
    }

    const extraThreads = Math.min(maxAddByRam, maxAddByBudget);

    if (currentThreads > 0 && extraThreads <= 0) {
      totalProcs++;
      totalThreads += currentThreads;
      totalGB      += currentThreads * scriptRam;
      continue;
    }

    if (extraThreads <= 0) continue;

    const pid = ns.exec(BRAINWORM_SCRIPT, server, extraThreads);
    if (pid === 0) {
      logPropulsion(ns, "TELEPATHY", "WARN", `${server.padEnd(25)} exec() failed  threads: ${String(extraThreads).padStart(4)}`);
    } else {
      totalProcs++;
      totalThreads += currentThreads + extraThreads;
      totalGB      += (currentThreads + extraThreads) * scriptRam;
    }
  }

  logTail(ns, "TELEPATHY", "TOTAL",
    `procs: ${String(totalProcs).padStart(4)}  threads: ${String(totalThreads).padStart(5)}  shared: ${totalGB.toFixed(0)}GB / ${cap}GB cap`);
}
