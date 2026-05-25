// Part of the engine-v2 system — lib/batcher-math.js: HWGW batch/prep math via Formulas.exe

const SEC_PER_HACK   = 0.002;
const SEC_PER_GROW   = 0.004;
const SEC_PER_WEAKEN = 0.05;

export class BatchMath {
  #ns;
  #ram; // { hack, grow, weaken } GB/thread

  constructor(ns, ram) {
    this.#ns  = ns;
    this.#ram = ram;
  }

  /**
   * Compute a full HWGW batch plan for a prepped target (min-sec / max-money).
   * All timings assume the server stays at min-sec during the batch window.
   * Returns a plan object or null if the target is not hackable.
   */
  planBatch(target, { steal, stepGapMs, growMargin }) {
    const ns = this.#ns;
    const S  = ns.getServer(target);
    const P  = ns.getPlayer();

    // Simulate the fully-prepped state so formulas use min-sec / max-money
    const S0 = { ...S, hackDifficulty: S.minDifficulty, moneyAvailable: S.moneyMax };

    const hackPercent = ns.formulas.hacking.hackPercent(S0, P);
    if (!hackPercent || hackPercent <= 0) return null;

    const hackThreads = Math.max(1, Math.floor(steal / hackPercent));
    const actualSteal = hackThreads * hackPercent;

    const weaken1 = Math.ceil((hackThreads * SEC_PER_HACK) / SEC_PER_WEAKEN);

    // Post-hack money state for grow calculation
    const Sg = { ...S0, moneyAvailable: S0.moneyAvailable * (1 - actualSteal) };
    const grow = Math.ceil(this.#growThreads(Sg, P, S0.moneyAvailable) * growMargin);

    const weaken2 = Math.ceil((grow * SEC_PER_GROW) / SEC_PER_WEAKEN);

    const wt = ns.formulas.hacking.weakenTime(S0, P);
    const gt = ns.formulas.hacking.growTime(S0, P);
    const ht = ns.formulas.hacking.hackTime(S0, P);

    // Want finish order: H at T, W1 at T+gap, G at T+2*gap, W2 at T+3*gap.
    // Bind T = wt - stepGapMs so W1 offset = 0 (minimum non-negative).
    const T = wt - stepGapMs;
    const offsets = {
      hack:    Math.max(0, T - ht),
      weaken1: 0,
      grow:    Math.max(0, wt + stepGapMs - gt),
      weaken2: 2 * stepGapMs,
    };

    const threads = { hack: hackThreads, weaken1, grow, weaken2 };
    const ram     = this.#ram;
    const ramGB   = hackThreads * ram.hack + weaken1 * ram.weaken + grow * ram.grow + weaken2 * ram.weaken;

    return {
      target,
      threads,
      offsets,
      ramGB,
      hackPercent,
      expectedSteal: actualSteal,
      timesMs:       { hack: ht, grow: gt, weaken: wt },
      durationMs:    wt + 3 * stepGapMs,
      perOpRamGB:    { hack: ram.hack, grow: ram.grow, weaken: ram.weaken },
    };
  }

  /**
   * Compute threads needed to bring a server to min-sec / max-money (PREP phase).
   * Uses live server state — call every tick until prepped.
   */
  planPrep(target, { growMargin }) {
    const ns = this.#ns;
    const S  = ns.getServer(target);
    const P  = ns.getPlayer();

    const secOver      = S.hackDifficulty - S.minDifficulty;
    const weakenForSec = Math.max(0, Math.ceil(secOver / SEC_PER_WEAKEN));

    // Compute grow at best-case (min-sec) for the most accurate thread count
    const Sg          = { ...S, hackDifficulty: S.minDifficulty };
    const growToMax   = Math.max(0, Math.ceil(this.#growThreads(Sg, P, S.moneyMax) * growMargin));
    const weakenForGrow = Math.max(0, Math.ceil((growToMax * SEC_PER_GROW) / SEC_PER_WEAKEN));

    return { weakenForSec, growToMax, weakenForGrow };
  }

  // Feature-detects growThreads (v2.3+); falls back to log-based growPercent inversion.
  #growThreads(server, player, moneyMax) {
    const ns = this.#ns;
    if (typeof ns.formulas.hacking.growThreads === "function") {
      return ns.formulas.hacking.growThreads(server, player, moneyMax);
    }
    const growMult = ns.formulas.hacking.growPercent(server, 1, player, 1);
    if (!growMult || growMult <= 1) return 1000; // safety: vastly over-estimate
    const ratio = moneyMax / Math.max(server.moneyAvailable, 1);
    return Math.ceil(Math.log(ratio) / Math.log(growMult));
  }
}
