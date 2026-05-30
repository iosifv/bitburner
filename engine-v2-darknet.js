// Part of the engine-v2 system — engine-v2-darknet.js: DarknetEngine runner
import { EngineStoke } from "lib/engine-stoke.js";

const DARKNET_PORT     = 666;
const SPORE            = "spores/darknet-probe.js";
const STALE_TIMEOUT_MS = 30_000;
const RED              = String.fromCharCode(27) + "[31m";
const YELLOW           = String.fromCharCode(27) + "[33m";
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
    this.ns.print(action.padEnd(10) + message);
  }

  get expectedV() {
    return sporeFingerprint(this.ns.read(SPORE));
  }

  async spread(node) {
    const darknetServer = this.ns.dnet.getServerDetails(node);
    if (!darknetServer.isOnline || !darknetServer.isConnectedToCurrentServer || !darknetServer.hasSession) {
      this.log("SKIP", `unreachable → ${node}`);
      return;
    }

    const sporeRam = this.ns.getScriptRam(SPORE, "home");
    const nodeRam  = this.ns.getServerMaxRam(node);
    if (nodeRam < sporeRam) {
      this.log("SKIP", `low RAM ${nodeRam}GB < ${sporeRam}GB → ${node}`);
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
        const { host, v, node, auth, serverInfo, dbg, strategy, server, error, phishing, caches, files } = JSON.parse(entry);
        if (host && v) this.nodeVersionMap.set(host, { v, ts: Date.now() });
        if (phishing)           { this.log("PHISH ", `${(host ?? "?").padEnd(20)}  ${JSON.stringify(phishing)}`); if (!node) continue; }
        if (caches?.length)     { this.log("CACHE ", `${(host ?? "?").padEnd(20)}  ${JSON.stringify(caches)}`);  continue; }
        if (dbg === "server-dump")   { this.log("DUMP  ", `${node}  ${JSON.stringify(server)}`);           continue; }
        if (dbg === "action-error")  { this.ns.print(`${YELLOW}ACT!!     ${strategy} → ${node}  err=${error}${RESET}`); continue; }
        if (dbg === "ls-result")     { this.log("LS    ", `${node}  ${JSON.stringify(files)}`);             continue; }
        if (!node) continue;

        if (auth?.success) {
          this.log("AUTH  ", `${(host ?? "?").padEnd(20)} → ${node.padEnd(24)}  [${auth.strategy}]`);
        } else {
          const h = host ?? "?";
          this.ns.print(`${RED}AUTH FAIL  ${h.padEnd(20)} → ${node}${RESET}`);
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
    if (stale.length)   this.ns.print(`${YELLOW}STALE     ${stale.join("  ")}${RESET}`);
    if (silent.length)  this.ns.print(`${YELLOW}SILENT    ${silent.join("  ")}${RESET}`);
  }

  floodStale() {
    const expected = this.expectedV;
    for (const [node, { v, ts }] of this.nodeVersionMap) {
      if (Date.now() - ts > STALE_TIMEOUT_MS) continue;
      if (v === expected) continue;
      const ok  = this.ns.scp(SPORE, node, "home");
      const pid = this.ns.exec(SPORE, node, { preventDuplicates: false });
      if (pid) this.log("FLOOD ", `scp=${ok ? "ok" : "fail"} pid=${pid} → ${node}`);
    }
  }

  async tick() {
    for (const node of this.ns.dnet.probe()) {
      await this.spread(node);
    }
    this.floodStale();
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
