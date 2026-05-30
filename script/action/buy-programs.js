// script/buy-programs.js — buy TOR + all darkweb programs when affordable, then exit

const TOR_COST = 200_000;

const PROGRAMS = [
  { name: "BruteSSH.exe",   cost:       500_000 },
  { name: "FTPCrack.exe",   cost:     1_500_000 },
  { name: "relaySMTP.exe",  cost:     5_000_000 },
  { name: "HTTPWorm.exe",   cost:    30_000_000 },
  { name: "SQLInject.exe",  cost:   250_000_000 },
];

export async function main(ns) {
  ns.disableLog("ALL");

  if (!ns.hasTorRouter()) {
    if (ns.getPlayer().money < TOR_COST) {
      ns.tprint(`[BUY-PROGRAMS]  need ${ns.format.number(TOR_COST)} for TOR — not enough funds`);
      return;
    }
    ns.singularity.purchaseTor();
    ns.tprint(`[BUY-PROGRAMS]  TOR purchased`);
  }

  for (const p of PROGRAMS) {
    if (ns.fileExists(p.name, "home")) continue;
    if (ns.getPlayer().money < p.cost) {
      ns.tprint(`[BUY-PROGRAMS]  skipped ${p.name} — need ${ns.format.number(p.cost)}`);
      continue;
    }
    const ok = ns.singularity.purchaseProgram(p.name);
    if (ok) ns.tprint(`[BUY-PROGRAMS]  purchased ${p.name}`);
  }
}
