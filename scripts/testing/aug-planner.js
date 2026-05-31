/**
 * aug-planner.js
 *
 * Plans which augmentations to buy this reset, maximising value within budget.
 * Uses the "dodge" pattern: singularity calls are routed through a tiny
 * subprocess (test-scripts/dodge.js) so this script only pays ~2 GB RAM.
 *
 * Usage:  run test-scripts/aug-planner.js
 */

// ── Constants ────────────────────────────────────────────────────────────────

const NFG = "NeuroFlux Governor";

// Price/rep multiply by this factor for each NFG level already owned.
const NFG_LVL_MULTIPLIER = 1.14;

// Each augmentation purchase multiplies the price of all remaining ones.
const PRICE_MULTIPLIER = 1.9;

// Stat keys on augmentation stat objects that make an aug worth buying.
// Augs with none of these stats (all multipliers == 1) are skipped unless
// listed in USEFUL_AUGS.
const GOOD_STATS = new Set([]);

const USEFUL_AUGS = new Set([]);

// ── Dodge helper ─────────────────────────────────────────────────────────────

/**
 * Runs test-scripts/dodge.js as a temporary subprocess to call an ns.*
 * function without paying its RAM cost in this script.
 *
 * @param {NS} ns
 * @param {string} fn  Dotted ns path, e.g. "singularity.getOwnedAugmentations"
 * @param {...any} args Arguments forwarded to the function
 */
async function dodge(ns, fn, ...args) {
  const pid = ns.run("scripts/testing/dodge.js", { threads: 1, temporary: true }, fn, ...args);
  if (pid === 0) throw `Failed to dodge RAM cost for ${JSON.stringify([fn, ...args])}`;
  await ns.nextPortWrite(pid * 2);
  return ns.readPort(pid * 2);
}

// ── Planner class ─────────────────────────────────────────────────────────────

class Planner {
  constructor(ns, availableAugs, currentAugs, factions, player, numPending, favorToDonate) {
    this.ns = ns;
    this.availableAugs = structuredClone(availableAugs);
    this.currentAugs   = structuredClone(currentAugs);
    this.factions      = structuredClone(factions);
    this.player        = structuredClone(player);
    this.numPending    = numPending;
    this.favorToDonate = favorToDonate;

    for (const name of this.availableAugs.keys()) {
      if (name !== NFG && this.currentAugs.has(name)) {
        this.ns.print(`Already owned: ${name}`);
        this.availableAugs.delete(name);
      }
    }
    for (const [name, aug] of this.availableAugs) {
      if (name !== NFG && !this.isGoodAug(name, aug.stats)) {
        this.ns.print(`Not good: ${name}`);
        this.availableAugs.delete(name);
      }
    }
  }

  plan() {
    let available = structuredClone(this.availableAugs);
    let current   = structuredClone(this.currentAugs);
    let ret = [];

    // Greedily pick the cheapest affordable aug each round.
    // newRet inserts each new aug before all previously selected ones (except
    // its prereqs), producing a most-expensive-first purchase order that
    // minimises the compounding price multiplier.
    while (true) {
      let selected          = null;
      let selectedRet       = null;
      let selectedBasePrice = Infinity;

      for (const [name, aug] of available) {
        if (name === NFG || aug.basePrice >= selectedBasePrice) continue;

        if (!aug.prereq.every((p) => current.has(p))) {
          this.ns.print(`Missing prereqs: ${name}`);
          available.delete(name);
          continue;
        }

        const faction = this.findFactionFor(aug, this.factions);
        if (faction === null) {
          this.ns.print(`Not enough rep: ${name}`);
          available.delete(name);
          continue;
        }

        let prereq = [], nonPrereq = [];
        for (const r of ret) {
          (aug.prereq.includes(r.name) ? prereq : nonPrereq).push({ ...r });
        }
        const newRet = [
          ...prereq,
          { name, basePrice: aug.basePrice, repReq: aug.repReq },
          ...nonPrereq,
        ];
        this.updateFactions(newRet);

        if (this.simulateCost(newRet) <= this.player.money * 0.999) {
          selected          = name;
          selectedRet       = newRet;
          selectedBasePrice = aug.basePrice;
        } else {
          this.ns.print(`Too expensive: ${name}`);
          available.delete(name);
        }
      }

      if (selected === null) {
        this.ns.print(
          `Nothing more to buy, except NFGs (spent $${this.ns.format.number(this.simulateCost(ret))})`,
        );
        break;
      }

      this.ns.print(`Planning to buy ${selected}`);
      ret = selectedRet;
      available.delete(selected);
      current.set(selected, 1);
    }

    // ── Insert NFG levels ────────────────────────────────────────────────────
    // Bug fix: original used Array.lastIndexOf(callback) which always returns
    // -1 (it searches for a value, not a predicate). Replaced with findLastIndex.
    let nfgs = [];
    while (true) {
      const aug = available.get(NFG);
      if (aug === undefined) break;

      const faction = this.findFactionFor(aug, this.factions);
      if (faction === null) break;

      const level          = current.get(NFG) ?? 0;
      const levelBasePrice = aug.basePrice * Math.pow(NFG_LVL_MULTIPLIER, level);

      // Find the last position in ret where an aug is more expensive than this
      // NFG level, so we insert the NFG after all pricier augs (lower mult).
      const splitIndex = ret.findLastIndex((r) => r.basePrice >= levelBasePrice);
      const newNfg     = { name: NFG, basePrice: levelBasePrice, repReq: aug.repReq };
      const newRet     = [
        ...ret.slice(0, splitIndex + 1),
        ...nfgs,
        newNfg,
        ...ret.slice(splitIndex + 1),
      ];

      this.updateFactions(newRet);
      if (this.simulateCost(newRet) > this.player.money * 0.999) break;

      nfgs.push(newNfg);
      current.set(NFG, level + 1);
      aug.repReq *= NFG_LVL_MULTIPLIER;
    }

    if (nfgs.length > 0) {
      const nfgPrice   = nfgs.at(-1).basePrice;
      const splitIndex = ret.findLastIndex((r) => r.basePrice >= nfgPrice);
      ret = [
        ...ret.slice(0, splitIndex + 1),
        ...nfgs,
        ...ret.slice(splitIndex + 1),
      ];
    }

    this.updateFactions(ret);
    return ret;
  }

  simulateCost(buys) {
    let cost = 0;
    let mult = Math.pow(PRICE_MULTIPLIER, this.numPending);
    for (const b of buys) {
      cost += b.donation + b.basePrice * mult;
      mult *= PRICE_MULTIPLIER;
    }
    return cost;
  }

  updateFactions(buys) {
    const factions = structuredClone(this.factions);
    for (const b of buys) {
      const aug     = { ...this.availableAugs.get(b.name), repReq: b.repReq };
      const faction = this.findFactionFor(aug, factions);
      if (faction === null) throw "Failed to update factions";
      Object.assign(b, faction);
      const f = factions.get(b.faction);
      f.rep = Math.max(f.rep, aug.repReq);
    }
  }

  isGoodAug(name, stats) {
    return (
      USEFUL_AUGS.has(name) ||
      Object.entries(stats).some(([k, v]) => v !== 1 && GOOD_STATS.has(k))
    );
  }

  findFactionFor(aug, factions) {
    let ret         = null;
    let donationRep = -1;
    for (const name of aug.factions) {
      const f = factions.get(name);
      if (f.rep >= aug.repReq) return { faction: name, donation: 0 };
      if (f.favor < this.favorToDonate) continue;
      if (donationRep < f.rep) {
        ret = {
          faction: name,
          // Small fudge factor so floating-point rounding doesn't leave us short.
          donation: 1.01 * this.ns.formulas.reputation.donationForRep(aug.repReq - f.rep, this.player),
        };
        donationRep = f.rep;
      }
    }
    return ret;
  }
}

// ── Data collection ───────────────────────────────────────────────────────────

/** @returns {Promise<[Map<string,number>, number]>} [ownedAugs, numPending] */
async function getCurrentAugs(ns) {
  const ret   = new Map();
  const owned = await dodge(ns, "singularity.getOwnedAugmentations", true);
  for (const o of owned) ret.set(o, 1);

  const resetAugs = (await dodge(ns, "getResetInfo")).ownedAugs;
  let numPending  = owned.filter((o) => o !== NFG && !resetAugs.has(o)).length;

  if (ret.has(NFG)) {
    const basePrice    = await dodge(ns, "singularity.getAugmentationBasePrice", NFG);
    const resetLevel   = resetAugs.get(NFG) ?? 0;
    const resetPrice   = basePrice * Math.pow(NFG_LVL_MULTIPLIER, resetLevel);
    const pendingPrice = resetPrice * Math.pow(PRICE_MULTIPLIER, numPending);
    const currentPrice = await dodge(ns, "singularity.getAugmentationPrice", NFG);
    const pendingLevels = Math.round(
      Math.log(currentPrice / pendingPrice) / Math.log(NFG_LVL_MULTIPLIER * PRICE_MULTIPLIER),
    );
    ret.set(NFG, resetLevel + pendingLevels);
    numPending += pendingLevels;
  }

  return [ret, numPending];
}

// ── Entry point ───────────────────────────────────────────────────────────────

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("run");
  ns.ui.openTail();

  const player   = await dodge(ns, "getPlayer");
  const factions = new Map();
  for (const f of player.factions) {
    factions.set(f, {
      name:  f,
      rep:   await dodge(ns, "singularity.getFactionRep", f),
      favor: await dodge(ns, "singularity.getFactionFavor", f),
      augs:  await dodge(ns, "singularity.getAugmentationsFromFaction", f),
    });
  }

  const [currentAugs, numPending] = await getCurrentAugs(ns);
  const favorToDonate = await dodge(ns, "getFavorToDonate");

  const availableAugs = new Map();
  for (const [fName, faction] of factions.entries()) {
    for (const augName of faction.augs) {
      if (!availableAugs.has(augName)) {
        availableAugs.set(augName, {
          basePrice: await dodge(ns, "singularity.getAugmentationBasePrice", augName),
          stats:     await dodge(ns, "singularity.getAugmentationStats", augName),
          repReq:    await dodge(ns, "singularity.getAugmentationRepReq", augName),
          prereq:    await dodge(ns, "singularity.getAugmentationPrereq", augName),
          factions:  [],
        });
      }
      availableAugs.get(augName).factions.push(fName);
    }
  }

  const planner = new Planner(ns, availableAugs, currentAugs, factions, player, numPending, favorToDonate);
  const plan    = planner.plan();

  ns.tprint(`\n=== Aug Plan (${plan.length} augs) ===`);
  for (const b of plan) {
    const price    = ns.format.number(b.basePrice);
    const donation = b.donation > 0 ? ` + $${ns.format.number(b.donation)} donation` : "";
    ns.tprint(`  [${b.faction}]  ${b.name}  $${price}${donation}`);
  }
  const total = planner.simulateCost(plan);
  ns.tprint(`Total cost: $${ns.format.number(total)}`);

  // ── NFG affordability & favor status ─────────────────────────────────────
  const nfgData = availableAugs.get(NFG);
  if (nfgData) {
    const startLevel = currentAugs.get(NFG) ?? 0;
    let count = 0;
    let totalNfgCost = 0;
    let mult = Math.pow(PRICE_MULTIPLIER, numPending);
    while (true) {
      const price = nfgData.basePrice * Math.pow(NFG_LVL_MULTIPLIER, startLevel + count);
      if (totalNfgCost + price * mult > player.money * 0.999) break;
      totalNfgCost += price * mult;
      mult *= PRICE_MULTIPLIER;
      count++;
    }

    ns.tprint(`\n=== NFG ===`);
    ns.tprint(`Affordable levels (rep ignored): ${count}  ($${ns.format.number(totalNfgCost)})`);

    // Print per-level cost breakdown (up to 40 levels; mark the affordability cutoff)
    let runningTotal = 0;
    let lvlMult = Math.pow(PRICE_MULTIPLIER, numPending);
    for (let i = 0; i < 40; i++) {
      const price      = nfgData.basePrice * Math.pow(NFG_LVL_MULTIPLIER, startLevel + i);
      const cost       = price * lvlMult;
      runningTotal    += cost;
      lvlMult         *= PRICE_MULTIPLIER;
      const affordable = i < count ? "" : "  ✗";
      ns.tprint(`  Lvl ${startLevel + i + 1}: $${ns.format.number(cost)}  (total: $${ns.format.number(runningTotal)})${affordable}`);
    }

    ns.tprint(`Favor needed to donate: ${favorToDonate}`);
    for (const [name, f] of factions) {
      const diff = favorToDonate - f.favor;
      const tag  = diff <= 0 ? "can donate now" : `need ${diff.toFixed(1)} more favor`;
      ns.tprint(`  ${name}: ${f.favor.toFixed(1)} favor  —  ${tag}`);
    }
  }
}
