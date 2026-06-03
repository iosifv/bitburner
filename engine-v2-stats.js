// Part of the engine-v2 system — engine-v2-stats.js: StatsEngine dashboard
import { EngineStoke }           from "lib/engine-stoke.js";
import { sampleStats, sparkline } from "lib/stats.js";
import { getServers }             from "lib/scout.js";
import { BATCHER_PORT }          from "env.js";
import { uiEngineWidth, uiQuonfigWidth,
         uiBatchingWidth,
         uiStatsWidth, uiStatsHeight,
         uiTopPadding }          from "env.js";
import { textCyane }             from "lib/ui.js";


// ── StatsHistory ──────────────────────────────────────────────────────────────

const HISTORY_CAP = 120; // ~4 min at 2s cadence

// In-memory FIFO of stat samples plus running accumulators (peak, per-target ledger).
// All state resets automatically when an aug install is detected via epoch change.
class StatsHistory {
  #capacity;
  #entries      = [];
  #installEpoch = 0; // tracks aug resets — any epoch change wipes history clean

  peakPerSec = 0;
  byTarget   = {}; // name → { peakPerSec, ticks }

  constructor(capacity = HISTORY_CAP) {
    this.#capacity = capacity;
  }

  push(sample, installEpoch) {
    // Wipe everything on aug install so peaks/ledger don't bleed across resets
    if (this.#installEpoch !== installEpoch) {
      this.#installEpoch = installEpoch;
      this.peakPerSec    = 0;
      this.byTarget      = {};
      this.#entries      = [];
    }

    const prev    = this.#entries.at(-1);
    const snap    = sample.incomeSourcesSnapshot;
    const prevSnap = prev?.incomeSourcesSnapshot ?? {};
    const dt      = prev ? (sample.ts - prev.ts) / 1000 : 0;

    sample.sources = {};
    for (const k of SOURCE_KEYS) {
      if (k === "total")   continue; // derived below
      if (k === "hacking") { sample.sources[k] = snap.hacking; continue; } // already a live rate
      sample.sources[k] = dt > 0 ? ((snap[k] ?? 0) - (prevSnap[k] ?? 0)) / dt : 0;
    }
    sample.sources.total = SOURCE_KEYS
      .filter(k => k !== "total")
      .reduce((sum, k) => sum + (sample.sources[k] ?? 0), 0);

    this.#entries.push(sample);
    if (this.#entries.length > this.#capacity) this.#entries.shift();

    this.peakPerSec = Math.max(this.peakPerSec, sample.sources.total);

    if (sample.target) {
      const e = (this.byTarget[sample.target] ??= { peakPerSec: 0, ticks: 0 });
      e.peakPerSec = Math.max(e.peakPerSec, sample.sources.total);
      e.ticks++;
    }
  }

  get entries()      { return this.#entries; }
  get latest()       { return this.#entries.at(-1) ?? null; }
  get incomeWindow() { return this.#entries.map(s => s.sources?.total ?? 0); }

  sourcesAvg(windowSize = 40) {
    const window = this.#entries.slice(-windowSize);
    if (!window.length) return {};
    const avg = {};
    for (const k of SOURCE_KEYS) {
      avg[k] = window.reduce((sum, s) => sum + (s.sources?.[k] ?? 0), 0) / window.length;
    }
    return avg;
  }
}

const SOURCE_KEYS = ["total", "hacking", "hacknet", "crime", "work", "codingcontract", "infiltration", "stock", "bladeburner", "corporation", "sleeves", "other"];

// ── Dashboard helpers ─────────────────────────────────────────────────────────

const DASH_WIDTH = 80;


function sectionTitle(title) {
  const prefix = `── ${textCyane(title)} `;
  return prefix + "─".repeat( DASH_WIDTH - prefix.length);
}

// One filled square per power-of-2 RAM level, from 1 GB up to maxRam.
function ramBar(currentRam, maxRam) {
  const cur = Math.round(Math.log2(Math.max(1, currentRam)));
  const max = Math.round(Math.log2(Math.max(1, maxRam)));
  return "■ ".repeat(Math.min(cur, max)) + "□ ".repeat(Math.max(0, max - cur));
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

function printDashboard(ns, history) {
  const sample = history.latest;
  if (!sample) return;

  const home       = ns.getServer("home");
  const maxRam     = ns.cloud.getRamLimit();
  const maxCoreLvl = 8; // home cores top out at 8

  const allServers = getServers(ns, "all");
  const zombies    = getServers(ns, "zombies");
  const victims    = getServers(ns, "victims");
  const botnet00   = allServers.find(s => s.name === "botnet-00");

  let batcherState = null;
  try {
    const raw = ns.peek(BATCHER_PORT);
    if (raw && raw !== "NULL PORT DATA") batcherState = JSON.parse(raw);
  } catch {}

  const window = history.incomeWindow.slice(-40);
  const fmt    = v => ns.format.number(v).padStart(10);

  ns.clearLog();

  // ── NEXUS — home hardware status ───────────────────────────────────────────
  ns.print(sectionTitle("HOME"));
  ns.print(`  RAM     ${ramBar(home.maxRam, maxRam)} ${ns.format.ram(home.maxRam)}`);
  ns.print(`  Cores   ${"■ ".repeat(home.cpuCores)}${"□ ".repeat(maxCoreLvl - home.cpuCores)} ${home.cpuCores}`);

  // ── KINGDOM — botnet flagship + network overview ───────────────────────────
  ns.print(sectionTitle("KINGDOM"));
  if (botnet00) {
    const b00Ram = ns.getServerMaxRam("botnet-00");
    ns.print(`  Botnet  ${ramBar(b00Ram, maxRam)} ${ns.format.ram(b00Ram)}`);
  }
  ns.print(`  Network  ${allServers.length} total · ${zombies.length} zombies · ${victims.length} victims`);

  // ── FINANCIAL — income, sources, per-target ledger ─────────────────────────
  ns.print(sectionTitle("FINANCIAL"));
  ns.print(`  trend  ${sparkline(window, history.peakPerSec || undefined)}`);

  const avg = history.sourcesAvg();
  const activeSources = SOURCE_KEYS
    .map(k => ({ k, v: sample.sources[k] ?? 0 }))
    .filter(({ k }) => (avg[k] ?? 0) > 0);
  for (const { k, v } of activeSources) {
    ns.print(`    ${k.padEnd(14)} now:${fmt(v)}  avg:${fmt(avg[k] ?? 0)}`);
  }

  // ── BATCHER ────────────────────────────────────────────────────────────────
  ns.print(sectionTitle("BATCHER"));
  const entries = Object.entries(history.byTarget).sort((a, b) => b[1].peakPerSec - a[1].peakPerSec);
  if (entries.length) {
    const [topName, topData] = entries[0];
    ns.print(`  TARGET ${textCyane(topName)} for ${topData.ticks} ticks`);
  }
  if (batcherState) {
    const age = ((Date.now() - batcherState.ts) / 1000).toFixed(0);
    ns.print(`  ${batcherState.message}  (${age}s ago)`);
  }
  if (entries.length > 1) {
    for (const [name, d] of entries.slice(1)) {
      ns.print(`  ${name.padEnd(22)} ${String(d.ticks).padStart(6)} ticks`);
    }
  }

  // ── TELEPATHY ──────────────────────────────────────────────────────────────
  ns.print(sectionTitle("TELEPATHY"));
  ns.print(`  Share x${ns.getSharePower().toFixed(4)}   Zombies ${ns.format.ram(sample.sharedRam ?? 0)}   DarkNet ~${ns.format.ram(sample.darknetSharedRam ?? 0)}`);
}

// ── Engine ────────────────────────────────────────────────────────────────────

class StatsEngine extends EngineStoke {
  constructor(ns) {
    super(ns, "stats");
    this.history = new StatsHistory();
  }

  async tick() {
    const ns = this.ns;
    this.history.push(sampleStats(ns), ns.getResetInfo().lastAugReset);
    printDashboard(ns, this.history);
  }
}

function initStatsWindow(ns) {
  ns.disableLog("ALL");
  ns.ui.openTail();
  ns.ui.resizeTail(uiEngineWidth, uiStatsHeight);
  ns.ui.moveTail(ns.ui.windowSize()[0] - uiQuonfigWidth - uiEngineWidth, uiTopPadding);
}

export async function main(ns) {
  initStatsWindow(ns);
  ns.atExit(() => ns.ui.closeTail());
  const engine = new StatsEngine(ns);
  while (true) {
    await engine.tick();
    await ns.sleep(engine.loopDelay);
  }
}
