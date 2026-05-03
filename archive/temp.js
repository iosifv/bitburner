/** @param {NS} ns */
export async function main(ns) {
  // const NAMES = [
  //   "Homelander",
  //   "Billy Butcher",
  //   "Kimiko",
  //   "Frenchie",
  //   "Queen Maeve",
  //   "A-Train",
  //   "The Deep",
  //   "Black Noir",
  //   "Starlight",
  //   "Stormfront",
  //   "Soldier Boy",
  //   "Translucent",
  // ];

  // ns.gang.getMemberNames().forEach((n, k) => {
  //   if (n != NAMES[k]) ns.gang.renameMember(n, NAMES[k])
  // })


  // // Check what a level upgrade gives vs ram vs core
  // ns.tprint(`Level upgrade effect: ${JSON.stringify(ns.hacknet.getLevelUpgradeCost(0, 1))}`);
  // const before = ns.hacknet.getNodeStats(0);
  // ns.tprint(`Node stats: ${JSON.stringify(before)}`);


  // const t = ns.args[0] ?? "foodnstuff";
  // while (true) {
  //   ns.clearLog();
  //   ns.tprint(`security:   ${ns.getServerSecurityLevel(t).toFixed(2)} / ${ns.getServerMinSecurityLevel(t).toFixed(2)}`);
  //   ns.tprint(`money:      ${ns.formatNumber(ns.getServerMoneyAvailable(t))} / ${ns.formatNumber(ns.getServerMaxMoney(t))}`);
  //   ns.tprint(`threshold:  ${ns.formatNumber(ns.getServerMaxMoney(t) * 0.3)}`);
  //   ns.tprint(`hackChance: ${(ns.hackAnalyzeChance(t) * 100).toFixed(1)}%`);
  //   ns.tprint(`hackTime:   ${(ns.getHackTime(t) / 1000).toFixed(1)}s`);
  //   ns.tprint(`growTime:   ${(ns.getGrowTime(t) / 1000).toFixed(1)}s`);
  //   ns.tprint(`weakenTime: ${(ns.getWeakenTime(t) / 1000).toFixed(1)}s`);
  //   ns.tprint(`---------------------------------`);
  //   await ns.sleep(10000);
  // }

  ns.tprint(ns.heart.break())

}