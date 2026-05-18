/**
 * singularity-training.js
 *
 * Post-respawn skill trainer.
 * Trains all stats to TARGET_LEVEL, then exits.
 *
 * Combat (str/def/dex/agi) → Powerhouse Gym, Sector-12
 * Hacking + Charisma       → ZB Institute Of Technology, Volhaven
 *
 * Usage: run singularity-training.js
 */

const TARGET_LEVEL    = 165;
const SLICE_MS        = 60_000;   // train each stat for this long per loop tick

const COMBAT_CITY     = "Sector-12";
const COMBAT_GYM      = "Powerhouse Gym";

const STUDY_CITY      = "Volhaven";
const UNIVERSITY      = "ZB Institute of Technology";
const HACK_COURSE     = "Algorithms";
const CHARISMA_COURSE = "Leadership";

const FOCUS = false; // whether to set focus mode during training (reduces other exp gain, but trains faster)

// short code → ns.getPlayer().skills key
const ALL_STATS = {
  hack: "hacking",
  str:  "strength",
  def:  "defense",
  dex:  "dexterity",
  agi:  "agility",
  cha:  "charisma",
};

// All stats except hacking, which we train last since it doesn't gate combat tasks
const STATS = { 
  str: "strength", 
  def: "defense", 
  dex: "dexterity", 
  agi: "agility", 
  cha: "charisma" 
};

const TARGETS = Object.fromEntries(Object.keys(STATS).map(s => [s, TARGET_LEVEL]));

export async function main(ns) {
  ns.disableLog("ALL");
  ns.ui.openTail();

  while (true) {
    const skills = ns.getPlayer().skills;
    const todo   = Object.keys(STATS).filter(stat => skills[STATS[stat]] < TARGETS[stat]);

    printStatus(ns, skills);

    if (todo.length === 0) {
      ns.print("✓ All stats at target → existing script and continuing to train hacking");
      trainHacking(ns);
      break;
    }

    for (const stat of todo) {
      const current = ns.getPlayer().skills[STATS[stat]];
      if (current >= TARGETS[stat]) continue;   // reached target mid-loop

      ns.print(`Training ${stat.padEnd(10)} ${current} → ${TARGETS[stat]}`);

      let ok = false;

      switch (stat) {
        case "cha":
          ok = trainCharisma(ns);
          break;
        case "str":
        case "def":
        case "dex":
        case "agi":
          ok = trainCombat(ns, stat);
      }

      if (!ok) {
        ns.print(`⚠ FAILED to start training for ${stat} — check gym/university name or funds`);
        await ns.sleep(2_000);
        continue;
      }

      await ns.sleep(SLICE_MS);
      ns.singularity.stopAction();
    }
  }
}

function trainCombat(ns, stat) {
  travelIfNeeded(ns, COMBAT_CITY);
  return ns.singularity.gymWorkout(COMBAT_GYM, stat, FOCUS);
}

function trainCharisma(ns) {
  travelIfNeeded(ns, STUDY_CITY);
  return ns.singularity.universityCourse(UNIVERSITY, CHARISMA_COURSE, FOCUS);
}

function trainHacking(ns) {
  travelIfNeeded(ns, STUDY_CITY);
  return ns.singularity.universityCourse(UNIVERSITY, HACK_COURSE, FOCUS);
}

function travelIfNeeded(ns, city) {
  if (ns.getPlayer().city !== city) {
    const ok = ns.singularity.travelToCity(city);
    if (!ok) ns.print(`⚠ Travel to ${city} failed — not enough money?`);
  }
}

function printStatus(ns, skills) {
  ns.print("─".repeat(44));
  for (const stat of Object.keys(STATS)) {
    const cur    = skills[STATS[stat]];
    const target = TARGETS[stat];
    const done   = cur >= target;
    const bar    = progressBar(cur, target, 36);
    ns.print(`${done ? "✓" : "·"} ${stat.padEnd(5)} ${String(cur).padStart(4)} / ${target}  ${bar}`);
  }
  ns.print("─".repeat(44));
}

function progressBar(current, max, width) {
  const filled = Math.min(Math.round((current / max) * width), width);
  return "[" + "█".repeat(filled) + "░".repeat(width - filled) + "]";
}
