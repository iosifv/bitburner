
// EDIT: I think I have a bug somewhere, causing the NFG buys to sometime be in the wrong position.
// EDIT2: found the bug, lastIndexOf should be replaced by findLastIndex and the condition about the index being -1 should be removed. (edited)Tuesday, 19 May 2026 at 00:36



class Planner {
  constructor(
    ns,
    availableAugs,
    currentAugs,
    factions,
    player,
    numPending,
    favorToDonate,
  ) {
    this.ns = ns;
    this.availableAugs = structuredClone(availableAugs);
    this.currentAugs = structuredClone(currentAugs);
    this.factions = structuredClone(factions);
    this.player = structuredClone(player);
    this.numPending = numPending;
    this.favorToDonate = favorToDonate;

    for (const name of this.availableAugs.keys()) {
      if (name != NFG && this.currentAugs.has(name)) {
        this.ns.print(`Already owned: ${name}`);
        this.availableAugs.delete(name);
      }
    }
    for (const [name, aug] of this.availableAugs) {
      if (!this.isGoodAug(name, aug.stats)) {
        this.ns.print(`Not good: ${name}`);
        this.availableAugs.delete(name);
      }
    }
  }

  plan() {
    let available = structuredClone(this.availableAugs);
    let current = structuredClone(this.currentAugs);
    let ret = [];
    while (true) {
      let selected = null;
      let selectedRet = null;
      let selectedBasePrice = Infinity;
      for (const [name, aug] of available) {
        if (name == NFG || aug.basePrice >= selectedBasePrice) continue;
        if (!aug.prereq.every((prereq) => current.has(prereq))) {
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
        let prereq = [],
          nonPrereq = [];
        for (const r of ret) {
          (aug.prereq.includes(r.name) ? prereq : nonPrereq).push({ ...r });
        }
        let newRet = [
          ...prereq,
          { name: name, basePrice: aug.basePrice, repReq: aug.repReq },
          ...nonPrereq,
        ];
        this.updateFactions(newRet);
        const newCost = this.simulateCost(newRet);
        if (newCost <= this.player.money * 0.999) {
          selected = name;
          selectedRet = newRet;
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
    let nfgs = [];
    while (true) {
      const aug = available.get(NFG);
      if (aug === undefined) break;
      const faction = this.findFactionFor(aug, this.factions);
      if (faction === null) break;
      const level = current.get(NFG) ?? 0;
      const levelBasePrice =
        aug.basePrice * Math.pow(NFG_LVL_MULTIPLIER, level);
      let splitIndex = ret.lastIndexOf((r) => r.basePrice >= levelBasePrice);
      if (splitIndex === -1) splitIndex = ret.length;
      let newNfg = { name: NFG, basePrice: levelBasePrice, repReq: aug.repReq };
      let newRet = [
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
      let nfgPrice = nfgs.at(-1).basePrice;
      let splitIndex = ret.lastIndexOf((r) => r.basePrice >= nfgPrice);
      if (splitIndex === -1) splitIndex = ret.length;
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
    let factions = structuredClone(this.factions);
    for (const b of buys) {
      const aug = { ...this.availableAugs.get(b.name), repReq: b.repReq };
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
      Object.entries(stats).some(([k, v]) => v != 1 && GOOD_STATS.has(k))
    );
  }

  findFactionFor(aug, factions) {
    let ret = null;
    let donationRep = -1;
    for (const name of aug.factions) {
      const f = factions.get(name);
      if (f.rep >= aug.repReq) return { faction: name, donation: 0 };
      if (f.favor < this.favorToDonate) continue;
      if (donationRep < f.rep) {
        ret = {
          faction: name,
          // Small multiplier so we don't get screwed by floating point and rounding.
          donation:
            1.01 *
            this.ns.formulas.reputation.donationForRep(
              aug.repReq - f.rep,
              this.player,
            ),
        };
        donationRep = f.rep;
      }
    }
    return ret;
  }
}