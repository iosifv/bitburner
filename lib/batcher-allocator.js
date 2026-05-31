// Part of the engine-v2 system — lib/batcher-allocator.js: RAM allocation across zombie fleet


export class RamAllocator {
  #homeReserveGB;

  constructor(ns, homeReserveGB) {
    this.ns             = ns;
    this.#homeReserveGB = homeReserveGB;
  }

  /** Build a free-RAM snapshot of the zombie fleet, sorted largest-first. */
  snapshot(zombies) {
    return zombies.map(z => {
      const reserve = z.name === "home" ? this.#homeReserveGB : 0;
      const freeGB  = Math.max(0,
        this.ns.getServerMaxRam(z.name) - this.ns.getServerUsedRam(z.name) - reserve);
      return { host: z.name, freeGB };
    }).sort((a, b) => b.freeGB - a.freeGB);
  }

  totalFreeGB(snapshot) {
    return snapshot.reduce((s, h) => s + h.freeGB, 0);
  }

  /**
   * First-fit-decreasing placement of `threads` × `perThreadGB` across snapshot hosts.
   * Splitting across hosts is allowed. MUTATES snapshot.freeGB.
   * Returns [{host, threads}] if fully placed, or [] on failure.
   */
  place(snapshot, threads, perThreadGB) {
    if (threads <= 0) return [];
    const placements = [];
    let remaining = threads;
    for (const entry of snapshot) {
      if (remaining <= 0) break;
      const canFit = Math.floor(entry.freeGB / perThreadGB);
      if (canFit <= 0) continue;
      const take = Math.min(canFit, remaining);
      placements.push({ host: entry.host, threads: take });
      entry.freeGB -= take * perThreadGB;
      remaining    -= take;
    }
    return remaining > 0 ? [] : placements;
  }

  /**
   * Transactional placement of all 4 HWGW op groups.
   * Plans against a copy of the snapshot; commits only when all groups fit.
   * Returns { hack, weaken1, grow, weaken2 } placement arrays, or null if any group fails.
   */
  placeBatch(snapshot, plan) {
    const copy = snapshot.map(h => ({ ...h }));
    const ram  = plan.perOpRamGB;
    const t    = plan.threads;

    // Place largest group first to minimise fragmentation (FFD heuristic)
    const order = [
      { key: "grow",    threads: t.grow,    perGB: ram.grow   },
      { key: "weaken2", threads: t.weaken2, perGB: ram.weaken },
      { key: "weaken1", threads: t.weaken1, perGB: ram.weaken },
      { key: "hack",    threads: t.hack,    perGB: ram.hack   },
    ];

    const result = {};
    for (const { key, threads, perGB } of order) {
      const placed = this.place(copy, threads, perGB);
      if (!placed.length && threads > 0) return null; // couldn't fit — abort entire batch
      result[key] = placed;
    }

    // Commit: apply copy back to the original snapshot, then re-sort so the next
    // placeBatch call favours whichever host now has the most free RAM.
    // Without this, FFD would fill one host completely before touching the others.
    for (let i = 0; i < snapshot.length; i++) snapshot[i].freeGB = copy[i].freeGB;
    snapshot.sort((a, b) => b.freeGB - a.freeGB);

    return result;
  }

  /** Upper bound on concurrent batches that fit in available RAM. */
  concurrentCap(totalFreeGB, planRamGB) {
    return planRamGB > 0 ? Math.floor(totalFreeGB / planRamGB) : 0;
  }
}
