// Part of the engine-v2 system — engine-v2-the-boys.js: TheBoysEngine runner
import { EngineStoke }                         from "lib/engine-stoke.js";
import { combatScore, getClashWinChances }     from "lib/gang.js";
import { uiQuonfigWidth, uiEngineWidth,
         uiBatchingWidth, uiStatsWidth, uiStatsHeight,
         uiBoysWidth, uiBoysHeight,
         uiTopPadding }                        from "env.js";

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

const fmtDelta = (v, unit) => `${Number(v) >= 0 ? "+" : ""}${v}${unit}`;

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

// ── snapshot ──────────────────────────────────────────────────────────────────

function takeSnapshot(ns, tickDurationMs) {
  const gi       = ns.gang.getGangInformation();
  const winValues = Object.values(getClashWinChances(ns));
  const members  = ns.gang.getMemberNames().map(name => {
    const info = ns.gang.getMemberInformation(name);
    return {
      name,
      score: combatScore(info),
      mult:  info.str_asc_mult + info.def_asc_mult + info.dex_asc_mult + info.agi_asc_mult,
      eq:    info.upgrades.length + info.augmentations.length,
      task:  info.task,
    };
  });

  return {
    power:         gi.power,
    respect:       gi.respect,
    wanted:        gi.wantedLevel,
    penalty:       gi.wantedPenalty,
    isWarfareTick: gi.territoryWarfareEngaged,
    territory:     gi.territory * 100,
    clashesOn:     gi.territoryWarfareEngaged,
    minWin:        winValues.length > 0 ? Math.min(...winValues) : 1,
    tickDurationMs,
    memberCount:   members.length,
    members,
  };
}

// ── dashboard ─────────────────────────────────────────────────────────────────

function deltas(entries, key) {
  const out = [];
  for (let i = 1; i < entries.length; i++) out.push(entries[i][key] - entries[i - 1][key]);
  return out;
}

function printDashboard(ns, history) {
  const cur  = history.latest;
  const prev = history.prev;
  const SEP  = "─".repeat(52);

  ns.clearLog();

  const dTerr = prev === null
    ? "      --" : fmtDelta((cur.territory - prev.territory).toFixed(2), "%");
  const dPow  = prev === null
    ? "        --" : fmtDelta(ns.format.number(cur.power - prev.power, 2), "");

  ns.print(`══ THE BOYS  ${new Date().toLocaleTimeString()} ${"═".repeat(29)}`);
  ns.print(`  Members   ${cur.memberCount}/${NAMES.length}   Tick: ${String(cur.tickDurationMs).padStart(5)}ms`);
  ns.print(`  Territory ${cur.territory.toFixed(2).padStart(6)}%  Δ${dTerr.padStart(9)}   Clashes: ${cur.clashesOn ? "ON " : "OFF"}   MinWin: ${(cur.minWin * 100).toFixed(1).padStart(5)}%`);
  ns.print(`  Power     ${ns.format.number(cur.power, 2).padStart(10)}  Δ${dPow.padStart(12)}`);
  ns.print(`  Respect   ${ns.format.number(cur.respect, 2).padStart(10)}`);
  ns.print(`  Wanted    ${cur.wanted.toFixed(4).padStart(8)}   Penalty: ${(cur.penalty * 100).toFixed(2).padStart(6)}%`);

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
  ns.print(`  ${"MEMBER".padEnd(15)} ${"SCORE".padStart(7)}  ${"MULT".padStart(6)}  ${"EQ".padStart(3)}  TASK`);
  for (const m of cur.members) {
    ns.print(`  ${m.name.padEnd(15)} ${String(m.score).padStart(7)}  ${m.mult.toFixed(2).padStart(6)}  ${String(m.eq).padStart(3)}  ${m.task}`);
  }
}

// ── Engine ────────────────────────────────────────────────────────────────────

class TheBoysEngine extends EngineStoke {
  constructor(ns) {
    super(ns, "the-boys");
    this.tickDurationMs = null;
    this.tickStartTime  = null;
    this.history        = new TickHistory(60);
  }

  async tick() {
    const ns = this.ns;
    this.history.push(takeSnapshot(ns, this.tickDurationMs));
    printDashboard(ns, this.history);
    this.tickDurationMs = await ns.gang.nextUpdate();
    this.tickStartTime  = Date.now();
  }
}

// ── init ──────────────────────────────────────────────────────────────────────

function initBoysWindowSetup(ns) {
  ns.disableLog("ALL");
  const W = ns.ui.windowSize()[0];
  const x = W - uiQuonfigWidth - uiEngineWidth - uiBatchingWidth - uiStatsWidth - 3;
  const y = uiTopPadding + uiStatsHeight;
  ns.ui.openTail();
  ns.ui.resizeTail(uiBoysWidth, uiBoysHeight);
  ns.ui.moveTail(x, y);
}

export async function main(ns) {
  initBoysWindowSetup(ns);
  const engine = new TheBoysEngine(ns);
  engine.tickDurationMs = await ns.gang.nextUpdate();
  engine.tickStartTime  = Date.now();
  while (true) {
    await engine.tick();
  }
}
