/**
Take it in steps.
-Train recruits until they are strong enough to complete some tasks.
-Do respect tasks to gain new recruits faster.
-Always cycle the lowest combat stat member into combat training (I do the lowest 3 at max members)
-If you are flash mobing, make sure that all of your members are assigned to territory warfare on the tick for it
-If not, usually wait until you get all of your members before you assign any to this
-Territory warfare increases your gangs power.  That is what's used to win clashes
-When you have at least a 55% win chance against every opponent, turn on clashes
-Do not assign any members to territory warfare during the clash tick if their defence is lower than 300 or they might die
Ascension resets you for a permanent bonus - lets you get higher stats and level faster
Equipment can give a temporary boost, members lose them on ascension
Augments are permanent boosts
iosifv — 23:34
hmm, okay, thanks. I'll build a state machine based on this if I can - at least that's what it sounds like it should be, right?
so 
the last 3 always train, regardless of their stats? is that what you meant?
300 defence is an excellent tip
what would be a good ascension multiplier you think? I set mine on 1.4x for any stat
gmcew — 23:37
There's some old pins in here with ascension mults; either a series of ifs, or jeek did a decent best fit curve for them

 */


// Part of the engine-v2 system — engine-v2-combat-gang.js: CombatGangEngine runner
import { EngineStoke }                    from "lib/engine-stoke.js";
import { renameMembers, recruit, setTask } from "lib/gang.js";
import { getConfig }                       from "lib/config.js";

const NAMES = [
  "Homelander",  "Billy Butcher",
  "Soldier Boy", "Mother's Milk",
  "The Deep",    "Starlight",
  "A-Train",     "Hughie",
  "Black Noir",  "Frenchie",
  "Stormfront",  "Kimiko",
];

class CombatGangEngine extends EngineStoke {
  constructor(ns) {
    super(ns, "combat-gang");
    this.names          = NAMES;
    this.nameIndex      = ns.gang.getMemberNames().length;
    this.wantedRecovery = false;
    renameMembers(ns, NAMES);
  }

  get config() {
    const ns = this.ns;
    return {
      respectThreshold:       getConfig(ns, "gang-respect-threshold") * 1000,
      ascensionThreshold:     getConfig(ns, "gang-ascension-threshold"),
      buyEquipment:           getConfig(ns, "gang-buy-equipment"),
      wantedPenaltyThreshold: getConfig(ns, "gang-wanted-penalty-threshold"),
      terrorismRespectFloor:  getConfig(ns, "gang-respect-floor-terrorism") * 1000,
    };
  }

  // ── helpers ───────────────────────────────────────────────────────────────────

  #combatScore(info) {
    return info.str + info.def + info.dex + info.agi;
  }

  // ── task selection ─────────────────────────────────────────────────────────────

  #taskFor(info, gangInfo, wantMoney) {
    const { terrorismRespectFloor } = this.config;
    if (this.wantedRecovery) return "Vigilante Justice";
    const score = this.#combatScore(info);
    if (score <  200) return "Train Combat";
    if (score <  600) return "Mug People";
    if (score < 1500) return "Armed Robbery";
    if (score < 3000) return "Traffick Illegal Arms";
    // Terrorism generates too much wanted level to run safely at low respect
    if (!wantMoney && gangInfo.respect >= terrorismRespectFloor) return "Terrorism";
    return "Traffick Illegal Arms";
  }

  // ── per-member actions ─────────────────────────────────────────────────────────

  #ascend(name) {
    const ascResult = this.ns.gang.getAscensionResult(name);
    if (!ascResult) return;
    const t = this.config.ascensionThreshold;
    if (ascResult.str < t && ascResult.def < t && ascResult.dex < t && ascResult.agi < t) return;
    this.ns.gang.ascendMember(name);
    this.log("ASCEND", `${name.padEnd(15)} str:x${ascResult.str.toFixed(2)}  def:x${ascResult.def.toFixed(2)}  dex:x${ascResult.dex.toFixed(2)}  agi:x${ascResult.agi.toFixed(2)}`);
  }

  #equip(name, info) {
    if (!this.config.buyEquipment) return;
    const ns = this.ns;
    for (const eq of ns.gang.getEquipmentNames()) {
      if (info.upgrades.includes(eq) || info.augmentations.includes(eq)) continue;
      if (!["Weapon", "Armor", "Vehicle", "Augmentation"].includes(ns.gang.getEquipmentType(eq))) continue;
      if (ns.gang.getEquipmentCost(eq) > ns.getPlayer().money) continue;
      ns.gang.purchaseEquipment(name, eq);
      this.log("EQUIP", `${name.padEnd(15)} ${eq}`);
    }
  }

  #assign(info, gangInfo, wantMoney) {
    setTask(this.ns, info, this.#taskFor(info, gangInfo, wantMoney));
  }

  #process(name, gangInfo, wantMoney) {
    const info = this.ns.gang.getMemberInformation(name);
    this.#ascend(name);
    this.#equip(name, info);
    this.#assign(info, gangInfo, wantMoney);
  }

  // ── status ─────────────────────────────────────────────────────────────────────

  #printStatus(gangInfo, members, wantMoney) {
    const ns         = this.ns;
    const taskCounts = {};
    for (const name of members) {
      const task = ns.gang.getMemberInformation(name).task;
      taskCounts[task] = (taskCounts[task] ?? 0) + 1;
    }
    const taskSummary = Object.entries(taskCounts)
      .map(([task, count]) => `${task}: ${count}`)
      .join("  ");

    this.log("STATUS",
      `Members: ${String(members.length).padStart(2)}  ` +
      `Respect: ${ns.format.number(gangInfo.respect, 2).padStart(10)}  ` +
      `Territory: ${(gangInfo.territory * 100).toFixed(1).padStart(5)}%  ` +
      `Mode: ${wantMoney ? "MONEY" : "RESPECT"}`
    );
    this.log("TASKS", taskSummary);
  }

  // ── tick ───────────────────────────────────────────────────────────────────────

  async tick() {
    const ns        = this.ns;
    const gangInfo  = ns.gang.getGangInformation();
    const members   = ns.gang.getMemberNames();
    const wantMoney = gangInfo.respect >= this.config.respectThreshold;

    const { wantedPenaltyThreshold } = this.config;
    if (gangInfo.wantedPenalty < 1 - wantedPenaltyThreshold) this.wantedRecovery = true;
    if (gangInfo.wantedPenalty >= 0.99)                       this.wantedRecovery = false;

    this.nameIndex = recruit(ns, this.names, this.nameIndex, "port");
    for (const name of members) this.#process(name, gangInfo, wantMoney);
    this.#printStatus(gangInfo, members, wantMoney);
    this.log("TICK", `members: ${members.length}  respect: ${ns.format.number(gangInfo.respect, 2)}`);
  }
}

export async function main(ns) {
  ns.disableLog("ALL");
  ns.ui.openTail();
  const engine = new CombatGangEngine(ns);
  while (true) {
    await engine.tick();
    await ns.sleep(engine.loopDelay);
  }
}
