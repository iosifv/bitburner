// engine-v2-cortex-lite.js — RAM-cheap early-game cortex: upgrade home RAM + train hack + train combat
// No imports — RAM cost is only the ns.* calls made here.

const LOOP_DELAY = 2_000;

const TARGET_HACK_INITIAL   = 100;
const TARGET_COMBAT_INITIAL = 30;
const COMBAT_STATS = ["str", "def", "dex", "agi"];

const UNIVERSITIES = {
  "Sector-12": "Rothman University",
  "Aevum":     "Summit University",
  "Volhaven":  "ZB Institute of Technology",
};

const GYMS = {
  "Sector-12": "Powerhouse Gym",
  "Aevum":     "Snap Fitness Gym",
  "Volhaven":  "Millenium Fitness Gym",
};

function tryUpgradeHomeRam(ns) {
  // try {
  //   const ok = ns.singularity.upgradeHomeRam();
  //   if (ok) ns.print(`[UPGRADE-HOME]  RAM upgraded`);
  // } catch (_) {}
}

function startHackTraining(ns) {
  // const local = UNIVERSITIES[ns.getPlayer().city];
  // if (local) ns.singularity.universityCourse(local, "Computer Science", false);
}

function startCombatTraining(ns) {
  const gym = GYMS[ns.getPlayer().city];
  if (!gym) return null;
  const skills = ns.getPlayer().skills;
  const lowest = COMBAT_STATS.reduce((a, b) => skills[a] <= skills[b] ? a : b);
  ns.singularity.gymWorkout(gym, lowest, false);
  return lowest;
}

function combatDone(ns) {
  const skills = ns.getPlayer().skills;
  return COMBAT_STATS.every(s => skills[s] >= TARGET_COMBAT_INITIAL);
}

export async function main(ns) {
  ns.disableLog("ALL");
  ns.ui.openTail();

  while (true) {
    tryUpgradeHomeRam(ns);

    const skills = ns.getPlayer().skills;

    if (skills.hacking < TARGET_HACK_INITIAL) {
      startHackTraining(ns);
      ns.print(`[LITE]  TRAIN-HACK  hack:${skills.hacking}/${TARGET_HACK_INITIAL}`);
    } else if (!combatDone(ns)) {
      const stat = startCombatTraining(ns);
      const s = ns.getPlayer().skills;
      ns.print(`[LITE]  TRAIN-COMBAT  training:${stat}  str:${s.strength} def:${s.defense} dex:${s.dexterity} agi:${s.agility}  target:${TARGET_COMBAT_INITIAL}`);
    } else {
      ns.print(`[LITE]  IDLE  hack:${skills.hacking}  str:${skills.strength} def:${skills.defense} dex:${skills.dexterity} agi:${skills.agility}  — ready for cortex`);
    }

    await ns.sleep(LOOP_DELAY);
  }
}
