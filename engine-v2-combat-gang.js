// Part of the engine-v2 system — engine-v2-combat-gang.js: CombatGangEngine runner
import { EngineStoke }                                          from "lib/engine-stoke.js";
import { renameMembers, recruit, setTask, combatScore,
         setTerritoryWarfare, getClashWinChances }             from "lib/gang.js";
import { getConfig }                                            from "lib/config.js";

const fmtDelta = (v, unit) => `${Number(v) >= 0 ? "+" : ""}${v}${unit}`;

const NAMES = [
  "Homelander",  "Billy Butcher",
  "Soldier Boy", "Mother's Milk",
  "The Deep",    "Starlight",
  "A-Train",     "Hughie",
  "Black Noir",  "Frenchie",
  "Stormfront",  "Kimiko",
];

// ── Task-selection states (cortex pattern) ────────────────────────────────────
// Ordered priority list — first state whose shouldRun returns true wins.
// Each entry: { name, shouldRun(ctx, info), task(ctx, info) }

const STATE_VIGILANTE = {
  name: "VIGILANTE",
  shouldRun: (ctx)       => ctx.wantedRecovery,
  task:      ()          => "Vigilante Justice",
};

const STATE_TRAIN_BOTTOM = {
  name: "TRAIN-BOTTOM",
  shouldRun: (ctx, info) => ctx.bottomCombat.has(info.name),
  task:      ()          => "Train Combat",
};

// Push members toward Human Trafficking for respect generation before the terrorism floor is met
const STATE_RESPECT = {
  name: "RESPECT",
  shouldRun: (ctx, info) =>
    !ctx.wantMoney &&
    combatScore(info) >= 200 &&
    ctx.gangInfo.respect < ctx.config.terrorismRespectFloor,
  task: () => "Human Trafficking",
};

// Fallthrough: existing score-ladder + optional terrorism
const STATE_MONEY_LADDER = {
  name: "MONEY",
  shouldRun: () => true,
  task: (ctx, info) => {
    const score = combatScore(info);
    if (score <  600) return "Mug People";
    if (score < 1500) return "Armed Robbery";
    if (score < 3000) return "Traffick Illegal Arms";
    if (!ctx.wantMoney && ctx.gangInfo.respect >= ctx.config.terrorismRespectFloor) return "Terrorism";
    return "Traffick Illegal Arms";
  },
};

const MEMBER_TASK_STATES = [
  STATE_VIGILANTE,
  STATE_TRAIN_BOTTOM,
  STATE_RESPECT,
  STATE_MONEY_LADDER,
];

// ── Engine ────────────────────────────────────────────────────────────────────

class CombatGangEngine extends EngineStoke {
  constructor(ns) {
    super(ns, "combat-gang");
    this.names          = NAMES;
    this.nameIndex      = ns.gang.getMemberNames().length;
    this.wantedRecovery  = false;
    this.tickDurationMs  = 2000;
    this.prevTerritory   = null;
    this.prevPower       = null;
    renameMembers(ns, NAMES);
  }

  get config() {
    const ns = this.ns;
    return {
      respectThreshold:       getConfig(ns, "gang-respect-threshold") * 1000,
      ascensionThreshold:     getConfig(ns, "gang-ascension-threshold"),
      ascensionEquipMargin:   getConfig(ns, "gang-ascension-equip-margin"),
      buyEquipment:           getConfig(ns, "gang-buy-equipment"),
      wantedPenaltyThreshold: getConfig(ns, "gang-wanted-penalty-threshold"),
      terrorismRespectFloor:  getConfig(ns, "gang-respect-floor-terrorism") * 1000,
      trainBottomN:           getConfig(ns, "gang-train-bottom-n"),
      clashEnableWinChance:   getConfig(ns, "gang-clash-enable-winchance"),
      clashDisableWinChance:  getConfig(ns, "gang-clash-disable-winchance"),
      clashMinDefense:        getConfig(ns, "gang-clash-min-defense"),
      flashMobMarginMs:       getConfig(ns, "gang-flash-mob-margin-ms"),
    };
  }

  // ── global context ─────────────────────────────────────────────────────────

  #computeContext() {
    const ns      = this.ns;
    const cfg     = this.config;
    const gangInfo = ns.gang.getGangInformation();
    const members  = ns.gang.getMemberNames();
    const infoMap  = Object.fromEntries(members.map(n => [n, ns.gang.getMemberInformation(n)]));

    const scored = members
      .map(n => ({ name: n, score: combatScore(infoMap[n]) }))
      .sort((a, b) => a.score - b.score);
    const bottomN      = Math.min(cfg.trainBottomN, members.length);
    const bottomCombat = new Set(scored.slice(0, bottomN).map(x => x.name));

    const winChances = getClashWinChances(ns);
    const winValues  = Object.values(winChances);
    const minWin     = winValues.length > 0 ? Math.min(...winValues) : 1;

    return {
      gangInfo, members, infoMap, bottomCombat,
      wantMoney:      gangInfo.respect >= cfg.respectThreshold,
      wantedRecovery: this.wantedRecovery,
      winChances, minWin,
      clashesOn: gangInfo.territoryWarfareEngaged,
      config: cfg,
    };
  }

  // ── clash toggle ───────────────────────────────────────────────────────────

  #maybeToggleClashes(ctx) {
    const { clashEnableWinChance: enable, clashDisableWinChance: disable } = ctx.config;
    if (!ctx.clashesOn && ctx.minWin >= enable) {
      setTerritoryWarfare(this.ns, true);
      this.log("CLASH", `ON  (minWin: ${(ctx.minWin * 100).toFixed(1)}%)`);
    } else if (ctx.clashesOn && ctx.minWin < disable) {
      setTerritoryWarfare(this.ns, false);
      this.log("CLASH", `OFF (minWin: ${(ctx.minWin * 100).toFixed(1)}%)`);
    }
  }

  // ── per-member helpers ─────────────────────────────────────────────────────

  #shouldAscend(name) {
    const a = this.ns.gang.getAscensionResult(name);
    if (!a) return false;
    const t = this.config.ascensionThreshold;
    return a.str >= t || a.def >= t || a.dex >= t || a.agi >= t;
  }

  #shouldEquip(info) {
    if (!this.config.buyEquipment) return false;
    const { ascensionThreshold: t, ascensionEquipMargin: margin } = this.config;
    const curMax = Math.max(
      info.str_asc_mult ?? 1,
      info.def_asc_mult ?? 1,
      info.dex_asc_mult ?? 1,
      info.agi_asc_mult ?? 1,
    );
    return curMax < (t - margin);
  }

  #ascend(name) {
    const a = this.ns.gang.getAscensionResult(name);
    if (!a) return;
    this.ns.gang.ascendMember(name);
    this.log("ASCEND", `${name.padEnd(15)} str:x${a.str.toFixed(2)}  def:x${a.def.toFixed(2)}  dex:x${a.dex.toFixed(2)}  agi:x${a.agi.toFixed(2)}`);
  }

  #equip(name, info) {
    const ns = this.ns;
    for (const eq of ns.gang.getEquipmentNames()) {
      if (info.upgrades.includes(eq) || info.augmentations.includes(eq)) continue;
      if (!["Weapon", "Armor", "Vehicle", "Augmentation"].includes(ns.gang.getEquipmentType(eq))) continue;
      if (ns.gang.getEquipmentCost(eq) > ns.getPlayer().money) continue;
      ns.gang.purchaseEquipment(name, eq);
      this.log("EQUIP", `${name.padEnd(15)} ${eq}`);
    }
  }

  // ── per-member pipeline ────────────────────────────────────────────────────

  #process(name, ctx) {
    const info = ctx.infoMap[name];
    if (this.#shouldAscend(name)) {
      this.#ascend(name);
      return;                     // info is stale after ascension — skip equip/task this tick
    }
    if (this.#shouldEquip(info)) this.#equip(name, info);

    for (const state of MEMBER_TASK_STATES) {
      if (state.shouldRun(ctx, info)) {
        const task = state.task(ctx, info);
        this.log("MEMBER",
          `${info.name.padEnd(15)} score:${String(combatScore(info)).padStart(5)}` +
          `  def:${String(info.def).padStart(5)}  state:${state.name.padEnd(12)}  → ${task}`
        );
        setTask(this.ns, info, task);
        return;
      }
    }
  }

  // ── flash-mob warfare burst ────────────────────────────────────────────────

  async #flashMob(ctx) {
    const margin = ctx.config.flashMobMarginMs;
    await this.ns.sleep(Math.max(0, this.tickDurationMs - margin));

    for (const name of ctx.members) {
      const info = ctx.infoMap[name];
      if (ctx.clashesOn && info.def < ctx.config.clashMinDefense) continue;
      this.ns.gang.setMemberTask(name, "Territory Warfare");
    }
    this.tickDurationMs = await this.ns.gang.nextUpdate();
  }

  // ── status ─────────────────────────────────────────────────────────────────

  #printStatus(ctx) {
    const ns         = this.ns;
    const taskCounts = {};
    for (const name of ctx.members) {
      const task = ctx.infoMap[name].task;
      taskCounts[task] = (taskCounts[task] ?? 0) + 1;
    }
    const taskSummary = Object.entries(taskCounts).map(([t, c]) => `${t}: ${c}`).join("  ");
    const gi = ctx.gangInfo;
    this.log("STATUS",
      `Members: ${String(ctx.members.length).padStart(2)}  ` +
      `Respect: ${ns.format.number(gi.respect, 2).padStart(10)}  ` +
      `Territory: ${(gi.territory * 100).toFixed(1).padStart(5)}%  ` +
      `Clashes: ${ctx.clashesOn ? "ON " : "OFF"}  ` +
      `MinWin: ${(ctx.minWin * 100).toFixed(1).padStart(5)}%  ` +
      `Mode: ${ctx.wantMoney ? "MONEY" : "RESPECT"}`
    );
    this.log("TASKS", taskSummary);

    const bottom = [...ctx.bottomCombat].join(", ");
    this.log("WANTED",
      `level:${gi.wantedLevel.toFixed(4).padStart(10)}  ` +
      `penalty:${(gi.wantedPenalty * 100).toFixed(2).padStart(7)}%  ` +
      `recovery:${ctx.wantedRecovery ? "ON " : "OFF"}  ` +
      `threshold:${((1 - ctx.config.wantedPenaltyThreshold) * 100).toFixed(0)}%`
    );
    this.log("BOTTOM", bottom || "(none)");

    const territory = gi.territory * 100;
    const power     = gi.power;
    const dTerrStr  = this.prevTerritory === null ? "    --" : fmtDelta((territory - this.prevTerritory).toFixed(2), "%");
    const dPowStr   = this.prevPower     === null ? "        --" : fmtDelta(ns.format.number(power - this.prevPower, 2), "");
    this.log("TICK",
      `${String(this.tickDurationMs).padStart(5)}ms  ` +
      `Territory: ${territory.toFixed(2).padStart(6)}%  Δ${dTerrStr.padStart(9)}  ` +
      `Power: ${ns.format.number(power, 2).padStart(10)}  Δ${dPowStr.padStart(12)}`
    );
    this.prevTerritory = territory;
    this.prevPower     = power;
  }

  // ── main tick ──────────────────────────────────────────────────────────────

  async tick() {
    const ns      = this.ns;
    const ctx     = this.#computeContext();

    const gi = ctx.gangInfo;
    // only enter recovery when wanted is actually above floor — penalty of 0.5 at gang start
    // (respect=1, wanted=1) is structural, not from buildup; don't deadlock on it
    if (gi.wantedLevel > 1.01 && gi.wantedPenalty < 1 - ctx.config.wantedPenaltyThreshold) this.wantedRecovery = true;
    if (gi.wantedPenalty >= 0.99 || gi.wantedLevel <= 1.01)                                 this.wantedRecovery = false;
    ctx.wantedRecovery = this.wantedRecovery;

    this.nameIndex = recruit(ns, this.names, this.nameIndex, "port");
    this.#maybeToggleClashes(ctx);
    for (const name of ctx.members) this.#process(name, ctx);
    this.#printStatus(ctx);
    await this.#flashMob(ctx);
  }
}

export async function main(ns) {
  ns.disableLog("ALL");
  ns.ui.openTail();
  const engine = new CombatGangEngine(ns);
  // sync to gang tick cadence before entering the loop
  engine.tickDurationMs = await ns.gang.nextUpdate();
  while (true) {
    await engine.tick();
  }
}
