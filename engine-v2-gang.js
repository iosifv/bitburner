// Part of the engine-v2 system — engine-v2-gang.js: GangEngine runner
import { EngineStoke }                                                        from "lib/engine-stoke.js";
import { renameMembers, recruit, updateWarfare, processMembers, printStatus } from "lib/gang.js";
import { getConfig }                                                           from "lib/config.js";

const NAMES = [
  "Homelander",  "Billy Butcher",
  "Soldier Boy", "Mother's Milk",
  "The Deep",    "Starlight",
  "A-Train",     "Hughie",
  "Black Noir",  "Frenchie",
  "Stormfront",  "Kimiko",
];

class GangEngine extends EngineStoke {
  constructor(ns) {
    super(ns, "gang");
    this.names         = NAMES;
    this.nameIndex     = ns.gang.getMemberNames().length;
    this.lastTerritory = ns.gang.getGangInformation().territory;
    renameMembers(ns, NAMES);
  }

  get gangConfig() {
    const ns = this.ns;
    return {
      respectThreshold:       getConfig(ns, "gang-respect-threshold"),
      ascensionThreshold:     getConfig(ns, "gang-ascension-threshold"),
      equipmentPriceDivisor:  getConfig(ns, "gang-equipment-price-divisor"),
      warfareThreshold:       getConfig(ns, "gang-warfare-threshold"),
      warfareMembers:         getConfig(ns, "gang-warfare-members"),
      warfareWarmup:          getConfig(ns, "gang-warfare-warmup"),
      wantedPenaltyThreshold: getConfig(ns, "gang-wanted-penalty-threshold"),
      terrorismRespectFloor:  getConfig(ns, "gang-terrorism-respect-floor"),
    };
  }

  async tick() {
    const ns        = this.ns;
    const gangInfo  = ns.gang.getGangInformation();
    const members   = ns.gang.getMemberNames();
    const config    = this.gangConfig;
    const wantMoney = gangInfo.respect >= config.respectThreshold;

    const territoryDelta = gangInfo.territory - this.lastTerritory;
    if (Math.abs(territoryDelta) > 0.0001) {
      const won = territoryDelta > 0;
      this.log("CLASH",
        `${won ? "WON" : "LOST"}  ` +
        `${(this.lastTerritory * 100).toFixed(3)}% → ${(gangInfo.territory * 100).toFixed(3)}%  ` +
        `(${won ? "+" : ""}${(territoryDelta * 100).toFixed(3)}%)`
      );
    }
    this.lastTerritory = gangInfo.territory;

    this.nameIndex = recruit(ns, this.names, this.nameIndex, "port");
    const warfare  = updateWarfare(ns, gangInfo, members, config, "port");
    processMembers(ns, gangInfo, members, warfare.warfareRoster, wantMoney, config, "port");
    printStatus(ns, gangInfo, members, wantMoney, warfare, "port");
    this.log("TICK", `members: ${members.length}  respect: ${ns.format.number(gangInfo.respect, 2)}`);
  }
}

export async function main(ns) {
  ns.disableLog("ALL");
  const engine = new GangEngine(ns);
  while (true) {
    await engine.tick();
    await ns.sleep(engine.loopDelay);
  }
}
