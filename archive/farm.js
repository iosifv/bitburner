/**
 * farm.js
 * Long-running worker: weaken → grow → hack loop against a single target.
 * Launched by army-dispatcher.js with: run farm.js <target>
 *
 * Improvements vs original:
 *  - Validates target argument on startup
 *  - Security threshold tunable via optional 2nd arg (default 5)
 *  - Money threshold tunable via optional 3rd arg (default 0.75)
 *  - Logs phase transitions so you can watch progress in the tail
 */
export async function main(ns) {
  const target         = ns.args[0];
  const secPad         = ns.args[1] ?? 5;    // weaken if sec > min + secPad
  const moneyThreshold = ns.args[2] ?? 0.75; // grow if money < max * this

  if (!target) {
    ns.tprint("ERROR  farm.js requires a target hostname as arg[0]");
    return;
  }

  // Validate target exists and we have root
  if (!ns.serverExists(target)) {
    ns.tprint(`ERROR  farm.js: target "${target}" does not exist`);
    return;
  }
  if (!ns.hasRootAccess(target)) {
    ns.tprint(`ERROR  farm.js: no root access on "${target}"`);
    return;
  }

  ns.disableLog("ALL");
  ns.print(`farm.js started → targeting ${target}`);

  while (true) {
    const sec    = ns.getServerSecurityLevel(target);
    const minSec = ns.getServerMinSecurityLevel(target);
    const money  = ns.getServerMoneyAvailable(target);
    const maxMon = ns.getServerMaxMoney(target);

    if (sec > minSec + secPad) {
      ns.print(`[WEAKEN] sec=${sec.toFixed(2)} min=${minSec}`);
      await ns.weaken(target);
    } else if (money < maxMon * moneyThreshold) {
      ns.print(`[GROW]   money=${ns.formatNumber(money)} / ${ns.formatNumber(maxMon)}`);
      await ns.grow(target);
    } else {
      ns.print(`[HACK]   money=${ns.formatNumber(money)}`);
      await ns.hack(target);
    }
  }
}
