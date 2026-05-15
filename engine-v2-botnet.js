// Part of the engine-v2 system — engine-v2-botnet.js: BotnetEngine runner
import { EngineStoke }               from "lib/engine-stoke.js";
import { buyServers, upgradeServers } from "lib/botnet.js";
import { getConfig }                  from "lib/config.js";

class BotnetEngine extends EngineStoke {
  constructor(ns) { super(ns, "botnet"); }
  async tick() {
    this.log("TICK", "checking botnet...");
    buyServers(this.ns, "port");
    upgradeServers(this.ns, "port");
  }
}

export async function main(ns) {
  ns.disableLog("ALL");
  const engine = new BotnetEngine(ns);
  while (true) {
    await engine.tick();
    await ns.sleep(engine.loopDelay);
  }
}
