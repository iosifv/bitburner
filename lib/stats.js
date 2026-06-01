import { getServers } from "lib/scout.js";

const HACK_SCRIPT = "spores/leech-hack.js";

function findBatcherTarget(ns, zombies) {
  for (const z of zombies) {
    for (const p of ns.ps(z.name)) {
      if (p.filename === HACK_SCRIPT && p.args[0]) return p.args[0];
    }
  }
  return null;
}

export function sampleStats(ns) {
  const ts      = Date.now();
  const income  = ns.getTotalScriptIncome();
  const sources = ns.getMoneySources();
  const zombies = getServers(ns, "zombies");

  return {
    ts,
    incomePerSec:      income[0]                      ?? 0,
    hackingCumulative: sources?.sinceInstall?.hacking ?? 0,
    playerMoney:       ns.getPlayer().money,
    target:            findBatcherTarget(ns, zombies),
  };
}

export function updateProfits(state, sample, installEpoch) {
  if (state.installEpoch !== installEpoch) {
    state.byTarget     = {};
    state.peakPerSec   = 0;
    state.installEpoch = installEpoch;
  }

  state.peakPerSec = Math.max(state.peakPerSec ?? 0, sample.incomePerSec);

  if (sample.target) {
    const e = state.byTarget[sample.target] ??= { peakPerSec: 0, ticks: 0 };
    e.peakPerSec = Math.max(e.peakPerSec, sample.incomePerSec);
    e.ticks++;
  }
}

/** Render a sparkline scaled to `ceiling` (defaults to window max if omitted). */
export function sparkline(values, ceiling) {
  if (!values.length) return "";
  const max  = ceiling ?? Math.max(...values);
  const BARS = " ▁▂▃▄▅▆▇█";
  return values.map(v => BARS[max > 0 ? Math.min(8, Math.round((v / max) * 8)) : 0]).join("");
}
