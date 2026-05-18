import { log } from "lib/logger.js";

// ── renameMembers ─────────────────────────────────────────────────────────────
export function renameMembers(ns, names) {
  ns.gang.getMemberNames().forEach((n, k) => {
    if (n !== names[k]) ns.gang.renameMember(n, names[k]);
  });
}

// ── recruit ───────────────────────────────────────────────────────────────────
export function recruit(ns, names, nameIndex, mode = "print", source = "GANG") {
  if (!ns.gang.canRecruitMember()) return nameIndex;
  const name = names[nameIndex % names.length];
  if (ns.gang.recruitMember(name)) {
    log(ns, mode, source, "RECRUIT", name);
    return nameIndex + 1;
  }
  return nameIndex;
}

// ── setTask ───────────────────────────────────────────────────────────────────
export function setTask(ns, info, task, mode = "print") {
  if (info.task === task) return;
  ns.gang.setMemberTask(info.name, task);
  const combat = info.str + info.def + info.dex + info.agi;
  log(ns, mode, "GANG", "ASSIGN", `${info.name.padEnd(15)} ${`[${combat}]`.padEnd(8)} → ${task}`);
}
