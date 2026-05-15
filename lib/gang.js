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

// ── getTask ───────────────────────────────────────────────────────────────────
function getTask(info, wantMoney, warfareRoster, gangInfo, config) {
  if (warfareRoster.has(info.name)) return "Territory Warfare";

  // wantedPenalty is a multiplier 0–1 (1 = no penalty). Recover when below threshold.
  if (gangInfo.wantedPenalty < 1 - config.wantedPenaltyThreshold) return "Vigilante Justice";

  const combat = info.str + info.def + info.dex + info.agi;
  if (combat <  200)  return "Train Combat";
  if (combat <  600)  return "Mug People";
  if (combat < 1500)  return "Armed Robbery";
  if (combat < 3000)  return "Traffick Illegal Arms";
  // Terrorism generates too much wanted level to run safely at low respect
  if (!wantMoney && gangInfo.respect >= config.terrorismRespectFloor) return "Terrorism";
  return "Traffick Illegal Arms";
}

// ── updateWarfare ─────────────────────────────────────────────────────────────
export function updateWarfare(ns, gangInfo, members, config, mode = "print") {
  const { warfareThreshold, warfareMembers, warfareWarmup } = config;

  const otherGangs     = ns.gang.getAllGangInformation();
  const otherGangNames = Object.keys(otherGangs)
    .filter(g => g !== gangInfo.faction && otherGangs[g].territory > 0);

  const winChances   = otherGangNames.map(g => ns.gang.getChanceToWinClash(g));
  const minWinChance = winChances.reduce((min, c) => Math.min(min, c), 1);
  const maxWinChance = winChances.reduce((max, c) => Math.max(max, c), 0);

  const shouldWar = members.length >= warfareMembers &&
    winChances.some(c => c >= warfareThreshold);

  const membersByStrength = [...members].sort((a, b) => {
    const ia = ns.gang.getMemberInformation(a);
    const ib = ns.gang.getMemberInformation(b);
    return (ib.str + ib.def + ib.dex + ib.agi) - (ia.str + ia.def + ia.dex + ia.agi);
  });
  const warfareCount   = shouldWar ? warfareMembers : warfareWarmup;
  const warfareEngaged = warfareCount > 0;
  if (gangInfo.territoryWarfareEngaged !== warfareEngaged) {
    ns.gang.setTerritoryWarfare(warfareEngaged);
    log(ns, mode, "GANG", "WARFARE", `${warfareEngaged ? "ENGAGING ⚔️" : "STANDING DOWN 🛡️"}  (best win chance: ${(maxWinChance * 100).toFixed(1)}%)`);
  }
  const warfareRoster = new Set(
    members.length >= warfareCount
      ? membersByStrength.slice(0, warfareCount)
      : membersByStrength
  );

  return { warfareRoster, shouldWar, minWinChance, maxWinChance };
}

// ── setTask ───────────────────────────────────────────────────────────────────
export function setTask(ns, info, task, mode = "print") {
  if (info.task === task) return;
  ns.gang.setMemberTask(info.name, task);
  const combat = info.str + info.def + info.dex + info.agi;
  log(ns, mode, "GANG", "ASSIGN", `${info.name.padEnd(15)} ${`[${combat}]`.padEnd(8)} → ${task}`);
}

// ── assignTask ────────────────────────────────────────────────────────────────
function assignTask(ns, info, wantMoney, warfareRoster, gangInfo, config, mode = "print") {
  setTask(ns, info, getTask(info, wantMoney, warfareRoster, gangInfo, config), mode);
}

// ── processMembers ────────────────────────────────────────────────────────────
export function processMembers(ns, gangInfo, members, warfareRoster, wantMoney, config, mode = "print") {
  const { ascensionThreshold, equipmentPriceDivisor } = config;
  const quiet = mode === "port" ? "silent" : mode;

  for (const name of members) {
    const info = ns.gang.getMemberInformation(name);

    // Ascend if any combat multiplier meets threshold
    const ascResult = ns.gang.getAscensionResult(name);
    if (ascResult) {
      const worthIt = ascResult.str >= ascensionThreshold ||
                      ascResult.def >= ascensionThreshold ||
                      ascResult.dex >= ascensionThreshold ||
                      ascResult.agi >= ascensionThreshold;
      if (worthIt) {
        ns.gang.ascendMember(name);
        log(ns, mode, "GANG", "ASCEND", `${name.padEnd(15)} str:x${ascResult.str.toFixed(2)}  def:x${ascResult.def.toFixed(2)}  dex:x${ascResult.dex.toFixed(2)}  agi:x${ascResult.agi.toFixed(2)}`);
      }
    }

    // Buy best affordable equipment
    for (const eq of ns.gang.getEquipmentNames()) {
      const cost  = ns.gang.getEquipmentCost(eq);
      const type  = ns.gang.getEquipmentType(eq);
      const owned = info.upgrades.includes(eq) || info.augmentations.includes(eq);
      if (!owned && ["Weapon", "Armor", "Vehicle", "Augmentation"].includes(type)
          && ns.getPlayer().money > cost * equipmentPriceDivisor) {
        ns.gang.purchaseEquipment(name, eq);
        log(ns, quiet, "GANG", "EQUIP", `${name.padEnd(15)} ${eq}`);
      }
    }

    assignTask(ns, info, wantMoney, warfareRoster, gangInfo, config, quiet);
  }
}

// ── printStatus ───────────────────────────────────────────────────────────────
export function printStatus(ns, gangInfo, members, wantMoney, warfare, mode = "print") {
  const { shouldWar, minWinChance, maxWinChance } = warfare;

  const taskCounts = {};
  for (const name of members) {
    const task = ns.gang.getMemberInformation(name).task;
    taskCounts[task] = (taskCounts[task] ?? 0) + 1;
  }
  const taskSummary = Object.entries(taskCounts)
    .map(([task, count]) => `${task}: ${count}`)
    .join("  ");

  log(ns, mode, "GANG", "STATUS",
    `Members: ${String(members.length).padStart(2)}  ` +
    `Respect: ${ns.format.number(gangInfo.respect, 2).padStart(10)}  ` +
    `Territory: ${(gangInfo.territory * 100).toFixed(1).padStart(5)}%  ` +
    `Mode: ${wantMoney ? "MONEY" : "RESPECT"}`
  );
  log(ns, mode, "GANG", "STATUS",
    `Power: ${gangInfo.power.toFixed(3).padStart(10)}  ` +
    `WinChance: ${(minWinChance * 100).toFixed(1)}%–${(maxWinChance * 100).toFixed(1)}%  ` +
    `Clash: ${(gangInfo.territoryClashChance * 100).toFixed(0)}%  ` +
    `Warfare: ${shouldWar ? "⚔️  ACTIVE" : "🛡️  WARMUP"}`
  );
  log(ns, mode, "GANG", "TASKS", taskSummary);
}
