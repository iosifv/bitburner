/** Returns a [Map<Aug name, owned level>, numPending] */
async function getCurrentAugs(ns) {
  const ret = new Map();
  const owned = await dodge(ns, "singularity.getOwnedAugmentations", true);
  for (const o of owned) {
    ret.set(o, 1);
  }
  const resetAugs = (await dodge(ns, "getResetInfo")).ownedAugs;
  let numPending = owned.filter((o) => o != NFG && !resetAugs.has(o)).length;
  if (ret.has(NFG)) {
    const basePrice = await dodge(
      ns,
      "singularity.getAugmentationBasePrice",
      NFG,
    );
    const resetLevel = resetAugs.get(NFG) ?? 0;
    const resetPrice = basePrice * Math.pow(NFG_LVL_MULTIPLIER, resetLevel);
    const pendingPrice = resetPrice * Math.pow(PRICE_MULTIPLIER, numPending);
    const currentPrice = await dodge(
      ns,
      "singularity.getAugmentationPrice",
      NFG,
    );
    const pendingLevels = Math.round(
      Math.log(currentPrice / pendingPrice) /
        Math.log(NFG_LVL_MULTIPLIER * PRICE_MULTIPLIER),
    );
    ret.set(NFG, resetLevel + pendingLevels);
    numPending += pendingLevels;
  }
  return [ret, numPending];
}

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("run");
  const player = await dodge(ns, "getPlayer");
  const factions = new Map();
  for (const f of player.factions) {
    factions.set(f, {
      name: f,
      rep: await dodge(ns, "singularity.getFactionRep", f),
      favor: await dodge(ns, "singularity.getFactionFavor", f),
      augs: await dodge(ns, "singularity.getAugmentationsFromFaction", f),
    });
  }
  let [currentAugs, numPending] = await getCurrentAugs(ns);
  const favorToDonate = await dodge(ns, "getFavorToDonate");

  const availableAugs = new Map();
  for (const [fName, faction] of factions.entries()) {
    for (const augName of faction.augs) {
      if (!availableAugs.has(augName)) {
        availableAugs.set(augName, {
          basePrice: await dodge(
            ns,
            "singularity.getAugmentationBasePrice",
            augName,
          ),
          stats: await dodge(ns, "singularity.getAugmentationStats", augName),
          repReq: await dodge(ns, "singularity.getAugmentationRepReq", augName),
          prereq: await dodge(ns, "singularity.getAugmentationPrereq", augName),
          factions: [],
        });
      }
      availableAugs.get(augName).factions.push(fName);
    }
  }
  const planner = new Planner(
    ns,
    availableAugs,
    currentAugs,
    factions,
    player,
    numPending,
    favorToDonate,
  );
  const plan = planner.plan();
}