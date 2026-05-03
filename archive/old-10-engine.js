/**
 * 99-engine.js
 * Master loop — continuously runs the full pipeline in order:
 *   1. 83-reanimate-leviathan.js  — buy new servers
 *   2. 01-scout.js                — discover + root network
 *   3. 02-overlord.js             — dispatch farm workers
 *
 * Usage: run 10-engine.js
 */
export async function main(ns) {
  ns.disableLog("ALL");
 
  const PIPELINE = [
    // "83-reanimate-leviathan.js",
    "84-upgrade-botnet.js",
    "01-scout.js",
    "02-overlord.js",
  ];
 
  const LOOP_DELAY = 60 * 1000; // 1 minute between cycles
 
  let cycle = 0;
 
  while (true) {
    cycle++;
    ns.print(`${"─".repeat(50)}`);
    ns.print(`ENGINE  cycle ${cycle} starting...`);
 
    for (const script of PIPELINE) {
      ns.print(`RUN     ${script}`);
      const pid = ns.exec(script, "home");
 
      if (pid === 0) {
        ns.tprint(`WARN    ${script.padEnd(35)} failed to start`);
        continue;
      }
 
      // Wait for the script to finish before running the next one
      while (ns.isRunning(pid)) {
        await ns.sleep(500);
      }
 
      ns.print(`DONE    ${script}`);
    }
 
    ns.tprint(`ENGINE  cycle ${cycle} complete — sleeping ${LOOP_DELAY / 1000}s`);
    await ns.sleep(LOOP_DELAY);
  }
}
 