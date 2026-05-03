// servers/home/00-virus.js
async function main(ns) {
  const target = ns.args[0];
  const secPad = ns.args[1] ?? 5;
  const moneyThreshold = ns.args[2] ?? 0.3;
  if (!target) {
    ns.tprint("ERROR  farm.js requires a target hostname as arg[0]");
    return;
  }
  ns.disableLog("ALL");
  ns.print(`farm.js started \u2192 targeting ${target}`);
  while (true) {
    const sec = ns.getServerSecurityLevel(target);
    const minSec = ns.getServerMinSecurityLevel(target);
    const money = ns.getServerMoneyAvailable(target);
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
export {
  main
};
