// Part of the engine-v2 system — engine-v2-batching.js: BatchingEngine runner
import { EngineStoke }   from "lib/engine-stoke.js";
import { dispatch }      from "lib/batch.js";
import { tickTelepathy } from "lib/telepathy.js";
import { getConfig }     from "lib/config.js";

class BatchingEngine extends EngineStoke {
  constructor(ns) { super(ns, "batching"); }
  async tick() {
    this.log("TICK", "dispatching...");
    // Phase 1: telepathy claims its RAM budget before hack workers fill the rest
    if (getConfig(this.ns, "enable-telepathy")) {
      await tickTelepathy(this.ns, "port");
    }
    // Phase 2: spread bacteria across remaining free RAM
    await dispatch(this.ns, "port");
  }
}

export async function main(ns) {
  ns.disableLog("ALL");
  const engine = new BatchingEngine(ns);
  while (true) {
    await engine.tick();
    await ns.sleep(engine.loopDelay);
  }
}
