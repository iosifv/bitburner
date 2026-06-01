// Part of the engine-v2 system — engine-v2-the-boys.js: TheBoysEngine runner
import { EngineStoke }                         from "lib/engine-stoke.js";
import { combatScore, getClashWinChances }     from "lib/gang.js";
import { uiQuonfigWidth, uiEngineWidth,
         uiBatchingWidth, uiStatsWidth, uiStatsHeight,
         uiBoysWidth, uiBoysHeight,
         uiTopPadding }                        from "./quonfig.js";

const NAMES = [
  "Homelander",  "Billy Butcher",
  "Soldier Boy", "Mother's Milk",
  "The Deep",    "Starlight",
  "A-Train",     "Hughie",
  "Black Noir",  "Frenchie",
  "Stormfront",  "Kimiko",
];

const fmtDelta = (v, unit) => `${Number(v) >= 0 ? "+" : ""}${v}${unit}`;

// ── Engine ────────────────────────────────────────────────────────────────────

class TheBoysEngine extends EngineStoke {
  constructor(ns) {
    super(ns, "the-boys");
    this.tickDurationMs = 2000;
    this.tickStartTime  = Date.now();
    this.prevTerritory  = null;
    this.prevPower      = null;
  }

  // ── dashboard ──────────────────────────────────────────────────────────────

  #printDashboard() {
    const ns      = this.ns;
    const gi      = ns.gang.getGangInformation();
    const members = ns.gang.getMemberNames();
    const infoMap = Object.fromEntries(members.map(n => [n, ns.gang.getMemberInformation(n)]));
    const SEP     = "─".repeat(52);

    ns.clearLog();

    const time      = new Date().toLocaleTimeString();
    const territory = gi.territory * 100;
    const power     = gi.power;
    const winValues = Object.values(getClashWinChances(ns));
    const minWin    = winValues.length > 0 ? Math.min(...winValues) : 1;
    const dTerr     = this.prevTerritory === null
      ? "      --" : fmtDelta((territory - this.prevTerritory).toFixed(2), "%");
    const dPow      = this.prevPower === null
      ? "        --" : fmtDelta(ns.format.number(power - this.prevPower, 2), "");

    ns.print(`══ THE BOYS  ${time} ${"═".repeat(29)}`);
    ns.print(`  Members   ${members.length}/${NAMES.length}   Tick: ${String(this.tickDurationMs).padStart(5)}ms`);
    ns.print(`  Territory ${territory.toFixed(2).padStart(6)}%  Δ${dTerr.padStart(9)}   Clashes: ${gi.territoryWarfareEngaged ? "ON " : "OFF"}   MinWin: ${(minWin * 100).toFixed(1).padStart(5)}%`);
    ns.print(`  Power     ${ns.format.number(power, 2).padStart(10)}  Δ${dPow.padStart(12)}`);
    ns.print(`  Respect   ${ns.format.number(gi.respect, 2).padStart(10)}`);
    ns.print(`  Wanted    ${gi.wantedLevel.toFixed(4).padStart(8)}   Penalty: ${(gi.wantedPenalty * 100).toFixed(2).padStart(6)}%`);
    ns.print(SEP);

    ns.print(`  ${"MEMBER".padEnd(15)} ${"SCORE".padStart(7)}  ${"MULT".padStart(6)}  ${"EQ".padStart(3)}  TASK`);
    for (const name of members) {
      const info = infoMap[name];
      const mult = (info.str_asc_mult + info.def_asc_mult + info.dex_asc_mult + info.agi_asc_mult).toFixed(2);
      const eq   = info.upgrades.length + info.augmentations.length;
      ns.print(`  ${name.padEnd(15)} ${String(combatScore(info)).padStart(7)}  ${mult.padStart(6)}  ${String(eq).padStart(3)}  ${info.task}`);
    }

    this.prevTerritory = territory;
    this.prevPower     = power;
  }

  // ── main tick ──────────────────────────────────────────────────────────────

  async tick() {
    this.#printDashboard();
    this.tickDurationMs = await this.ns.gang.nextUpdate();
    this.tickStartTime  = Date.now();
  }
}

export async function main(ns) {
  ns.disableLog("ALL");
  ns.ui.openTail();
  ns.ui.resizeTail(uiBoysWidth, uiBoysHeight);
  const W   = ns.ui.windowSize()[0];
  const x   = W - uiQuonfigWidth - uiEngineWidth - uiBatchingWidth - uiStatsWidth - 3;
  const y   = uiTopPadding + uiStatsHeight;
  ns.ui.moveTail(x + Math.floor((uiStatsWidth - uiBoysWidth) / 2), y);
  const engine = new TheBoysEngine(ns);
  engine.tickDurationMs = await ns.gang.nextUpdate();
  engine.tickStartTime  = Date.now();
  while (true) {
    await engine.tick();
  }
}
