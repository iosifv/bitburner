// Part of the engine-v2 system — engine-v2-the-boys.js: TheBoysEngine runner
import { EngineStoke }                                          from "lib/engine-stoke.js";
import { renameMembers, recruit, setTask,
         setTerritoryWarfare, getClashWinChances,
         getMaxRivalPower, WarfareTicker,
         getMemberAvgCombatStats, getMemberAvgMultiplierCombatStats,
         getMemberAvgAscensionCombatStats }                     from "lib/gang.js";
import { getConfig }                                            from "lib/quonfig.js";
import { uiQuonfigWidth, uiEngineWidth,
         uiBatchingWidth, uiBoysWidth, uiBoysHeight,
         uiTopPadding }                                         from "env.js";

const RESPECT_THRESHOLD       = 2_000_000;
const TERRORISM_RESPECT_FLOOR = 100_000;
const CLASH_ENABLE_WIN        = 0.55;
const CLASH_DISABLE_WIN       = 0.50;
const CLASH_MIN_DEFENSE       = 300;
const FLASH_MOB_MARGIN_MS     = 250;
const VIGILANTE_RESPONSE      = 3;
const ASCENSION_THRESHOLD     = 1.2;
const ASCENSION_EQUIP_MARGIN  = 0.15;
const TRAIN_WIN_CAP           = 0.75;  // stop rotation training once min clash win >= this
const TRAIN_GAP_RATIO         = 0.10;  // only rotate members ≥10% below gang average
const BUY_ALL_EQUIP_THRESHOLD = 1e12;  // buy all equipment types (incl. hacking) above this money

const fmtDelta = (v, unit) => `${Number(v) >= 0 ? "+" : ""}${v}${unit}`;

const NAMES = [
  "Homelander",  "Billy Butcher",
  "Soldier Boy", "Mother's Milk",
  "The Deep",    "Starlight",
  "A-Train",     "Hughie",
  "Black Noir",  "Frenchie",
  "Stormfront",  "Kimiko",
];

const GREEN = "\x1b[32m";
const RED   = "\x1b[31m";
const RESET = "\x1b[0m";

// ── Task-selection states (cortex pattern) ────────────────────────────────────
// Ordered priority list — first state whose shouldRun returns true wins.
// Each entry: { name, shouldRun(ctx, info), task(ctx, info) }

const STATE_VIGILANTE = {
  name: "JUSTICE",
  shouldRun: (ctx, info) => ctx.vigilanteSquad.has(info.name),
  task:      ()          => "Vigilante Justice",
};

const TRAIN_MIN_STAT = 150;   // average of 4 combat stats (≡ old sum threshold 600 ÷ 4)

const STATE_TRAIN_BOTTOM = {
  name: "TRAIN",
  shouldRun: (ctx, info) => {
    // Always train members too weak to contribute — including just-ascended members
    if (getMemberAvgCombatStats(ctx.gang, info.name) < TRAIN_MIN_STAT) return true;
    // Full-gang rotation: train members lagging behind, but not when gang is already dominant
    return !ctx.notFullCapacity && ctx.minWin < TRAIN_WIN_CAP && ctx.belowAvg.has(info.name);
  },
  task: () => "Train Combat",
};

// When not at full capacity, avoid Terrorism — its wanted spike cancels respect
// at small gang sizes. Use the gentler stat ladder; allow HT only at high stats.
const STATE_GROW = {
  name: "GROW",
  shouldRun: (ctx, info) => ctx.notFullCapacity &&
                             getMemberAvgCombatStats(ctx.gang, info.name) >= 50,
  task: (ctx, info) => {
    const stat = getMemberAvgCombatStats(ctx.gang, info.name);
    if (stat < 225) return "Mug People";
    if (stat < 300) return "Armed Robbery";
    if (stat < 450) return "Traffick Illegal Arms";
    return "Human Trafficking";
  },
};


// Fallthrough: single earning task while the state machine is still growing.
const STATE_EARN = {
  name: "EARN",
  shouldRun: () => true,
  task:      () => "Human Trafficking",
};

const MEMBER_TASK_STATES = [
  STATE_VIGILANTE,
  STATE_TRAIN_BOTTOM,
  STATE_GROW,
  STATE_EARN,
];

// ── TickHistory ───────────────────────────────────────────────────────────────

class TickHistory {
  #capacity;
  #entries = [];

  constructor(capacity = 30) {
    this.#capacity = capacity;
  }

  push(snapshot) {
    this.#entries.push(snapshot);
    if (this.#entries.length > this.#capacity) this.#entries.shift();
  }

  get entries()  { return this.#entries; }
  get latest()   { return this.#entries.at(-1) ?? null; }
  get prev()     { return this.#entries.at(-2) ?? null; }
  get length()   { return this.#entries.length; }
  get isFull()   { return this.#entries.length === this.#capacity; }
}

// ── sparkline helpers ─────────────────────────────────────────────────────────

function changeBar(values, posChar = "↗", negChar = "↘", noneChar = " ") {
  return values.map(v => v > 0 ? posChar : v < 0 ? negChar : noneChar).join("");
}

function deltaSparkline(values) {
  const max  = Math.max(...values.map(Math.abs));
  const BARS = " ▁▂▃▄▅▆▇█";
  return values
    .map(v => {
      const bar   = BARS[max > 0 ? Math.min(8, Math.round((Math.abs(v) / max) * 8)) : 0];
      const color = v > 0 ? GREEN : v < 0 ? RED : RESET;
      return `${color}${bar}${RESET}`;
    })
    .join("");
}

function deltas(entries, key) {
  const out = [];
  for (let i = 1; i < entries.length; i++) out.push(entries[i][key] - entries[i - 1][key]);
  return out;
}

// ── Engine ────────────────────────────────────────────────────────────────────

class TheBoysEngine extends EngineStoke {
  constructor(ns) {
    super(ns, "the-boys");
    this.names          = NAMES;
    this.nameIndex      = ns.gang.getMemberNames().length;
    this.vigilanteSize  = 0;
    this.tickDurationMs = 2000;
    this.tickStartTime  = Date.now();
    this.prevTerritory  = null;
    this.prevPower      = null;
    this.history        = new TickHistory(60);
    this.ticker         = new WarfareTicker();
    renameMembers(ns, NAMES);
  }

  get config() {
    const ns = this.ns;
    return {
      respectThreshold:       RESPECT_THRESHOLD,
      buyEquipment:           getConfig(ns, "gang-buy-equipment"),
      terrorismRespectFloor:  TERRORISM_RESPECT_FLOOR,
      clashEnableWinChance:   CLASH_ENABLE_WIN,
      clashDisableWinChance:  CLASH_DISABLE_WIN,
      clashMinDefense:        CLASH_MIN_DEFENSE,
      flashMobMarginMs:       FLASH_MOB_MARGIN_MS,
    };
  }

  // ── global context ─────────────────────────────────────────────────────────

  #computeContext() {
    const ns       = this.ns;
    const cfg      = this.config;
    const gangInfo = ns.gang.getGangInformation();
    const members  = ns.gang.getMemberNames();
    const infoMap  = Object.fromEntries(members.map(n => [n, ns.gang.getMemberInformation(n)]));
    const notFullCapacity = members.length < NAMES.length;

    // Warfare-tick detection: observe rival power each tick to learn the
    // global territory-tick period/phase without any earnings warm-up.
    this.ticker.observe(getMaxRivalPower(ns));

    this.#updateVigilanteSize(gangInfo, members.length, notFullCapacity);

    const scored = members
      .map(n => ({ name: n, score: getMemberAvgCombatStats(ns.gang, n) }))
      .sort((a, b) => a.score - b.score);
    const avgStat      = scored.reduce((s, m) => s + m.score, 0) / scored.length;
    const belowAvg     = new Set(scored.filter(m => m.score < avgStat * (1 - TRAIN_GAP_RATIO)).map(m => m.name));
    const vigilanteSquad = new Set(
      scored.slice().reverse().slice(0, this.vigilanteSize).map(x => x.name)
    );

    const winChances = getClashWinChances(ns);
    const winValues  = Object.values(winChances);
    const minWin     = winValues.length > 0 ? Math.min(...winValues) : 1;

    // Snapshot for the history dashboard — isWarfareTick is the REAL cadence
    // (rival power changed this tick) rather than just "clashes engaged".
    this.history.push({
      power:         gangInfo.power,
      respect:       gangInfo.respect,
      wanted:        gangInfo.wantedLevel,
      penalty:       gangInfo.wantedPenalty,
      isWarfareTick: this.ticker.lastTickWasWarfare,
      territory:     gangInfo.territory * 100,
      clashesOn:     gangInfo.territoryWarfareEngaged,
      minWin,
      tickDurationMs: this.tickDurationMs,
      memberCount:   members.length,
      members: members.map(name => {
        const info = infoMap[name];
        return {
          name,
          score: getMemberAvgCombatStats(ns.gang, name),
          mult:  info.str_asc_mult + info.def_asc_mult + info.dex_asc_mult + info.agi_asc_mult,
          eq:    info.upgrades.length + info.augmentations.length,
          task:  info.task,
        };
      }),
    });

    return {
      gangInfo, members, infoMap, belowAvg, vigilanteSquad,
      wantMoney: gangInfo.respect >= cfg.respectThreshold,
      notFullCapacity,
      winChances, minWin,
      clashesOn: gangInfo.territoryWarfareEngaged,
      config: cfg,
      gang: ns.gang,
    };
  }

  // ── vigilante controller ───────────────────────────────────────────────────

  #updateVigilanteSize(gi, memberCount, notFullCapacity = false) {
    // Proportional sizing: target = memberCount × deficit × VIGILANTE_RESPONSE.
    // "Deficit" is how far the wanted penalty is below 100% efficiency.
    // VIGILANTE_RESPONSE=3 means a 10% deficit (~90% penalty) targets ~2 vigilantes
    // for a 6-member gang, scaling naturally with gang size and penalty severity.
    // When not at full capacity keep at least 2 members earning respect.
    const maxVigilante = Math.max(0, memberCount - 2);

    if (gi.wantedLevel <= 1.01) {
      this.vigilanteSize = 0;
      return;
    }

    const deficit      = 1 - gi.wantedPenalty;
    const target       = Math.min(maxVigilante, Math.round(memberCount * deficit * VIGILANTE_RESPONSE));
    this.vigilanteSize = target;
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
    const avg = getMemberAvgAscensionCombatStats(this.ns.gang, name);
    return avg >= ASCENSION_THRESHOLD;
  }

  #shouldEquip(info) {
    if (!this.config.buyEquipment) return false;
    const avg = getMemberAvgAscensionCombatStats(this.ns.gang, info.name);
    // avg === 0 means no ascension available yet → safe to equip
    return avg < (ASCENSION_THRESHOLD - ASCENSION_EQUIP_MARGIN);
  }

  #ascend(name) {
    const a = this.ns.gang.getAscensionResult(name);
    if (!a) return;
    this.ns.gang.ascendMember(name);
    this.log("ASCEND", `${name.padEnd(15)} str:x${a.str.toFixed(2)}  def:x${a.def.toFixed(2)}  dex:x${a.dex.toFixed(2)}  agi:x${a.agi.toFixed(2)}`);
  }

  #equip(name, info) {
    const ns      = this.ns;
    const money   = ns.getPlayer().money;
    const buyAll  = money >= BUY_ALL_EQUIP_THRESHOLD;
    for (const eq of ns.gang.getEquipmentNames()) {
      if (info.upgrades.includes(eq) || info.augmentations.includes(eq)) continue;
      if (!buyAll && !["Weapon", "Armor", "Vehicle", "Augmentation"].includes(ns.gang.getEquipmentType(eq))) continue;
      if (ns.gang.getEquipmentCost(eq) > money) continue;
      ns.gang.purchaseEquipment(name, eq);
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

  // ── warfare-aware advance ──────────────────────────────────────────────────
  // flashMob fires only when the NEXT tick is predicted to be a warfare tick
  // (or while the ticker is still learning the cadence, to be safe).
  // Members are reassigned back to their state tasks by #process() on the next tick.

  async #advance(ctx) {
    const ticker    = this.ticker;
    const doFlashMob = ticker.isNextTickWarfare() || !ticker.ready;

    if (doFlashMob) {
      const margin  = ctx.config.flashMobMarginMs;
      const elapsed = Date.now() - this.tickStartTime;
      await this.ns.sleep(Math.max(0, this.tickDurationMs - margin - elapsed));

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
    const ns      = this.ns;
    const history = this.history;
    const cur     = history.latest;
    const gi      = ctx.gangInfo;
    const ticker  = this.ticker;
    const SEP     = "─".repeat(52);

    ns.clearLog();

    const territory = gi.territory * 100;
    const power     = gi.power;
    const dTerr     = this.prevTerritory === null
      ? "      --" : fmtDelta((territory - this.prevTerritory).toFixed(2), "%");
    const dPow      = this.prevPower === null
      ? "        --" : fmtDelta(ns.format.number(power - this.prevPower, 2), "");

    const tickerLine = ticker.ready
      ? `P=${String(ticker.period).padStart(2)}  in ${String(ticker.countdown).padStart(2)}  ${ticker.isNextTickWarfare() ? `${GREEN}FLASH NEXT${RESET}` : "waiting   "}`
      : `learning (${this.history.length} ticks)...`;

    ns.print(`══ THE BOYS  ${new Date().toLocaleTimeString()} ${"═".repeat(29)}`);
    ns.print(`  Members   ${cur.memberCount}/${NAMES.length}   Tick: ${String(cur.tickDurationMs).padStart(5)}ms`);
    ns.print(`  Territory ${territory.toFixed(2).padStart(6)}%  Δ${dTerr.padStart(9)}   Clashes: ${ctx.clashesOn ? "ON " : "OFF"}   MinWin: ${(ctx.minWin * 100).toFixed(1).padStart(5)}%`);
    ns.print(`  Power     ${ns.format.number(power, 2).padStart(10)}  Δ${dPow.padStart(12)}`);
    ns.print(`  Respect   ${ns.format.number(gi.respect, 2).padStart(10)}`);
    ns.print(`  Wanted    ${gi.wantedLevel.toFixed(4).padStart(8)}   Penalty: ${(gi.wantedPenalty * 100).toFixed(2).padStart(6)}%   Squad: ${this.vigilanteSize}`);
    ns.print(`  Warfare   ${tickerLine}`);

    if (history.length > 1) {
      const window  = history.entries.slice(-40);
      const dPower  = deltas(window, "power");
      const dResp   = deltas(window, "respect");
      const warfare = window.map(e => e.isWarfareTick ? "█" : "░").join("");
      ns.print(SEP);
      ns.print(`  Δ power   ${changeBar(dPower, "↗", "↘")}`);
      ns.print(`  Δ respect ${deltaSparkline(dResp)}`);
      ns.print(`  warfare   ${warfare}`);
    }

    ns.print(SEP);
    ns.print(`  ${"MEMBER".padEnd(15)} ${"STAT".padStart(6)}  ${"MULT".padStart(6)}  ${"ASC".padStart(4)}  ${"EQ".padStart(3)}    ${"STATE".padEnd(8)}  TASK`);
    for (const name of ctx.members) {
      const info      = ctx.infoMap[name];
      const state     = MEMBER_TASK_STATES.find(s => s.shouldRun(ctx, info))?.name ?? "?";
      const stat      = Math.round(getMemberAvgCombatStats(ns.gang, name));
      const mult      = getMemberAvgMultiplierCombatStats(ns.gang, name).toFixed(2);
      const asc       = getMemberAvgAscensionCombatStats(ns.gang, name).toFixed(2);
      const eq        = info.upgrades.length + info.augmentations.length;
      const willFlash = !ctx.vigilanteSquad.has(name) &&
                        !(ctx.clashesOn && info.def < ctx.config.clashMinDefense);
      ns.print(`  ${name.padEnd(15)} ${String(stat).padStart(6)}  ${mult.padStart(6)}  ${asc.padStart(4)}  ${String(eq).padStart(3)}  ${willFlash ? "⚡" : " "} ${state.padEnd(8)}  ${info.task}`);
    }

    this.prevTerritory = territory;
    this.prevPower     = power;
  }

  // ── main tick ──────────────────────────────────────────────────────────────

  async tick() {
    const ns  = this.ns;
    const ctx = this.#computeContext();

    this.nameIndex = recruit(ns, this.names, this.nameIndex);
    this.#maybeToggleClashes(ctx);
    for (const name of ctx.members) this.#process(name, ctx);
    this.#printDashboard(ctx);
    await this.#advance(ctx);
  }
}

// ── init ──────────────────────────────────────────────────────────────────────

function initBoysWindowSetup(ns) {
  ns.disableLog("ALL");
  const W = ns.ui.windowSize()[0];
  const x = W - uiQuonfigWidth - uiEngineWidth - uiBatchingWidth - uiBoysWidth - 3;
  const y = uiTopPadding;
  ns.ui.openTail();
  ns.ui.resizeTail(uiBoysWidth, uiBoysHeight);
  ns.ui.moveTail(x, y);
}

export async function main(ns) {
  initBoysWindowSetup(ns);
  ns.atExit(() => ns.ui.closeTail());
  const engine = new TheBoysEngine(ns);
  // sync to gang tick cadence before entering the loop
  engine.tickDurationMs = await ns.gang.nextUpdate();
  engine.tickStartTime  = Date.now();
  while (true) {
    await engine.tick();
  }
}
