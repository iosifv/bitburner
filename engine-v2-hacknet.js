// Part of the engine-v2 system — engine-v2-hacknet.js: HacknetEngine runner
import { EngineStoke } from "lib/engine-stoke.js";
import { tickHacknet } from "lib/hacknet.js";

class HacknetEngine extends EngineStoke {
  constructor(ns) { super(ns, "hacknet"); }
  async tick() {
    this.log("TICK", "hacknet cycle...");
    tickHacknet(this.ns, "port");
  }
}

export async function main(ns) {
  ns.disableLog("ALL");
  const engine = new HacknetEngine(ns);
  while (true) {
    await engine.tick();
    await ns.sleep(engine.loopDelay);
  }
}
