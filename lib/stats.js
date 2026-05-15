import { getServers } from "lib/scout.js";
import { getConfig }  from "lib/config.js";

export function sampleStats(ns) {
  const ts      = Date.now();
  const zombies = getServers(ns, "zombies");
  const targets  = {};

  for (const z of zombies) {
    const procs = ns.ps(z.name).filter(p => p.filename === "spores/bacteria.js");
    for (const p of procs) {
      const name = p.args[0];
      if (!name) continue;
      if (!targets[name]) targets[name] = { procs: 0, threads: 0, scriptIncome: 0 };
      targets[name].procs++;
      targets[name].threads    += p.threads;
      targets[name].scriptIncome += ns.getScriptIncome("spores/bacteria.js", z.name, ...p.args);
    }
  }

  try {
    const forced = getConfig(ns, "batching-forced-target");
    if (forced && forced.trim() && !targets[forced.trim()]) {
      targets[forced.trim()] = { procs: 0, threads: 0, scriptIncome: 0 };
    }
  } catch {}

  for (const name of Object.keys(targets)) {
    targets[name].money    = ns.getServerMoneyAvailable(name);
    targets[name].maxMoney = ns.getServerMaxMoney(name);
    targets[name].sec      = ns.getServerSecurityLevel(name);
    targets[name].minSec   = ns.getServerMinSecurityLevel(name);
  }

  const income  = ns.getTotalScriptIncome();
  const sources = ns.getMoneySources();
  const global  = {
    incomePerSec:       income[0] ?? 0,
    hackingCumulative:  sources?.sinceInstall?.hacking ?? 0,
  };

  return { ts, targets, global };
}

export function diffStats(prev, next) {
  const dt   = Math.max(1, (next.ts - prev.ts) / 1000);
  const rows = [];

  for (const [name, cur] of Object.entries(next.targets)) {
    const old    = prev.targets[name];
    const $stolen = old ? Math.max(0, old.money - cur.money) : 0;
    rows.push({
      name,
      $stolen,
      $perSec: $stolen / dt,
      secNow:  cur.sec,
      secMin:  cur.minSec,
      procs:   cur.procs,
      threads: cur.threads,
    });
  }

  
  rows.push({ name: "__total", $perSec: next.global.incomePerSec, targets: rows.length });

  return rows;
}

export function updateProfits(state, rows, ts, installEpoch) {
  if (state.installEpoch !== installEpoch) {
    state.byTarget     = {};
    state.installEpoch = installEpoch;
  }

  for (const r of rows) {
    if (r.name === "__total") continue;
    const e = state.byTarget[r.name] ??= {
      totalStolen: 0, peakPerSec: 0, ticksActive: 0,
      firstSeenTs: ts, lastActiveTs: ts,
    };
    e.totalStolen  += r.$stolen;
    e.peakPerSec    = Math.max(e.peakPerSec, r.$perSec);
    e.ticksActive++;
    e.lastActiveTs  = ts;
  }
}
