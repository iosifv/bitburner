import { renameMembers, recruit, updateWarfare, processMembers, printStatus } from "lib/gang.js";

export async function main(ns) {
  ns.disableLog("ALL");
  ns.ui.openTail();

  const CONFIG = {
    loopDelay:             15000,
    respectThreshold:      2e6,
    ascensionThreshold:    1.4,
    equipmentPriceDivisor: 1,
    warfareThreshold:      0.75,
    warfareMembers:        12,
    warfareWarmup:         8,
  };

  const NAMES = [
    "Homelander",     "Billy Butcher",
    "Soldier Boy",    "Mother's Milk",
    "The Deep",       "Starlight",
    "A-Train",        "Hughie",
    "Black Noir",     "Frenchie",
    "Stormfront",     "Kimiko",
  ];

  renameMembers(ns, NAMES);

  let nameIndex     = ns.gang.getMemberNames().length;
  let lastTerritory = ns.gang.getGangInformation().territory;

  while (true) {
    const gangInfo  = ns.gang.getGangInformation();
    const members   = ns.gang.getMemberNames();
    const wantMoney = gangInfo.respect >= CONFIG.respectThreshold;

    // Clash detection
    const territoryDelta = gangInfo.territory - lastTerritory;
    if (Math.abs(territoryDelta) > 0.0001) {
      const won = territoryDelta > 0;
      ns.print(
        `CLASH  ${won ? "✅ WON" : "❌ LOST"}  ` +
        `Territory: ${(lastTerritory * 100).toFixed(3)}% → ${(gangInfo.territory * 100).toFixed(3)}%  ` +
        `(${won ? "+" : ""}${(territoryDelta * 100).toFixed(3)}%)`
      );
    }
    lastTerritory = gangInfo.territory;

    nameIndex       = recruit(ns, NAMES, nameIndex);
    const warfare   = updateWarfare(ns, gangInfo, members, CONFIG);
    processMembers(ns, members, warfare.warfareRoster, wantMoney, CONFIG);
    printStatus(ns, gangInfo, members, wantMoney, warfare);

    await ns.sleep(CONFIG.loopDelay);
  }
}
