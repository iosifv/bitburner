// Part of the engine-v2 system — engine-v2-batching.js: BatcherEngine runner
import { EngineStoke }     from "lib/engine-stoke.js";
import { getConfig }       from "lib/config.js";
import { getServers }      from "lib/scout.js";
import { BatchMath }       from "lib/batcher-math.js";
import { RamAllocator }    from "lib/batcher-allocator.js";
import { BatchScheduler }  from "lib/batcher-scheduler.js";
import { ShotgunStrategy } from "lib/batcher-strategies.js";
import { pickTarget }      from "lib/batcher-targeting.js";

const HACK_SCRIPT   = "spores/leech-hack.js";
const GROW_SCRIPT   = "spores/enzyme-grow.js";
const WEAKEN_SCRIPT = "spores/mycelium-weaken.js";
const BACTERIA      = "spores/bacteria.js"; // legacy — swept on first tick

class BatcherEngine extends EngineStoke {
  #batchId = 0;
  #swept   = false;

  constructor(ns) {
    super(ns, "batching"); // reuses enable-batching / loop-delay-batching config
    if (!ns.formulas?.hacking) throw new Error("BatcherEngine requires Formulas.exe");

    const ram = {
      hack:   ns.getScriptRam(HACK_SCRIPT,   "home"),
      grow:   ns.getScriptRam(GROW_SCRIPT,   "home"),
      weaken: ns.getScriptRam(WEAKEN_SCRIPT, "home"),
    };

    this.math      = new BatchMath(ns, ram);
    this.allocator = new RamAllocator(ns, getConfig(ns, "engine-free-home-ram"));
    this.scheduler = new BatchScheduler(ns, {
      math:      this.math,
      allocator: this.allocator,
      strategy:  new ShotgunStrategy(),
    });
  }

  get config() {
    const ns = this.ns;
    return {
      steal:              getConfig(ns, "batching-steal-fraction"),
      stepGapMs:          getConfig(ns, "batching-step-gap-ms"),
      growMargin:         getConfig(ns, "batching-grow-margin"),
      prepSecTolerance:   getConfig(ns, "batching-prep-sec-tolerance"),
      prepMoneyTolerance: getConfig(ns, "batching-prep-money-tolerance"),
      switchMargin:       getConfig(ns, "batching-switch-margin"),
      forcedTarget:       getConfig(ns, "batching-forced-target"),
    };
  }

  async tick() {
    const ns = this.ns;

    // One-time: kill legacy bacteria.js workers still running from the old saturation dispatch
    if (!this.#swept) await this.#sweep();

    const config  = this.config;
    const zombies = getServers(ns, "zombies");

    // Ensure the three spores exist on every zombie (scout distributes on reload,
    // but mycelium-weaken.js is new and may not be there until the next scout cycle)
    for (const z of zombies) {
      for (const spore of [HACK_SCRIPT, GROW_SCRIPT, WEAKEN_SCRIPT]) {
        if (!ns.fileExists(spore, z.name)) await ns.scp(spore, z.name, "home");
      }
    }

    const target = await pickTarget(ns, config);
    if (!target) {
      this.log("IDLE", "no hackable victim found");
      this.#printDebug(null, zombies, [], { phase: "IDLE", message: "no hackable target" });
      return;
    }

    // Kill any spore workers targeting a different server than the current target.
    // This reclaims RAM immediately when the target switches, instead of waiting
    // for long-running workers (minutes of additionalMsec delay) to expire on their own.
    this.#evictStale(target.name, zombies);

    const snapshot = this.allocator.snapshot(zombies);
    const result   = await this.scheduler.tick({
      target, zombies, snapshot, config,
      mode:        "port",
      nextBatchId: () => ++this.#batchId,
    });

    this.log(result.phase, result.message);
    this.#printDebug(target, zombies, snapshot, result);
  }

  // ── debug dashboard ───────────────────────────────────────────────────────────

  #printDebug(target, zombies, snapshot, result) {
    const ns  = this.ns;
    const cfg = this.config;
    ns.clearLog();

    const SEP  = "─".repeat(52);
    const time = new Date().toLocaleTimeString();

    if (!target) {
      ns.print(`══ BATCHER  ${time} ${"═".repeat(26)}`);
      ns.print("  IDLE — no hackable target found");
      return;
    }

    const S      = ns.getServer(target.name);
    const secD   = S.hackDifficulty - S.minDifficulty;
    const monPct = S.moneyMax > 0 ? (S.moneyAvailable / S.moneyMax * 100) : 0;
    const secOk  = secD <= cfg.prepSecTolerance;
    const monOk  = monPct >= cfg.prepMoneyTolerance * 100;

    ns.print(`══ BATCHER  ${time} ${"═".repeat(26)}`);
    ns.print(`  Phase     ${result.phase}   Target: ${target.name}`);
    ns.print(`  Sec       ${S.hackDifficulty.toFixed(2)} / ${S.minDifficulty.toFixed(2)}  Δ=${secD.toFixed(2)}  ${secOk ? "✓" : "weakening..."}`);
    ns.print(`  Money     ${ns.format.number(S.moneyAvailable)} / ${ns.format.number(S.moneyMax)}  ${monPct.toFixed(1)}%  ${monOk ? "✓" : "growing..."}`);
    ns.print(SEP);

    // Fleet
    const totalFree = snapshot.reduce((s, h) => s + h.freeGB, 0);
    const totalMax  = zombies.reduce((s, z) => s + ns.getServerMaxRam(z.name), 0);
    const usedPct   = totalMax > 0 ? ((1 - totalFree / totalMax) * 100).toFixed(0) : "?";
    ns.print(`  Fleet     ${zombies.length} servers  ${ns.format.ram(totalFree)} free / ${ns.format.ram(totalMax)} total  (${usedPct}% used)`);

    const homeReserve = getConfig(ns, "engine-free-home-ram");
    for (const { host, freeGB } of snapshot) {
      const maxRam   = ns.getServerMaxRam(host);
      const usedFrac = maxRam > 0 ? Math.min(1, (maxRam - freeGB) / maxRam) : 1;
      const filled   = Math.round(usedFrac * 10);
      const bar      = "█".repeat(filled) + "░".repeat(10 - filled);
      const note     = host === "home" ? `  (${homeReserve}GB rsv)` : "";
      ns.print(`    ${host.padEnd(20)} [${bar}]  ${ns.format.ram(freeGB)} free${note}`);
    }
    ns.print(SEP);

    // Plan (returned by BATCH phase)
    if (result.plan) {
      const p        = result.plan;
      const hpct     = (p.hackPercent * 100).toFixed(4);
      const stealStr = (p.expectedSteal * 100).toFixed(2);
      const cfgStr   = (cfg.steal * 100).toFixed(0);
      const scaled   = p.expectedSteal < cfg.steal * 0.99 ? `  (cfg ${cfgStr}%)` : "";
      const t        = p.threads;
      const total    = t.hack + t.weaken1 + t.grow + t.weaken2;
      const conc     = this.allocator.concurrentCap(totalFree, p.ramGB);
      const fmt = ms => ms >= 60000
        ? `${(ms/60000).toFixed(1)}m`
        : `${(ms/1000).toFixed(1)}s`;
      ns.print(`  Plan      hackPct ${hpct}%/t   steal ${stealStr}%${scaled}`);
      ns.print(`            H:${t.hack}  W1:${t.weaken1}  G:${t.grow}  W2:${t.weaken2}  (${total}t)`);
      ns.print(`            ${ns.format.ram(p.ramGB)}/batch   ${conc} concurrent`);
      ns.print(`  Timings   hack ${fmt(p.timesMs.hack)}  grow ${fmt(p.timesMs.grow)}  weaken ${fmt(p.timesMs.weaken)}  (batch ${fmt(p.durationMs)})`);
      ns.print(SEP);
    }

    // In-flight spore counts across all zombies
    let hack = 0, grow = 0, weaken = 0;
    for (const z of zombies) {
      for (const proc of ns.ps(z.name)) {
        if (proc.filename === HACK_SCRIPT)   hack   += proc.threads;
        if (proc.filename === GROW_SCRIPT)   grow   += proc.threads;
        if (proc.filename === WEAKEN_SCRIPT) weaken += proc.threads;
      }
    }
    const total = hack + grow + weaken;
    ns.print(`  In-flight  H:${hack}t  G:${grow}t  W:${weaken}t  total:${total}t`);
  }

  // Kill spore workers targeting any server other than `currentTarget`.
  // Runs every tick so a target switch never leaves RAM stranded for minutes.
  #evictStale(currentTarget, zombies) {
    const SPORES = [HACK_SCRIPT, GROW_SCRIPT, WEAKEN_SCRIPT];
    let killed = 0;
    for (const z of zombies) {
      for (const p of this.ns.ps(z.name)) {
        if (SPORES.includes(p.filename) && p.args[0] !== currentTarget) {
          this.ns.kill(p.pid);
          killed++;
        }
      }
    }
    if (killed > 0) this.log("EVICT", `freed ${killed} stale worker(s)`);
  }

  // Kill any lingering bacteria.js infinite-loop workers on every zombie (migration step)
  async #sweep() {
    const zombies = getServers(this.ns, "zombies");
    let killed = 0;
    for (const z of zombies) {
      for (const p of this.ns.ps(z.name)) {
        if (p.filename === BACTERIA) {
          this.ns.kill(p.pid);
          killed++;
        }
      }
    }
    this.#swept = true;
    if (killed > 0) this.log("SWEEP", `killed ${killed} legacy bacteria.js worker(s)`);
  }
}

export async function main(ns) {
  ns.disableLog("ALL");
  ns.ui.openTail();
  const engine = new BatcherEngine(ns);
  while (true) {
    await engine.tick();
    await ns.sleep(engine.loopDelay);
  }
}
