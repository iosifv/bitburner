// Part of the engine-v2 system — lib/batcher-strategies.js: scheduling strategy pattern

/**
 * Abstract scheduling strategy.
 * Subclasses decide HOW to fill available RAM with batches (shotgun vs JIT).
 * The math, allocation, and exec logic never change between strategies.
 */
export class SchedulingStrategy {
  /** @param {Object} ctx  { allocator, snapshot, plan, caps, nextBatchId } */
  schedule(_ctx) {
    throw new Error("SchedulingStrategy.schedule() is abstract");
  }
}

/**
 * Shotgun strategy: fill all available RAM with identical HWGW batches launched "now".
 * All batches use the same pre-computed plan and timing offsets.
 * Each batch is differentiated only by its batchId (useful for future JIT tracking).
 */
export class ShotgunStrategy extends SchedulingStrategy {
  schedule({ allocator, snapshot, plan, caps, nextBatchId }) {
    const launches = [];
    for (let i = 0; i < caps.concurrent; i++) {
      const placements = allocator.placeBatch(snapshot, plan);
      if (!placements) break; // RAM exhausted
      launches.push({ batchId: nextBatchId(), placements });
    }
    return launches;
  }
}

/**
 * JIT (Just-In-Time) strategy stub.
 * Time-slices batch launches so each HWGW window is staggered across the weakenTime,
 * maximising RAM efficiency by interleaving multiple batches.
 * Reads BATCH_DONE_PORT (101) completion signals to self-correct timing drift.
 */
export class JitStrategy extends SchedulingStrategy {
  schedule(_ctx) {
    // TODO: schedule one batch per (4*stepGapMs) window; drain BATCH_DONE_PORT to
    // confirm landings and adjust the next launch window. Same BatchMath/RamAllocator
    // and spores — only this method changes.
    throw new Error("JitStrategy not yet implemented — use ShotgunStrategy");
  }
}
