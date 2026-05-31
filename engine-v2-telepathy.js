// Part of the engine-v2 system — engine-v2-telepathy.js: TelepathyEngine runner
import { EngineStoke }    from "lib/engine-stoke.js";
import { tickTelepathy }  from "lib/telepathy.js";

class TelepathyEngine extends EngineStoke {
  constructor(ns) { super(ns, "telepathy"); }
  async tick() { await tickTelepathy(this.ns, "port"); }
}

export async function main(ns) {
  ns.disableLog("ALL");
  const engine = new TelepathyEngine(ns);
  while (true) {
    await engine.tick();
    await ns.sleep(engine.loopDelay);
  }
}
