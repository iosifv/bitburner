// Part of the engine-v2 system — engine-v2-darknet.js: DarknetEngine runner
import { EngineStoke } from "lib/engine-stoke.js";
import { log }         from "lib/logger.js";

const DARKNET_PORT = 666;
const SPORE        = "spores/darknet-probe.js";
const DEVELOPMENT_MODE = true; 

class DarknetEngine extends EngineStoke {
  constructor(ns) {
    super(ns, "darknet");
  }

  log(action, message) {
    log(this.ns, "print", "DARKNET", action, message);
  }

  async spread(node) {
    const darknetServer = this.ns.dnet.getServerDetails(node);

    if (!darknetServer.isOnline || !darknetServer.isConnectedToCurrentServer) {
      this.log("SKIP", `unreachable → ${node}`);
      return;
    }

    // this.log("ENGINE", `discovered → ${node}  details: ${JSON.stringify(darknetServer, null, 2)}`);

    // if (!darknetServer.hasSession) {
    //   // ZeroLogon: empty password — attempt auth to establish a session
    //   const result = await this.ns.dnet.authenticate(node, "");
    //   if (!result.success) return;
    //   this.log("AUTH", `session established → ${node}`);
    // }

    if (this.ns.isRunning(SPORE, node)) {
      if (!DEVELOPMENT_MODE) {
        return;
      }
      this.log("REFRESH", `killing spore → ${node}`);
      this.ns.kill(SPORE, node);
    }

    const copyResult = this.ns.scp(SPORE, node, "home");
    this.log("SPREAD", `scp ${copyResult ? "succeeded" : "failed"} → ${node}`);

    const pid = this.ns.exec(SPORE, node, { preventDuplicates: true });

    if (pid) {
      this.log("SPREAD", `spore deployed → ${node}  pid:${pid}`);
    }
  }

  async tick() {
    // Spread spore to every directly-connected darknet node
    for (const node of this.ns.dnet.probe()) {
      await this.spread(node);
    }

    // Drain incoming spore reports
    let entry;
    while ((entry = this.ns.readPort(DARKNET_PORT)) !== "NULL PORT DATA") {
      try {
        const { host, nodes } = JSON.parse(entry);
        this.log(entry);
        this.log("REPORT", `[${host.padEnd(20)}] ${nodes.length} nodes: ${nodes.join(", ")}`);
      } catch {
        // ignore malformed
      }
    }
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
