// engine-v2-cortex-lite.js — RAM-cheap early-game cortex: upgrade home RAM + train hack
// No imports — RAM cost is only the ns.* calls made here.

const LOOP_DELAY = 2_000;

const TARGET_HACK_INITIAL = 500;

const UNIVERSITIES = {
  "Sector-12": "Rothman University",
  "Aevum":     "Summit University",
  "Volhaven":  "ZB Institute of Technology",
};

function tryUpgradeHomeRam(ns) {
  try {
    const ok = ns.singularity.upgradeHomeRam();
    if (ok) ns.print(`[UPGRADE-HOME]  RAM upgraded`);
  } catch (_) {}
}

function startHackTraining(ns) {
  const local = UNIVERSITIES[ns.getPlayer().city];
  if (local) ns.singularity.universityCourse(local, "Computer Science", false);
}

export async function main(ns) {
  ns.disableLog("ALL");
  ns.ui.openTail();

  while (true) {
    tryUpgradeHomeRam(ns);

    if (ns.getPlayer().skills.hacking < TARGET_HACK_INITIAL) {
      startHackTraining(ns);
      ns.print(`[LITE]  TRAIN-HACK  hack:${ns.getPlayer().skills.hacking}/${TARGET_HACK_INITIAL}`);
    } else {
      ns.print(`[LITE]  IDLE  hack:${ns.getPlayer().skills.hacking}  — ready for cortex`);
    }

    await ns.sleep(LOOP_DELAY);
  }
}
