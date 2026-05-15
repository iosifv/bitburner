import { getServers } from "lib/scout.js";

const PROFITS_FILE = "profits.json";

function fmtAgo(ms) {
  if (!ms) return "—";
  const s = Math.floor(ms / 1000);
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

export async function main(ns) {
  const sortKey = ns.args[0] ?? "total";

  const raw    = ns.read(PROFITS_FILE);
  const ledger = (raw && raw !== "NULL PORT DATA")
    ? (() => { try { return JSON.parse(raw); } catch { return { byTarget: {} }; } })()
    : { byTarget: {} };

  const victims = getServers(ns, "victims");
  const now     = Date.now();

  const names = new Set([...victims.map(v => v.name), ...Object.keys(ledger.byTarget)]);
  const rows  = [];

  for (const name of names) {
    const led = ledger.byTarget[name];
    const v   = victims.find(s => s.name === name);
    let projected = 0;
    if (v) {
      const hackPct = ns.hackAnalyze(name);
      projected = (v.serverMaxMoney * v.hackChance * hackPct * 1000) / v.weakenTime;
    }
    rows.push({
      name,
      totalStolen: led?.totalStolen  ?? 0,
      peakPerSec:  led?.peakPerSec   ?? 0,
      lastActive:  led?.lastActiveTs ?? 0,
      projected,
      maxMoney: v?.serverMaxMoney  ?? 0,
      sec:      v?.serverSecurity  ?? 0,
      minSec:   v?.serverMinSecurity ?? 0,
    });
  }

  const sorters = {
    total:     (a, b) => b.totalStolen - a.totalStolen,
    peak:      (a, b) => b.peakPerSec  - a.peakPerSec,
    projected: (a, b) => b.projected   - a.projected,
  };
  rows.sort(sorters[sortKey] ?? sorters.total);

  const fmt = v => (v ? ns.format.number(v) : "—");

  ns.tprint(`\nProfit ledger  sort:${sortKey}  servers:${rows.length}\n`);
  ns.tprint(
    "TARGET".padEnd(22) +
    "TOTAL $".padStart(12) +
    "PEAK $/sec".padStart(13) +
    "LAST SEEN".padStart(12) +
    "PROJ $/sec".padStart(13) +
    "MAX $".padStart(12) +
    "  SEC (min)",
  );
  for (const r of rows) {
    ns.tprint(
      r.name.padEnd(22) +
      fmt(r.totalStolen).padStart(12) +
      fmt(r.peakPerSec).padStart(13) +
      fmtAgo(r.lastActive ? now - r.lastActive : 0).padStart(12) +
      fmt(r.projected).padStart(13) +
      fmt(r.maxMoney).padStart(12) +
      `  ${r.sec.toFixed(1)} (${r.minSec.toFixed(1)})`,
    );
  }
}
