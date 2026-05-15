// Part of the engine-v2 system — engine-v2-stats.js: StatsEngine runner
import { EngineStoke }                        from "lib/engine-stoke.js";
import { sampleStats, diffStats, updateProfits } from "lib/stats.js";
import { getConfig }                           from "lib/config.js";

const STATE_FILE = "stats.json";

class StatsEngine extends EngineStoke {
  constructor(ns) {
    super(ns, "stats");
    this.last    = null;
    this.history = [];
    this.rows    = null;
    const raw = ns.read(STATE_FILE);
    if (raw && raw !== "NULL PORT DATA") {
      try { 
        this.history = JSON.parse(raw); 
        this.last = this.history.at(-1) ?? null;
      }
      catch {}
    }

    this.profits = { installEpoch: 0, byTarget: {} };
    const rawP = ns.read("profits.json");
    if (rawP && rawP !== "NULL PORT DATA") {
      try { this.profits = JSON.parse(rawP); } catch {}
    }
  }

  async tick() {
    const next = sampleStats(this.ns);
    this.rows = null;

    if (this.last != null) {
      this.rows = diffStats(this.last, next);

      for (const r of this.rows) {
        if (r.name === "__total") {
          this.log("TOTAL", `$/sec: ${this.ns.format.number(r.$perSec).padStart(8)}   targets: ${r.targets}`);
        } else {
          this.log(
            "TICK",
            `${r.name.padEnd(16)}  $stolen: ${this.ns.format.number(r.$stolen).padStart(8)}` +
            `   $/sec: ${this.ns.format.number(r.$perSec).padStart(8)}` +
            `   sec: ${r.secNow.toFixed(2)}/${r.secMin.toFixed(2)}` +
            `   procs: ${String(r.procs).padStart(3)}   threads: ${String(r.threads).padStart(5)}`,
          );
        }
      }
    } else {
      this.log("WARMUP", "no previous sample — collecting baseline");
    }

    const installEpoch = this.ns.getResetInfo().lastAugReset;
    updateProfits(this.profits, this.rows, next.ts, installEpoch);
    this.ns.write("profits.json", JSON.stringify(this.profits), "w");

    const cap = getConfig(this.ns, "stats-history-size");
    this.history.push(next);
    if (this.history.length > cap) this.history.splice(0, this.history.length - cap);
    this.ns.write(STATE_FILE, JSON.stringify(this.history), "w");
    this.last = next;
  }
}

export async function main(ns) {
  ns.disableLog("ALL");
  const engine = new StatsEngine(ns);
  while (true) {
    await engine.tick();
    await ns.sleep(engine.loopDelay);
  }
}
