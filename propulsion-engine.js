// Part of the engine-v2 system — engine-v2.js: orchestrator (port drain + spawn/kill supervisor)
import { LOG_PORT, log } from "lib/logger.js";
import { getConfig }     from "lib/config.js";
import { bitnodeReset }  from "lib/scout.js";
import { quonfigHeight, quonfigTopPadding, quonfigWidth } from "./quonfig";

const SUB_ENGINES = [
  { name: "scout",        script: "engine-v2-scout.js"        },
  { name: "batching",     script: "engine-v2-batching.js"     },
  { name: "stats",        script: "engine-v2-stats.js"        },
  { name: "botnet",       script: "engine-v2-botnet.js"       },
  { name: "combat-gang",  script: "engine-v2-combat-gang.js"  },
  { name: "hacking-gang", script: "engine-v2-hacking-gang.js" },
  { name: "hacknet",      script: "engine-v2-hacknet.js"      },
  { name: "cortex",       script: "engine-v2-cortex.js"       },
  { name: "darknet",      script: "engine-v2-darknet.js"      },
];

const LIFECYCLE_EVERY = 20; // ticks between spawn/kill checks (~5s at 250ms)


function buildLogFilters(ns) {
  try {
    const raw = ns.read("config.json");
    if (!raw || raw === "NULL PORT DATA") return [];
    return Object.entries(JSON.parse(raw))
      .filter(([key, entry]) => entry && key.startsWith("log-include-") && entry.value === false)
      .map(([, entry]) => entry.label);
  } catch { return []; }
}

export async function main(ns) {
  ns.disableLog("ALL");
  ns.ui.openTail();
  ns.ui.resizeTail(engineWidth, quonfigHeight);
  ns.ui.moveTail(ns.ui.windowSize()[0] - quonfigWidth - engineWidth - 1, 20);

  log(ns, "print", "ENGINE-V2", "START", "orchestrator online");
  bitnodeReset(ns);

  let tick       = 0;
  let logFilters = buildLogFilters(ns);

  while (true) {
    // Drain LOG_PORT — collect all pending sub-engine messages
    let entry;
    while ((entry = ns.readPort(LOG_PORT)) !== "NULL PORT DATA") {
      try {
        const { source, action, message } = JSON.parse(entry);
        const line = `[${source}]`.padEnd(12) + action.padEnd(10) + message;
        if (logFilters.some(f => line.includes(f))) continue;
        log(ns, "print", source, action, message);
      } catch {
        ns.print(entry);
      }
    }

    // Throttled lifecycle: spawn / kill sub-engines + refresh log filters
    if (tick % LIFECYCLE_EVERY === 0) {
      logFilters = buildLogFilters(ns);
      for (const { name, script } of SUB_ENGINES) {
        const enabled = getConfig(ns, `enable-${name}`);
        const running = ns.isRunning(script, "home");
        if (enabled && !running) {
          let pid = ns.exec(script, "home");
          if (pid) {
            log(ns, "print", "ENGINE-V2", "SPAWN", `${script}  pid:${pid}`);
          } else {
            log(ns, "print", "ENGINE-V2", "WARN", `${script}  exec() failed — killing spores on home to free RAM`);
            for (const proc of ns.ps("home")) {
              if (proc.filename.startsWith("spores/")) ns.kill(proc.pid);
            }
            
            pid = ns.exec(script, "home");
            if (pid) {
              log(ns, "print", "ENGINE-V2", "SPAWN", `${script}  pid:${pid} (retry after spore kill)`);
            } else {
              log(ns, "print", "ENGINE-V2", "ERROR", `${script}  still not enough RAM after killing spores`);
            }
          }
        }
        if (!enabled && running) {
          ns.scriptKill(script, "home");
          log(ns, "print", "ENGINE-V2", "KILL", script);
        }
      }
    }

    tick++;
    await ns.sleep(getConfig(ns, "loop-delay-orchestrator-drain") * 1000);
  }
}

export const engineWidth = 800;