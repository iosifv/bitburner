// Part of the engine-v2 system — engine-v2-darknet.js: DarknetEngine runner
import { EngineStoke } from "lib/engine-stoke.js";
import { log }         from "lib/logger.js";

const DARKNET_PORT     = 666;
const SPORE            = "spores/darknet-probe.js";
const STALE_TIMEOUT_MS = 30_000;
const RED              = String.fromCharCode(27) + "[31m";
const RESET            = String.fromCharCode(27) + "[0m";

function sporeFingerprint(content) {
  let h = 0;
  for (let i = 0; i < content.length; i++) h = (h * 31 + content.charCodeAt(i)) >>> 0;
  return (h >>> 0).toString(16).padStart(8, "0");
}

class DarknetEngine extends EngineStoke {
  constructor(ns) {
    super(ns, "darknet");
    this.nodeVersionMap = new Map(); // node → { v, ts }
  }

  log(action, message) {
    log(this.ns, "print", "DARKNET", action, message);
  }

  get expectedV() {
    return sporeFingerprint(this.ns.read(SPORE));
  }

  async spread(node) {
    const darknetServer = this.ns.dnet.getServerDetails(node);
    if (!darknetServer.isOnline || !darknetServer.isConnectedToCurrentServer) {
      this.log("SKIP", `unreachable → ${node}`);
      return;
    }

    const known   = this.nodeVersionMap.get(node);
    const fresh   = known && (Date.now() - known.ts) < STALE_TIMEOUT_MS;
    const current = known?.v === this.expectedV;
    const running = this.ns.isRunning(SPORE, node);

    if (running && current && fresh) return;

    if (running) {
      this.log("REFRESH", `stale v=${known?.v ?? "?"} → ${node}`);
      this.ns.kill(SPORE, node);
    }

    const ok  = this.ns.scp(SPORE, node, "home");
    const pid = this.ns.exec(SPORE, node, { preventDuplicates: true });
    this.log("SPREAD", `scp=${ok ? "ok" : "fail"} pid=${pid} → ${node}`);
  }

  drainPort() {
    let entry;
    while ((entry = this.ns.readPort(DARKNET_PORT)) !== "NULL PORT DATA") {
      try {
        const { host, v, node, auth, actions, serverInfo } = JSON.parse(entry);
        if (host && v) this.nodeVersionMap.set(host, { v, ts: Date.now() });
        if (!node) continue;

        if (auth?.success) {
          this.log("AUTH  ", `${(host ?? "?").padEnd(20)} → ${node.padEnd(24)}  [${auth.strategy}]`);
          if (actions?.length) {
            this.log("ACTION", JSON.stringify(actions, null, 2));
          }
        } else {
          const h = host ?? "?";
          this.ns.print(`${RED}[DARKNET]   AUTH FAIL  ${h.padEnd(20)} → ${node}${RESET}`);
          if (serverInfo) {
            this.ns.print(`${RED}${JSON.stringify(serverInfo, null, 2)}${RESET}`);
          }
        }
      } catch {
        // ignore malformed
      }
    }
  }

  logConvergence() {
    if (this.nodeVersionMap.size === 0) return;

    const expected = this.expectedV;
    const current  = [];
    const stale    = [];
    const silent   = [];

    for (const [node, { v, ts }] of this.nodeVersionMap) {
      if (Date.now() - ts > STALE_TIMEOUT_MS) { silent.push(node); continue; }
      if (v === expected) current.push(node);
      else stale.push(`${node}(${v})`);
    }

    this.log("VERSION", `expected=${expected}`);
    if (current.length) this.log("OK    ", current.join("  "));
    if (stale.length)   this.log("STALE ", stale.join("  "));
    if (silent.length)  this.log("SILENT", silent.join("  "));
  }

  async tick() {
    for (const node of this.ns.dnet.probe()) {
      await this.spread(node);
    }
    this.drainPort();
    this.logConvergence();
  }
}

export async function main(ns) {
  ns.disableLog("ALL");
  ns.ui.openTail();

  const engine = new DarknetEngine(ns);

  while (true) {
    await engine.tick();
    await ns.sleep(engine.loopDelay);
  }
}
