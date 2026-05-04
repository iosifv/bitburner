/**
 * 30-gang.js
 * Automated gang manager for a combat gang with balanced priorities.
 *
 * Strategy:
 *  - Recruit members whenever possible
 *  - Train new members until combat stats are strong enough
 *  - Assign trained members to tasks based on stat-gated progression
 *  - Auto-buy best affordable equipment for every member
 *  - Always keep a warmup roster on Territory Warfare to build power
 *  - Enable full territory warfare only when win chance is safe
 *  - Dedicate strongest members to Territory Warfare when engaged
 *
 * Usage: run 30-gang.js
 */
export async function main(ns) {
  ns.disableLog("ALL");
  ns.ui.openTail();

  // ── Config ────────────────────────────────────────────────────────────────
  const LOOP_DELAY          = 15000; // ms between cycles
  const RESPECT_THRESHOLD   = 2e6;   // farm respect below this, then switch to money
  const ASCENSION_THRESHOLD = 1.4;   // Threshold for when a member should be ascended
  const EQUIPMENT_PRICE_DIV = 1;     // 1 = afford once; 2 = afford twice, buy once
  const WARFARE_THRESHOLD   = 0.75;  // min win chance before engaging territory warfare
  const WARFARE_MEMBERS     = 0;     // how many members to dedicate to Territory Warfare
  const WARFARE_WARMUP      = 0;     // always keep this many on warfare to build power

  // Member name pool for recruitment
  const NAMES = [
    "Homelander",     "Billy Butcher",
    "Soldier Boy",    "Mother's Milk",
    "The Deep",       "Starlight",
    "A-Train",        "Hughie",
    "Black Noir",     "Frenchie",
    "Stormfront",     "Kimiko",
  ];

  // ── Rename Members ────────────────────────────────────────────────────────
  // Only runs on script start
  ns.gang.getMemberNames().forEach((n, k) => {
    if (n != NAMES[k]) ns.gang.renameMember(n, NAMES[k]);
  });

  // ── Task progression ──────────────────────────────────────────────────────
  // Terrorism only kicks in at very high stats — before that it generates nothing.
  function getTask(info, wantMoney, warfareRoster) {
    if (warfareRoster.has(info.name)) return "Territory Warfare";

    const combat = info.str + info.def + info.dex + info.agi;
    if (combat <  200)  return "Train Combat";
    if (combat <  600)  return "Mug People";
    if (combat < 1500)  return "Armed Robbery";
    if (combat < 3000)  return "Traffick Illegal Arms";
    return wantMoney    ? "Traffick Illegal Arms" : "Terrorism";
  }

  let nameIndex = ns.gang.getMemberNames().length;
  let lastTerritory = ns.gang.getGangInformation().territory;

  while (true) {
    const gangInfo  = ns.gang.getGangInformation();
    const members   = ns.gang.getMemberNames();
    const respect   = gangInfo.respect;
    const wantMoney = respect >= RESPECT_THRESHOLD;

    // ── Clash detection ───────────────────────────────────────────────────
    const territoryDelta = gangInfo.territory - lastTerritory;
    if (Math.abs(territoryDelta) > 0.0001) {
      const won = territoryDelta > 0;
      ns.print(
        `CLASH  ${won ? "✅ WON" : "❌ LOST"}  ` +
        `Territory: ${(lastTerritory * 100).toFixed(3)}% → ${(gangInfo.territory * 100).toFixed(3)}%  ` +
        `(${won ? "+" : ""}${(territoryDelta * 100).toFixed(3)}%)`
      );
    }
    lastTerritory = gangInfo.territory;

    // ── Recruit ───────────────────────────────────────────────────────────
    if (ns.gang.canRecruitMember()) {
      const name = NAMES[nameIndex % NAMES.length];
      if (ns.gang.recruitMember(name)) {
        nameIndex++;
        ns.print(`RECRUIT  ${name}`);
      }
    }

    // ── Territory warfare toggle ──────────────────────────────────────────
    const otherGangs     = ns.gang.getAllGangInformation();
    const otherGangNames = Object.keys(otherGangs)
      .filter(g => g !== gangInfo.faction && otherGangs[g].territory > 0);

    const winChances   = otherGangNames.map(g => ns.gang.getChanceToWinClash(g));
    const minWinChance = winChances.reduce((min, c) => Math.min(min, c), 1);
    const maxWinChance = winChances.reduce((max, c) => Math.max(max, c), 0);

    const shouldWar = members.length >= WARFARE_MEMBERS &&
      winChances.some(c => c >= WARFARE_THRESHOLD);

    // Enable the warfare toggle whenever anyone is on warfare duty (warmup or full)
    const warfareEngaged = members.length == 12 && members.length >= WARFARE_WARMUP;
    if (gangInfo.territoryWarfareEngaged !== warfareEngaged) {
      ns.gang.setTerritoryWarfare(warfareEngaged);
      ns.tprint(`WARFARE  ${warfareEngaged ? "ENGAGING ⚔️" : "STANDING DOWN 🛡️"}  (best win chance: ${(maxWinChance * 100).toFixed(1)}%)`);
    }

    // ── Decide warfare roster (strongest members get the job) ─────────────
    // Always assign WARFARE_WARMUP members to build power even when not at war.
    // This keeps power non-zero so win chance is meaningful.
    const membersByStrength = [...members].sort((a, b) => {
      const ia = ns.gang.getMemberInformation(a);
      const ib = ns.gang.getMemberInformation(b);
      return (ib.str + ib.def + ib.dex + ib.agi) - (ia.str + ia.def + ia.dex + ia.agi);
    });
    const warfareCount  = shouldWar ? WARFARE_MEMBERS : WARFARE_WARMUP;
    const warfareRoster = new Set(
      members.length >= warfareCount
        ? membersByStrength.slice(0, warfareCount)
        : membersByStrength  // if gang is tiny, everyone warms up
    );

    // ── Equip + ascend + assign each member ───────────────────────────────
    for (const name of members) {
      const info = ns.gang.getMemberInformation(name);

      // ── Ascend if any combat stat multiplier would increase by threshold+ ──
      const ascResult = ns.gang.getAscensionResult(name);
      if (ascResult) {
        const worthIt = ascResult.str  >= ASCENSION_THRESHOLD ||
                        ascResult.def  >= ASCENSION_THRESHOLD ||
                        ascResult.dex  >= ASCENSION_THRESHOLD ||
                        ascResult.agi  >= ASCENSION_THRESHOLD;
        if (worthIt) {
          ns.gang.ascendMember(name);
          ns.print(`ASCEND   ${name.padEnd(15)} str:x${ascResult.str.toFixed(2)}  def:x${ascResult.def.toFixed(2)}  dex:x${ascResult.dex.toFixed(2)}  agi:x${ascResult.agi.toFixed(2)}`);
        }
      }

      // ── Buy best affordable equipment ────────────────────────────────────
      for (const eq of ns.gang.getEquipmentNames()) {
        const cost  = ns.gang.getEquipmentCost(eq);
        const type  = ns.gang.getEquipmentType(eq);
        const owned = info.upgrades.includes(eq) || info.augmentations.includes(eq);
        if (!owned && ["Weapon", "Armor", "Vehicle", "Augmentation"].includes(type)
            && ns.getPlayer().money > cost * EQUIPMENT_PRICE_DIV) {
          ns.gang.purchaseEquipment(name, eq);
          ns.print(`EQUIP    ${name.padEnd(15)} ${eq}`);
        }
      }

      // ── Assign task — warfare check is handled inside getTask ────────────
      const task = getTask(info, wantMoney, warfareRoster);

      if (info.task !== task) {
        ns.gang.setMemberTask(name, task);
        const combat = info.str + info.def + info.dex + info.agi;
        ns.print(`ASSIGN   ${name.padEnd(15)} ${`[${combat}]`.padEnd(8)} → ${task}`);
      }
    }

    // ── Status print ──────────────────────────────────────────────────────
    const taskCounts = {};
    for (const name of members) {
      const task = ns.gang.getMemberInformation(name).task;
      taskCounts[task] = (taskCounts[task] ?? 0) + 1;
    }
    const taskSummary = Object.entries(taskCounts)
      .map(([task, count]) => `${task}: ${count}`)
      .join("  ");

    ns.print(
      `${"─".repeat(70)}\n` +
      `Members: ${String(members.length).padStart(2)}  ` +
      `Respect: ${ns.format.number(respect, 2).padStart(10)}  ` +
      `Territory: ${(gangInfo.territory * 100).toFixed(1).padStart(5)}%  ` +
      `Mode: ${wantMoney ? "💰 MONEY" : "💪 RESPECT"}\n` +
      `Power: ${gangInfo.power.toFixed(3).padStart(10)}  ` +
      `Best Win: ${(maxWinChance * 100).toFixed(1).padStart(5)}%  ` +
      `Worst Win: ${(minWinChance * 100).toFixed(1).padStart(5)}%  ` +
      `Clash Chance: ${(gangInfo.territoryClashChance * 100).toFixed(0).padStart(3)}%  ` +
      `Warfare: ${shouldWar ? "⚔️  ACTIVE" : "🛡️  WARMUP"}\n` +
      taskSummary
    );

    await ns.sleep(LOOP_DELAY);
  }
}