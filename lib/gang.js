import { logPropulsion, logTail } from "lib/logger.js";

// ── combatScore ───────────────────────────────────────────────────────────────
export function combatScore(info) {
  return info.str + info.def + info.dex + info.agi;
}

// ── setTerritoryWarfare ───────────────────────────────────────────────────────
export function setTerritoryWarfare(ns, on) {
  if (ns.gang.getGangInformation().territoryWarfareEngaged !== on)
    ns.gang.setTerritoryWarfare(on);
}

// ── getClashWinChances ────────────────────────────────────────────────────────
export function getClashWinChances(ns) {
  const me   = ns.gang.getGangInformation().faction;
  const all  = ns.gang.getAllGangInformation();
  const out  = {};
  for (const g of Object.keys(all)) {
    if (g === me || all[g].territory <= 0) continue;
    out[g] = ns.gang.getChanceToWinClash(g);
  }
  return out;
}

// ── renameMembers ─────────────────────────────────────────────────────────────
export function renameMembers(ns, names) {
  ns.gang.getMemberNames().forEach((n, k) => {
    if (n !== names[k]) ns.gang.renameMember(n, names[k]);
  });
}

// ── recruit ───────────────────────────────────────────────────────────────────
export function recruit(ns, names, nameIndex, source = "GANG") {
  if (!ns.gang.canRecruitMember()) return nameIndex;
  const name = names[nameIndex % names.length];
  if (ns.gang.recruitMember(name)) {
    logPropulsion(ns, source, "RECRUIT", name);
    return nameIndex + 1;
  }
  return nameIndex;
}

// ── setTask ───────────────────────────────────────────────────────────────────
export function setTask(ns, info, task) {
  if (info.task === task) return;
  ns.gang.setMemberTask(info.name, task);
  const combat = info.str + info.def + info.dex + info.agi;
  logTail(ns, "GANG", "ASSIGN", `${info.name.padEnd(15)} ${`[${combat}]`.padEnd(8)} → ${task}`);
}
