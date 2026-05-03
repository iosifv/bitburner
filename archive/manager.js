/** @param {NS} ns */
export async function main(ns) {
  ns.tail();
  const zombieHostServer = ns.args[0];
  ns.tprint("Main HOME Manager started");

  const targets = [
    "foodnstuff",
    "sigma-cosmetics",
    "joesguns",
    "hong-fang-tea",
    "harakiri-sushi",
  ];

  const script = "hack.js";

  const maxRam = ns.getServerMaxRam(zombieHostServer);
  const usedRam = ns.getServerUsedRam(zombieHostServer);
  const freeRam = maxRam - usedRam;

  ns.tprint(`Free RAM: ${freeRam}`);

  const scriptRam = ns.getScriptRam(script);
  const threadsPerTarget = Math.floor((freeRam / targets.length) / scriptRam);

  ns.tprint(`Threads per target: ${threadsPerTarget}`);

  if (threadsPerTarget <= 0) {
    ns.tprint("Not enough RAM to run anything.");
    return;
  }

  for (const target of targets) {
    const pid = ns.exec(script, zombieHostServer, threadsPerTarget, target);

    if (pid === 0) {
      ns.tprint(`FAILED to launch: ${target}`);
    } else {
      ns.tprint(`Launched ${target} with PID ${pid}`);
    }
  }
}