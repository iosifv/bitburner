// Part of the engine-v2 system — lib/batcher-scheduler.js: PREP/BATCH phase machine


import { logPropulsion, logTail } from "lib/logger.js";

const HACK_SCRIPT   = "spores/leech-hack.js";
const GROW_SCRIPT   = "spores/enzyme-grow.js";
const WEAKEN_SCRIPT = "spores/mycelium-weaken.js";

const SEC_PER_WEAKEN = 0.05;
const SEC_PER_GROW   = 0.004;

/**
 * Orchestrates the PREP → BATCH phase machine for a single target.
 * PREP-WEAKEN: bring security to minimum.
 * PREP-GROW:   bring money to maximum (with counter-weaken).
 * BATCH:       fire shotgun HWGW batches via the injected SchedulingStrategy.
 *
 * Reads live ns.getServer() every tick — never trusts the stale servers.json cache.
 */
export class BatchScheduler {
  #math;
  #allocator;
  #strategy;

  // Ordered phase array — first phase whose shouldRun() returns true wins (cortex idiom).
  #phases;

  constructor(ns, { math, allocator, strategy }) {
    this.ns         = ns;
    this.#math      = math;
    this.#allocator = allocator;
    this.#strategy  = strategy;

    this.#phases = [
      {
        name:      "PREP-WEAKEN",
        shouldRun: (S, config) => S.hackDifficulty > S.minDifficulty + config.prepSecTolerance,
        tick:      (ctx) => this.#tickPrepWeaken(ctx),
      },
      {
        name:      "PREP-GROW",
        shouldRun: (S, config) => S.moneyAvailable < S.moneyMax * config.prepMoneyTolerance,
        tick:      (ctx) => this.#tickPrepGrow(ctx),
      },
      {
        name:      "BATCH",
        shouldRun: ()           => true,
        tick:      (ctx) => this.#tickBatch(ctx),
      },
    ];
  }

  /** Run one scheduler tick for the given target. Returns { phase, message }. */
  async tick({ target, zombies, snapshot, config, nextBatchId }) {
    const ns = this.ns;
    const S  = ns.getServer(target.name);
    const ctx = { ns, target, S, zombies, snapshot, config, nextBatchId };

    for (const phase of this.#phases) {
      if (phase.shouldRun(S, config)) return await phase.tick(ctx);
    }

    return { phase: "IDLE", message: `${target.name} — no phase matched` };
  }

  // ── PREP-WEAKEN ──────────────────────────────────────────────────────────────

  async #tickPrepWeaken({ ns, target, S, zombies, snapshot, config }) {
    const name = target.name;

    // Wait for in-flight weakens to finish — they'll handle the deficit
    const inFlight = this.#countInFlight(zombies, WEAKEN_SCRIPT, name);
    if (inFlight > 0) {
      return {
        phase:   "PREP-W",
        message: `${name}  sec:${S.hackDifficulty.toFixed(2)}/${S.minDifficulty.toFixed(2)}  waiting (${inFlight}t in-flight)`,
      };
    }

    const deficit  = S.hackDifficulty - S.minDifficulty;
    const threads  = Math.ceil(deficit / SEC_PER_WEAKEN);

    if (threads <= 0) return { phase: "PREP-W", message: `${name}  sec converging` };

    const weakenRam  = this.ns.getScriptRam(WEAKEN_SCRIPT, "home");
    const affordable = snapshot.reduce((n, h) => n + Math.floor(h.freeGB / weakenRam), 0);
    const toPlace    = Math.min(threads, affordable);

    if (toPlace <= 0) {
      const freeGB = snapshot.reduce((s, h) => s + h.freeGB, 0);
      return {
        phase:   "PREP-W",
        message: `${name}  sec:${S.hackDifficulty.toFixed(2)}/${S.minDifficulty.toFixed(2)}  no RAM (need ${threads}t, free:${freeGB.toFixed(1)}GB)`,
      };
    }

    const placed   = this.#allocator.place(snapshot, toPlace, weakenRam);
    const launched = await this.#execGroup(ns, WEAKEN_SCRIPT, placed, [name, 0]);
    logTail(this.ns, "OVERLORD","PREP-W", `${name}  deficit:${deficit.toFixed(2)}  weaken:${launched}/${threads}t (${toPlace} this tick)`);

    return {
      phase:   "PREP-W",
      message: `${name}  sec:${S.hackDifficulty.toFixed(2)}/${S.minDifficulty.toFixed(2)}  launched ${launched}t`,
    };
  }

  // ── PREP-GROW ────────────────────────────────────────────────────────────────

  async #tickPrepGrow({ ns, target, S, zombies, snapshot, config }) {
    const name = target.name;

    // Wait for in-flight grows to finish (counter-weakens handle security)
    const inFlight = this.#countInFlight(zombies, GROW_SCRIPT, name);
    if (inFlight > 0) {
      const pct = S.moneyMax > 0 ? ((S.moneyAvailable / S.moneyMax) * 100).toFixed(1) : "0.0";
      return {
        phase:   "PREP-G",
        message: `${name}  money:${pct}%  waiting (${inFlight}t in-flight)`,
      };
    }

    const prep = this.#math.planPrep(name, { growMargin: config.growMargin });
    if (prep.growToMax <= 0) return { phase: "PREP-G", message: `${name}  money converging` };

    const growRam   = this.ns.getScriptRam(GROW_SCRIPT, "home");
    const weakenRam = this.ns.getScriptRam(WEAKEN_SCRIPT, "home");

    const copy   = snapshot.map(h => ({ ...h }));
    const freeGB = copy.reduce((s, h) => s + h.freeGB, 0);

    if (freeGB < growRam) {
      return { phase: "PREP-GROW", message: `${name}  no RAM for grow (free:${freeGB.toFixed(1)}GB)` };
    }

    // Reserve weaken slots FIRST so grow's fragmentation can't crowd them out.
    // weaken count is tiny relative to grow, so it gets first pick of clean slots.
    const maxPossibleGrow = Math.min(prep.growToMax, Math.floor(freeGB / growRam));
    const weakenToPlace   = Math.ceil(maxPossibleGrow * SEC_PER_GROW / SEC_PER_WEAKEN);
    const weakPlaced      = this.#allocator.place(copy, weakenToPlace, weakenRam);

    // Fill remaining RAM with grow — partial is fine, multiple ticks allowed
    const affordableGrow = copy.reduce((n, h) => n + Math.floor(h.freeGB / growRam), 0);
    const growToPlace    = Math.min(prep.growToMax, affordableGrow);

    if (growToPlace <= 0) {
      return { phase: "PREP-GROW", message: `${name}  no RAM for grow after weaken reservation (free:${freeGB.toFixed(1)}GB)` };
    }

    const growPlaced = this.#allocator.place(copy, growToPlace, growRam);

    // Commit copy → snapshot
    for (let i = 0; i < snapshot.length; i++) snapshot[i].freeGB = copy[i].freeGB;

    // weaken naturally finishes after grow (wt > gt), so offset 0 is correct for both
    const gLaunched = await this.#execGroup(ns, GROW_SCRIPT,   growPlaced, [name, 0]);
    const wLaunched = await this.#execGroup(ns, WEAKEN_SCRIPT, weakPlaced, [name, 0]);

    logTail(this.ns, "OVERLORD","PREP-G", `${name}  grow:${gLaunched}/${prep.growToMax}t (${growToPlace} this tick)  weaken:${wLaunched}/${weakenToPlace}t`);

    const pct = S.moneyMax > 0 ? ((S.moneyAvailable / S.moneyMax) * 100).toFixed(1) : "0.0";
    return {
      phase:   "PREP-G",
      message: `${name}  money:${pct}%  launched grow+weaken`,
    };
  }

  // ── BATCH ────────────────────────────────────────────────────────────────────

  async #tickBatch({ ns, target, S, zombies, snapshot, config, nextBatchId, mode }) {
    const name      = target.name;
    const totalFree = this.#allocator.totalFreeGB(snapshot);

    // Plan with configured steal; if a single batch doesn't fit, scale steal down
    // proportionally until one batch fits (floor: 0.1% steal).
    let steal = config.steal;
    let plan  = this.#math.planBatch(name, { steal, stepGapMs: config.stepGapMs, growMargin: config.growMargin });

    if (!plan) {
      return { phase: "BATCH", message: `${name}  not hackable (hackPercent=0)` };
    }

    if (plan.ramGB > totalFree && totalFree > 0) {
      steal = Math.max(steal * (totalFree / plan.ramGB) * 0.80, 0.001);
      plan  = this.#math.planBatch(name, { steal, stepGapMs: config.stepGapMs, growMargin: config.growMargin });
      if (!plan) return { phase: "BATCH", message: `${name}  not hackable after steal scale` };
    }

    const concurrent = this.#allocator.concurrentCap(totalFree, plan.ramGB);

    if (concurrent <= 0) {
      return {
        phase:   "BATCH",
        message: `${name}  no RAM  plan:${plan.ramGB.toFixed(1)}GB free:${totalFree.toFixed(1)}GB`,
        plan,
      };
    }

    const launches = this.#strategy.schedule({
      allocator: this.#allocator, snapshot, plan, caps: { concurrent }, nextBatchId,
    });

    if (launches.length === 0) {
      return { phase: "BATCH", message: `${name}  strategy returned no launches`, plan };
    }

    // Aggregate placements across all shotgun batches: sum threads by host per operation.
    // All batches in a shotgun round share identical offsets, so consolidating into one
    // exec per host preserves HWGW timing while collapsing N×23-thread processes → 1.
    const aggHack    = this.#aggregate(launches.map(l => l.placements.hack));
    const aggWeaken1 = this.#aggregate(launches.map(l => l.placements.weaken1));
    const aggGrow    = this.#aggregate(launches.map(l => l.placements.grow));
    const aggWeaken2 = this.#aggregate(launches.map(l => l.placements.weaken2));

    const hLaunched  = await this.#execGroup(ns, HACK_SCRIPT,   aggHack,    [name, plan.offsets.hack]);
    const w1Launched = await this.#execGroup(ns, WEAKEN_SCRIPT, aggWeaken1, [name, plan.offsets.weaken1]);
    const gLaunched  = await this.#execGroup(ns, GROW_SCRIPT,   aggGrow,    [name, plan.offsets.grow]);
    const w2Launched = await this.#execGroup(ns, WEAKEN_SCRIPT, aggWeaken2, [name, plan.offsets.weaken2]);

    const batchesLaunched = (hLaunched > 0 && w1Launched > 0 && gLaunched > 0 && w2Launched > 0) ? launches.length : 0;

    const secStr   = `${S.hackDifficulty.toFixed(1)}/${S.minDifficulty.toFixed(1)}`;
    const stealStr = (plan.expectedSteal * 100).toFixed(1);
    const scaledNote = steal < config.steal ? ` (scaled from ${(config.steal*100).toFixed(0)}%)` : "";
    const msg = `${name.padEnd(20)} batches:${String(batchesLaunched).padStart(5)}  steal:${stealStr}%${scaledNote}  sec:${secStr}`;
    logTail(this.ns, "OVERLORD","BATCH", msg);
    return { phase: "BATCH", message: msg, plan };
  }

  // ── helpers ──────────────────────────────────────────────────────────────────

  #countInFlight(zombies, script, target) {
    let count = 0;
    for (const z of zombies) {
      for (const p of this.ns.ps(z.name)) {
        if (p.filename === script && p.args[0] === target) count += p.threads;
      }
    }
    return count;
  }

  #aggregate(placementArrays) {
    const map = new Map();
    for (const group of placementArrays) {
      for (const { host, threads } of group) {
        map.set(host, (map.get(host) ?? 0) + threads);
      }
    }
    return [...map.entries()].map(([host, threads]) => ({ host, threads }));
  }

  async #execGroup(ns, script, placements, args) {
    let launched = 0;
    for (const { host, threads } of placements) {
      if (!threads || threads <= 0) continue;
      const pid = ns.exec(script, host, threads, ...args);
      if (pid > 0) {
        launched += threads;
      } else {
        logPropulsion(ns, "OVERLORD", "WARN", `exec failed: ${script} on ${host} (${threads}t)`);
      }
    }
    return launched;
  }
}
