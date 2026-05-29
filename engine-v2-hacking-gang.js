// Part of the engine-v2 system — engine-v2-hacking-gang.js: HackingGangEngine runner
import { EngineStoke }            from "lib/engine-stoke.js";
import { renameMembers, recruit } from "lib/gang.js";
import { getConfig }              from "lib/config.js";
import { log }                    from "lib/logger.js";

const NAMES = [
  "Zero Cool",      "Linus Torvalds",
  "Acid Burn",      "Dennis Ritchie",
  "Phantom Phreak", "Alan Turing",
  "Cereal Killer",  "Ada Lovelace",
  "Lord Nikon",     "John Carmack",
  "The Plague",     "Richard Stallman",
];

function getTask(info, wantMoney, gangInfo, config, notFullCapacity) {
  const hack = info.hack;
  if (hack <  200)  return "Train Hacking";
  if (gangInfo.wantedLevel > 1 && gangInfo.wantedPenalty < 1 - config.wantedPenaltyThreshold) return "Ethical Hacking";
  if (hack <  300)  return "Ransomware";
  if (hack < 1000)  return "Phishing";
  if (hack < 3000)  return "Identity Theft";
  if ((!wantMoney || notFullCapacity) && gangInfo.respect >= config.cyberterrorismRespectFloor) return "Cyberterrorism";
  return "Money Laundering";
}

class HackingGangEngine extends EngineStoke {
  constructor(ns) {
    super(ns, "hacking-gang");
    this.names     = NAMES;
    this.nameIndex = ns.gang.getMemberNames().length;
    renameMembers(ns, NAMES);
  }

  get hackingGangConfig() {
    const ns = this.ns;
    return {
      respectThreshold:           getConfig(ns, "gang-respect-threshold") * 1000,
      ascensionThreshold:         getConfig(ns, "gang-ascension-threshold"),
      equipmentPriceDivisor:      getConfig(ns, "gang-equipment-price-divisor"),
      wantedPenaltyThreshold:     getConfig(ns, "gang-wanted-penalty-threshold"),
      cyberterrorismRespectFloor: getConfig(ns, "gang-respect-floor-cyberterrorism") * 1000,
    };
  }

  processMembers(members, gangInfo, wantMoney, config, notFullCapacity) {
    const ns = this.ns;
    const { ascensionThreshold, equipmentPriceDivisor } = config;

    for (const name of members) {
      const info = ns.gang.getMemberInformation(name);

      const ascResult = ns.gang.getAscensionResult(name);
      if (ascResult?.hack >= ascensionThreshold) {
        ns.gang.ascendMember(name);
        log(ns, "port", "HACK-GANG", "ASCEND", `${name.padEnd(15)} hack:x${ascResult.hack.toFixed(2)}`);
      }

      for (const eq of ns.gang.getEquipmentNames()) {
        const cost  = ns.gang.getEquipmentCost(eq);
        const type  = ns.gang.getEquipmentType(eq);
        const owned = info.upgrades.includes(eq) || info.augmentations.includes(eq);
        if (!owned && ["Rootkit", "Augmentation"].includes(type)
            && ns.getPlayer().money > cost * equipmentPriceDivisor) {
          ns.gang.purchaseEquipment(name, eq);
          log(ns, "port", "HACK-GANG", "EQUIP", `${name.padEnd(15)} ${eq}`);
        }
      }

      const task = getTask(info, wantMoney, gangInfo, config, notFullCapacity);
      if (info.task !== task) ns.gang.setMemberTask(name, task);
    }
  }

  async tick() {
    const ns              = this.ns;
    const gangInfo        = ns.gang.getGangInformation();
    const members         = ns.gang.getMemberNames();
    const config          = this.hackingGangConfig;
    const wantMoney       = gangInfo.respect >= config.respectThreshold;
    const notFullCapacity = members.length < this.names.length;

    this.nameIndex = recruit(ns, this.names, this.nameIndex, "port", "HACK-GANG");
    this.processMembers(members, gangInfo, wantMoney, config, notFullCapacity);
  }
}

export async function main(ns) {
  ns.disableLog("ALL");
  const engine = new HackingGangEngine(ns);
  while (true) {
    await engine.tick();
    await ns.sleep(engine.loopDelay);
  }
}
