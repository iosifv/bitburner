// Part of the engine-v2 system — engine-v2-stats.js: StatsEngine dashboard
import { EngineStoke }                           from "lib/engine-stoke.js";
import { sampleStats, updateProfits, sparkline } from "lib/stats.js";
import { uiEngineWidth, uiQuonfigWidth,
         uiBatchingWidth,
         uiStatsWidth, uiStatsHeight,
         uiTopPadding }                          from "./quonfig.js";

const STATE_FILE   = "stats.json";
const PROFITS_FILE = "profits.json";
const HISTORY_CAP  = 120; // ~4 min at 2s cadence

class StatsEngine extends EngineStoke {
  constructor(ns) {
    super(ns, "stats");
    this.history = [];
    this.profits = { installEpoch: 0, byTarget: {}, peakPerSec: 0 };

    const raw = ns.read(STATE_FILE);
    if (raw && raw !== "NULL PORT DATA") {
      try { this.history = JSON.parse(raw); } catch {}
    }

    const rawP = ns.read(PROFITS_FILE);
    if (rawP && rawP !== "NULL PORT DATA") {
      try { this.profits = JSON.parse(rawP); } catch {}
    }
  }

  async tick() {
    const ns           = this.ns;
    const sample       = sampleStats(ns);
    const installEpoch = ns.getResetInfo().lastAugReset;

    updateProfits(this.profits, sample, installEpoch);
    ns.write(PROFITS_FILE, JSON.stringify(this.profits), "w");

    this.history.push(sample);
    if (this.history.length > HISTORY_CAP) this.history.splice(0, this.history.length - HISTORY_CAP);
    ns.write(STATE_FILE, JSON.stringify(this.history), "w");

    let batcherState = null;
    try {
      const raw = ns.read("batcher-state.json");
      if (raw && raw !== "NULL PORT DATA") batcherState = JSON.parse(raw);
    } catch {}

    const moneySources = ns.getMoneySources()?.sinceInstall ?? {};
    this.#printDashboard(sample, batcherState, moneySources);
  }

  #printDashboard(sample, batcherState, moneySources) {
    const ns  = this.ns;
    const SEP = "─".repeat(52);
    ns.clearLog();

    const SOURCE_KEYS = ["hacking", "hacknet", "gang", "crime", "work", "codingcontract", "infiltration", "stock", "bladeburner", "corporation", "sleeves", "other"];
    const activeSources = SOURCE_KEYS
      .map(k => ({ k, v: moneySources[k] ?? 0 }))
      .filter(({ v }) => v > 0)
      .sort((a, b) => b.v - a.v);

    ns.print(`══ STATS  ${new Date().toLocaleTimeString()} ${"═".repeat(31)}`);
    ns.print(`  Income   ${ns.format.number(sample.incomePerSec).padStart(10)}/sec   Peak: ${ns.format.number(this.profits.peakPerSec ?? 0).padStart(10)}/sec`);
    ns.print(`  Balance  ${ns.format.number(sample.playerMoney).padStart(10)}   Target: ${sample.target ?? "(none)"}`);
    ns.print(SEP);

    ns.print(`  Since install:`);
    for (let i = 0; i < activeSources.length; i += 2) {
      const a = activeSources[i];
      const b = activeSources[i + 1];
      const left  = `${a.k.padEnd(14)} ${ns.format.number(a.v).padStart(10)}`;
      const right = b ? `   ${b.k.padEnd(14)} ${ns.format.number(b.v).padStart(10)}` : "";
      ns.print(`    ${left}${right}`);
    }
    ns.print(SEP);

    const window  = this.history.map(s => s.incomePerSec).slice(-40);
    const peak    = this.profits.peakPerSec ?? 0;
    const avg     = window.length ? window.reduce((s, v) => s + v, 0) / window.length : 0;
    const min     = window.length ? Math.min(...window) : 0;
    const fmt     = v => ns.format.number(v).padStart(10);
    ns.print(`  $/sec  now:${fmt(sample.incomePerSec)}  avg:${fmt(avg)}  min:${fmt(min)}  peak:${fmt(peak)}`);
    ns.print(`  trend  ${sparkline(window, peak || undefined)}`);
    ns.print(SEP);

    if (batcherState) {
      const age = ((Date.now() - batcherState.ts) / 1000).toFixed(0);
      ns.print(`  Batcher  ${batcherState.phase.padEnd(10)} ${batcherState.message}  (${age}s ago)`);
      ns.print(SEP);
    }

    const entries = Object.entries(this.profits.byTarget ?? {})
      .sort((a, b) => b[1].peakPerSec - a[1].peakPerSec);

    if (entries.length) {
      ns.print(`  ${"TARGET".padEnd(22)} ${"PEAK $/sec".padStart(12)}  ${"TICKS".padStart(6)}`);
      for (const [name, d] of entries) {
        ns.print(`  ${name.padEnd(22)} ${ns.format.number(d.peakPerSec).padStart(12)}  ${String(d.ticks).padStart(6)}`);
      }
    } else {
      ns.print("  No target data yet.");
    }
  }
}

export async function main(ns) {
  ns.disableLog("ALL");
  ns.ui.openTail();
  ns.ui.resizeTail(uiStatsWidth, uiStatsHeight);
  ns.ui.moveTail(ns.ui.windowSize()[0] - uiQuonfigWidth - uiEngineWidth - uiBatchingWidth - uiStatsWidth - 3, uiTopPadding);
  const engine = new StatsEngine(ns);
  while (true) {
    await engine.tick();
    await ns.sleep(engine.loopDelay);
  }
}
