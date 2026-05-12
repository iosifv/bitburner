// Part of the engine-v2 system — engine-v2-scout.js: ScoutEngine runner
import { EngineStoke }              from "lib/engine-stoke.js";
import { reloadServers, printDiff } from "lib/scout.js";

class ScoutEngine extends EngineStoke {
  constructor(ns) { super(ns, "scout"); }
  async tick() {
    this.log("TICK", "scouting...");
    await reloadServers(this.ns, "silent");
    printDiff(this.ns, "port");
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
