/**
 * dodge.js
 *
 * RAM-cost bypass helper. Spawned by aug-planner.js (and other scripts) to
 * call expensive ns.* functions without charging their RAM to the caller.
 *
 * Protocol:
 *   Caller: ns.run("test-scripts/dodge.js", {temporary:true}, "singularity.foo", arg1, arg2)
 *   This script calls ns.singularity.foo(arg1, arg2) and writes the result
 *   to port (pid * 2). Caller waits on ns.nextPortWrite(pid * 2) then reads.
 *
 * Do NOT run this script directly.
 */

/** @param {NS} ns */
export async function main(ns) {
  const [fn, ...args] = ns.args;

  // Override RAM declaration to only pay for ns.baseCost + the target function.
  const new_ram = ns.getFunctionRamCost("baseCost") + ns.getFunctionRamCost(fn);
  if (Math.round(ns.ramOverride(new_ram) * 100) !== Math.round(new_ram * 100)) {
    throw "ramOverride failed — Bitburner version may not support it";
  }

  ns.disableLog("ALL");
  ns.writePort(ns.pid * 2, await eval(`ns.${fn}`)(...args));
}
