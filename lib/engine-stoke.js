// Part of the engine-v2 system — lib/engine-stoke.js: EngineStoke base class
import { getConfig }              from "lib/quonfig.js";
import { logPropulsion, LOG_PORT } from "lib/logger.js";

export { LOG_PORT };

export class EngineStoke {
  constructor(ns, name) {
    this.ns   = ns;
    this.name = name;
  }

  get enabled()   { return getConfig(this.ns, `enable-${this.name}`); }
  get loopDelay() { return this.ns.args[0] * 1000; }

  log(action, message) {
    logPropulsion(this.ns, this.name.toUpperCase(), action, message);
  }

  async tick() {
    throw new Error(`${this.name}: tick() not implemented`);
  }
}
