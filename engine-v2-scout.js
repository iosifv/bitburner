// Part of the engine-v2 system — engine-v2-scout.js: ScoutEngine runner
import { EngineStoke }              from "lib/engine-stoke.js";
import { reloadServers, printDiff } from "lib/scout.js";

class ScoutEngine extends EngineStoke {
  constructor(ns) { super(ns, "scout"); }
  async tick() {
    await reloadServers(this.ns);
    printDiff(this.ns);
  }
}

export async function main(ns) {
  ns.disableLog("ALL");
  const engine = new ScoutEngine(ns);
  while (true) {
    await engine.tick();
    await ns.sleep(engine.loopDelay);
  }
}
