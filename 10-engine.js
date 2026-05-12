import { log }                        from "lib/logger.js";
import { reloadServers, printDiff }   from "lib/scout.js";
import { dispatch }                   from "lib/batch.js";
import { buyServers, upgradeServers } from "lib/botnet.js";
import { getAllConfig }               from "lib/config.js";

function syncScript(ns, enabled, script) {
  const running = ns.isRunning(script, "home");
  if (enabled && !running) ns.exec(script, "home");
  if (!enabled && running) ns.scriptKill(script, "home");
}

export async function main(ns) {
  ns.disableLog("ALL");
  ns.ui.openTail();

  let cycle = 0;

  while (true) {
    cycle++;
    const cfg = getAllConfig(ns);
    log(ns, "print", "ENGINE", "CYCLE", `${cycle} starting...`);

    // 1. Buy + upgrade botnet servers
    if (cfg["botnet-buy"])     buyServers(ns);
    if (cfg["botnet-upgrade"]) upgradeServers(ns);

    // 2. Gang + Hacknet — managed as child scripts
    syncScript(ns, cfg["enable-gang"],    "30-gang.js");
    syncScript(ns, cfg["enable-hacknet"], "40-hacknet.js");

    // 3. Scout — crawl network, root servers, write servers.json
    await reloadServers(ns, "print");
    printDiff(ns, "print");

    // 4. Dispatch — assign virus workers to best target
    await dispatch(ns, "print");

    log(ns, "print", "ENGINE", "SLEEP", `cycle ${cycle} complete — sleeping ${cfg["engine-loop-delay"]}s`);
    await ns.sleep(cfg["engine-loop-delay"] * 1000);
  }
}
