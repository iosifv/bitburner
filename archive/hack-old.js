/** @param {NS} ns */
export async function main(ns) {
  const target = ns.args[0];

  ns.tail();

  while (true) {
    const sec = ns.getServerSecurityLevel(target);
    const minSec = ns.getServerMinSecurityLevel(target);
    const money = ns.getServerMoneyAvailable(target);
    const maxMoney = ns.getServerMaxMoney(target);

    ns.print(`Target: ${target}`);
    ns.print(`Security: ${sec} / ${minSec}`);
    ns.print(`Money: ${money} / ${maxMoney}`);

    if (sec > minSec + 5) {
      ns.print("Weakening...");
      await ns.weaken(target);
    } 
    else if (money < maxMoney * 0.75) {
      ns.print("Growing...");
      await ns.grow(target);
    } 
    else {
      ns.print("Hacking...");
      await ns.hack(target);
    }

    await ns.sleep(200);
  }
}