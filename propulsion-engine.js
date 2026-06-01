// Part of the engine-v2 system — engine-v2.js: orchestrator (port drain + spawn/kill supervisor)
import { LOG_PORT, log } from "lib/logger.js";
import { getConfig }     from "lib/quonfig.js";
import { bitnodeReset }  from "lib/scout.js";
import { uiQuonfigHeight, uiQuonfigWidth, uiEngineWidth, uiTopPadding } from "./quonfig";

const SUB_ENGINES = [
  { name: "scout",        script: "engine-v2-scout.js",        delay: 2  },
  { name: "batching",     script: "engine-v2-batching.js",     delay: 2  },
  { name: "stats",        script: "engine-v2-stats.js",        delay: 2  },
  { name: "botnet",       script: "engine-v2-botnet.js",       delay: 2  },
  { name: "combat-gang",  script: "engine-v2-combat-gang.js",  delay: 0  },
  { name: "the-boys",    script: "engine-v2-the-boys.js",     delay: 0  },
  { name: "hacking-gang", script: "engine-v2-hacking-gang.js", delay: 2  },
  { name: "hacknet",      script: "engine-v2-hacknet.js",      delay: 2  },
  { name: "cortex",       script: "engine-v2-cortex.js",       delay: 2  },
  { name: "darknet",      script: "engine-v2-darknet.js",      delay: 2  },
  { name: "telepathy",    script: "engine-v2-telepathy.js",    delay: 2  },
];

const DRAIN_DELAY_MS  = 250;
const LIFECYCLE_EVERY = 20; // ticks between spawn/kill checks (~5s at 250ms)


function buildLogFilters(ns) {
  try {
    const raw = ns.read("quonfig.json");
    if (!raw || raw === "NULL PORT DATA") return [];
    return Object.entries(JSON.parse(raw))
      .filter(([key, entry]) => entry && key.startsWith("log-include-") && entry.value === false)
      .map(([, entry]) => entry.label);
  } catch { return []; }
}

export async function main(ns) {
  ns.disableLog("ALL");
  ns.ui.openTail();
  ns.ui.resizeTail(uiEngineWidth, uiQuonfigHeight);
  ns.ui.moveTail(ns.ui.windowSize()[0] - uiQuonfigWidth - uiEngineWidth - 1, uiTopPadding);

  ns.clearLog();
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
      for (const { name, script, delay } of SUB_ENGINES) {
        const enabled = getConfig(ns, `enable-${name}`);
        const running = ns.isRunning(script, "home", delay);
        if (enabled && !running) {
          let pid = ns.exec(script, "home", 1, delay);
          if (pid) {
            log(ns, "print", "ENGINE-V2", "SPAWN", `${script}  pid:${pid}`);
          } else {
            log(ns, "print", "ENGINE-V2", "WARN", `${script}  exec() failed — killing spores on home to free RAM`);
            for (const proc of ns.ps("home")) {
              if (proc.filename.startsWith("spores/")) ns.kill(proc.pid);
            }

            pid = ns.exec(script, "home", 1, delay);
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
    await ns.sleep(DRAIN_DELAY_MS);
  }
}

