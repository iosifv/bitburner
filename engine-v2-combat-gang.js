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
  shouldRun: (ctx, info) => ctx.vigilanteSquad.has(info.name),
  task:      ()          => "Vigilante Justice",
};

const TRAIN_MIN_SCORE = 600;

const STATE_TRAIN_BOTTOM = {
  name: "TRAIN-BOTTOM",
  shouldRun: (ctx, info) => {
    // Always train members too weak to contribute — including just-ascended members
    if (combatScore(info) < TRAIN_MIN_SCORE) return true;
    // Full-gang rotation: train the weakest N members
    return !ctx.notFullCapacity && ctx.bottomCombat.has(info.name);
  },
  task: () => "Train Combat",
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

// When not at full capacity, avoid Terrorism — its wanted spike cancels respect
// at small gang sizes. Use the gentler score ladder; allow HT only at high scores.
const STATE_RECRUIT_PUSH = {
  name: "RECRUIT-PUSH",
  shouldRun: (ctx, info) => ctx.notFullCapacity && combatScore(info) >= 200,
  task: (ctx, info) => {
    const score = combatScore(info);
    if (score < 600)  return "Mug People";
    if (score < 1200) return "Armed Robbery";
    if (score < 1800) return "Traffick Illegal Arms";
    return "Human Trafficking";
  },
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
  STATE_RECRUIT_PUSH,
  STATE_RESPECT,
  STATE_MONEY_LADDER,
];

// ── Engine ────────────────────────────────────────────────────────────────────

class CombatGangEngine extends EngineStoke {
  constructor(ns) {
    super(ns, "combat-gang");
    this.names          = NAMES;
    this.nameIndex      = ns.gang.getMemberNames().length;
    this.vigilanteSize   = 0;
    this.prevWanted      = null;
    this.tickDurationMs  = 2000;
    this.tickStartTime   = Date.now();
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
    const notFullCapacity = members.length < NAMES.length;

    this.#updateVigilanteSize(gangInfo, members.length, cfg, notFullCapacity);

    const scored = members
      .map(n => ({ name: n, score: combatScore(infoMap[n]) }))
      .sort((a, b) => a.score - b.score);
    const bottomN        = Math.min(cfg.trainBottomN, members.length);
    const bottomCombat   = new Set(scored.slice(0, bottomN).map(x => x.name));
    const vigilanteSquad = new Set(
      scored.slice().reverse().slice(0, this.vigilanteSize).map(x => x.name)
    );

    const winChances = getClashWinChances(ns);
    const winValues  = Object.values(winChances);
    const minWin     = winValues.length > 0 ? Math.min(...winValues) : 1;

    return {
      gangInfo, members, infoMap, bottomCombat, vigilanteSquad,
      wantMoney: gangInfo.respect >= cfg.respectThreshold,
      notFullCapacity,
      winChances, minWin,
      clashesOn: gangInfo.territoryWarfareEngaged,
      config: cfg,
    };
  }

  // ── vigilante controller ───────────────────────────────────────────────────

  #updateVigilanteSize(gi, memberCount, cfg, notFullCapacity = false) {
    const triggerEff  = 1 - cfg.wantedPenaltyThreshold;
    const healthyEff  = 0.99;
    const atFloor     = gi.wantedLevel <= 1.01;
    // When not at full capacity always keep at least 2 members earning respect
    const maxVigilante = notFullCapacity ? Math.max(0, memberCount - 2) : memberCount;

    if (atFloor || gi.wantedPenalty >= healthyEff) {
      this.vigilanteSize = Math.max(0, this.vigilanteSize - 1);
    } else if (gi.wantedPenalty < triggerEff) {
      const rising = this.prevWanted !== null && gi.wantedLevel > this.prevWanted;
      if (this.vigilanteSize === 0)  this.vigilanteSize = 1;
      else if (rising)               this.vigilanteSize = Math.min(maxVigilante, this.vigilanteSize + 1);
      // falling / steady → hold
    }
    // clamp immediately in case notFullCapacity just became true
    this.vigilanteSize = Math.min(this.vigilanteSize, maxVigilante);
    // penalty in [triggerEff, healthyEff) → hold (hysteresis band)
    this.prevWanted = gi.wantedLevel;
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
    const a = this.ns.gang.getAscensionResult(info.name);
    if (!a) return true;
    const nextMax = Math.max(a.str ?? 0, a.def ?? 0, a.dex ?? 0, a.agi ?? 0);
    return nextMax < (t - margin);
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
        setTask(this.ns, info, state.task(ctx, info));
        return;
      }
    }
  }

  // ── flash-mob warfare burst ────────────────────────────────────────────────

  async #flashMob(ctx) {
    const margin  = ctx.config.flashMobMarginMs;
    const elapsed = Date.now() - this.tickStartTime;
    await this.ns.sleep(Math.max(0, this.tickDurationMs - margin - elapsed));

    // Skip territory warfare when not at full capacity — the tick snapshot would
    // see Territory Warfare and generate zero respect, stalling recruitment.
    if (!ctx.notFullCapacity) {
      for (const name of ctx.members) {
        const info = ctx.infoMap[name];
        if (ctx.vigilanteSquad.has(name)) continue;
        if (ctx.clashesOn && info.def < ctx.config.clashMinDefense) continue;
        this.ns.gang.setMemberTask(name, "Territory Warfare");
      }
    }

    this.tickDurationMs = await this.ns.gang.nextUpdate();
    this.tickStartTime  = Date.now();
  }

  // ── dashboard ──────────────────────────────────────────────────────────────

  #printDashboard(ctx) {
    const ns  = this.ns;
    const gi  = ctx.gangInfo;
    const cfg = ctx.config;
    const SEP = "─".repeat(52);

    ns.clearLog();

    const time      = new Date().toLocaleTimeString();
    const territory = gi.territory * 100;
    const power     = gi.power;
    const dTerr     = this.prevTerritory === null
      ? "      --" : fmtDelta((territory - this.prevTerritory).toFixed(2), "%");
    const dPow      = this.prevPower === null
      ? "        --" : fmtDelta(ns.format.number(power - this.prevPower, 2), "");

    ns.print(`══ COMBAT GANG  ${time} ${"═".repeat(28)}`);
    ns.print(`  Members   ${ctx.members.length}/${NAMES.length}   Mode: ${ctx.wantMoney ? "MONEY  " : "RESPECT"}   Tick: ${String(this.tickDurationMs).padStart(5)}ms`);
    ns.print(`  Territory ${territory.toFixed(2).padStart(6)}%  Δ${dTerr.padStart(9)}   Clashes: ${ctx.clashesOn ? "ON " : "OFF"}   MinWin: ${(ctx.minWin * 100).toFixed(1).padStart(5)}%`);
    ns.print(`  Power     ${ns.format.number(power, 2).padStart(10)}  Δ${dPow.padStart(12)}`);
    ns.print(`  Respect   ${ns.format.number(gi.respect, 2).padStart(10)}   Floor: ${ns.format.number(cfg.terrorismRespectFloor, 2).padStart(10)}   Thresh: ${ns.format.number(cfg.respectThreshold, 2).padStart(10)}`);
    ns.print(`  Wanted    ${gi.wantedLevel.toFixed(4).padStart(8)}   Penalty: ${(gi.wantedPenalty * 100).toFixed(2).padStart(6)}%   Squad: ${this.vigilanteSize}`);
    ns.print(SEP);

    const taskCounts = {};
    for (const name of ctx.members) {
      const task = ctx.infoMap[name].task;
      taskCounts[task] = (taskCounts[task] ?? 0) + 1;
    }
    ns.print(`  Tasks     ${Object.entries(taskCounts).map(([t, c]) => `${t}: ${c}`).join("  ")}`);
    ns.print(`  Training  ${[...ctx.bottomCombat].join(", ") || "(none)"}`);
    ns.print(SEP);

    ns.print(`  ${"MEMBER".padEnd(15)} ${"SCORE".padStart(7)}  ${"MULT".padStart(6)}  ${"ASC".padStart(5)}  ${"EQ".padStart(3)}  ${"STATE".padEnd(14)}  TASK`);
    for (const name of ctx.members) {
      const info   = ctx.infoMap[name];
      const state  = MEMBER_TASK_STATES.find(s => s.shouldRun(ctx, info))?.name ?? "?";
      const mult   = (info.str_asc_mult + info.def_asc_mult + info.dex_asc_mult + info.agi_asc_mult).toFixed(2);
      const asc    = ns.gang.getAscensionResult(name);
      const ascStr = asc
        ? (info.str_asc_mult * (asc.str - 1) + info.def_asc_mult * (asc.def - 1) +
           info.dex_asc_mult * (asc.dex - 1) + info.agi_asc_mult * (asc.agi - 1)).toFixed(2)
        : "  --";
      const eq     = info.upgrades.length + info.augmentations.length;
      ns.print(`  ${name.padEnd(15)} ${String(combatScore(info)).padStart(7)}  ${mult.padStart(6)}  ${ascStr.padStart(5)}  ${String(eq).padStart(3)}  ${state.padEnd(14)}  ${info.task}`);
    }

    this.prevTerritory = territory;
    this.prevPower     = power;
  }

  // ── main tick ──────────────────────────────────────────────────────────────

  async tick() {
    const ns      = this.ns;
    const ctx     = this.#computeContext();

    this.nameIndex = recruit(ns, this.names, this.nameIndex, "port");
    this.#maybeToggleClashes(ctx);
    for (const name of ctx.members) this.#process(name, ctx);
    this.#printDashboard(ctx);
    await this.#flashMob(ctx);
  }
}

export async function main(ns) {
  ns.disableLog("ALL");
  ns.ui.openTail();
  const engine = new CombatGangEngine(ns);
  // sync to gang tick cadence before entering the loop
  engine.tickDurationMs = await ns.gang.nextUpdate();
  engine.tickStartTime  = Date.now();
  while (true) {
    await engine.tick();
  }
}
