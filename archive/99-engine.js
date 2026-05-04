/**
 * 99-engine.js
 * Master loop — runs the full pipeline every cycle using lib.js directly.
 * Scripts (scout, overlord) still exist as thin wrappers for manual use.
 *
 * Usage: run 99-engine.js
 */
import { log }                        from "lib/logger.js";
import { reloadServers, printDiff }   from "lib/scout.js";
import { dispatch }                   from "lib/batch.js";

export async function main(ns) {
  ns.disableLog("ALL");

  const LOOP_DELAY = 60 * 1000; // ms between cycles
  let cycle = 0;

  while (true) {
    cycle++;
    log(ns, "tprint", "ENGINE", "CYCLE", `${cycle} starting...`);

    // 1. Buy + upgrade botnet servers
    const pid = ns.exec("84-upgrade-botnet.js", "home");
    if (pid === 0) {
      log(ns, "tprint", "ENGINE", "WARN", "84-upgrade-botnet.js failed to start");
    } else {
      while (ns.isRunning(pid)) await ns.sleep(500);
    }

    // 2. Scout — crawl network, root servers, write servers.json
    await reloadServers(ns, "tprint");
    printDiff(ns, "tprint");

    // 3. Dispatch — assign virus workers to best target
    await dispatch(ns, "tprint");

    log(ns, "tprint", "ENGINE", "SLEEP", `cycle ${cycle} complete — sleeping ${LOOP_DELAY / 1000}s`);
    await ns.sleep(LOOP_DELAY);
  }
}
