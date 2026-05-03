/**
 * share-home.js
 * Shares all free RAM on home with your faction.
 * Just run it — it uses however many threads fit in free RAM.
 *
 * Usage: run share-home.js
 */
export async function main(ns) {
  const WORKER = "share-worker.js";

  const scriptRam = ns.getScriptRam(WORKER);
  const freeRam   = ns.getServerMaxRam("home") - ns.getServerUsedRam("home");
  const threads   = Math.floor(freeRam / scriptRam);

  if (threads <= 0) {
    ns.tprint("Not enough free RAM to share anything");
    return;
  }

  ns.tprint(`Sharing ${(threads * scriptRam).toFixed(2)}GB on home (${threads} threads)`);
  ns.exec(WORKER, "home", threads);
}
