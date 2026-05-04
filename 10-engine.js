import { log }                        from "lib/logger.js";
import { reloadServers, printDiff }   from "lib/scout.js";
import { dispatch }                   from "lib/batch.js";
import { buyServers, upgradeServers } from "lib/botnet.js";

export async function main(ns) {
  ns.disableLog("ALL");
  ns.ui.openTail();
  
  const LOOP_DELAY = 30 * 1000; // ms between cycles
  let cycle = 0;

  while (true) {
    cycle++;
    log(ns, "print", "ENGINE", "CYCLE", `${cycle} starting...`);

    // 1. Buy + upgrade botnet servers
    buyServers(ns);
    upgradeServers(ns);

    // 2. Scout — crawl network, root servers, write servers.json
    await reloadServers(ns, "print");
    printDiff(ns, "print");

    // 3. Dispatch — assign virus workers to best target
    await dispatch(ns, "print");

    log(ns, "print", "ENGINE", "SLEEP", `cycle ${cycle} complete — sleeping ${LOOP_DELAY / 1000}s`);
    await ns.sleep(LOOP_DELAY);
  }
}

