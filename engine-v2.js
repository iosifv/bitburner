// Part of the engine-v2 system — engine-v2.js: orchestrator (port drain + spawn/kill supervisor)
import { LOG_PORT, log } from "lib/logger.js";
import { getConfig }     from "lib/config.js";

const SUB_ENGINES = [
  { name: "scout",    script: "engine-v2-scout.js"    },
  { name: "batching", script: "engine-v2-batching.js" },
  { name: "botnet",   script: "engine-v2-botnet.js"   },
  { name: "gang",     script: "engine-v2-gang.js"     },
  { name: "hacknet",  script: "engine-v2-hacknet.js"  },
];

const LIFECYCLE_EVERY = 20; // ticks between spawn/kill checks (~5s at 250ms)

export async function main(ns) {
  ns.disableLog("ALL");
  ns.ui.openTail();

  if (!getConfig(ns, "enable-engine-v2")) {
    log(ns, "print", "ENGINE-V2", "HALT", "master switch is off — exiting");
    return;
  }

  log(ns, "print", "ENGINE-V2", "START", "orchestrator online");

  let tick = 0;

  while (true) {
    // Drain LOG_PORT — collect all pending sub-engine messages
    let entry;
    while ((entry = ns.readPort(LOG_PORT)) !== "NULL PORT DATA") {
      try {
        const { source, action, message } = JSON.parse(entry);
        log(ns, "print", source, action, message);
      } catch {
        ns.print(entry);
      }
    }

    // Throttled lifecycle: spawn / kill sub-engines based on config flags
    if (tick % LIFECYCLE_EVERY === 0) {
      for (const { name, script } of SUB_ENGINES) {
        const enabled = getConfig(ns, `enable-${name}`);
        const running = ns.isRunning(script, "home");
        if (enabled && !running) {
          const pid = ns.exec(script, "home");
          log(ns, "print", "ENGINE-V2", pid ? "SPAWN" : "WARN",
            `${script}${pid ? `  pid:${pid}` : "  exec() failed"}`);
        }
        if (!enabled && running) {
          ns.scriptKill(script, "home");
          log(ns, "print", "ENGINE-V2", "KILL", script);
        }
      }
    }

    tick++;
    await ns.sleep(getConfig(ns, "engine-orchestrator-delay") * 1000);
  }
}
