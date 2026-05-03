/**
 * share-home.js
 * Shares all free RAM on home with your faction.
 * Just run it — it uses however many threads fit in free RAM.
 *
 * Usage: run share-home.js
 */
export async function main(ns) {
  const BRAINWORM_SCRIPT = "20-brainworm.js";
  const targetServer = ns.args[0] ?? "home";

  // ── Copy farm script ───────────────────────────────────────────────
  if (targetServer != "home") {
    await ns.scp(BRAINWORM_SCRIPT, targetServer, "home");
  }

  const scriptRam = ns.getScriptRam(BRAINWORM_SCRIPT);
  const freeRam = ns.getServerMaxRam(targetServer) - ns.getServerUsedRam(targetServer) - 4;
  const threads = Math.floor(freeRam / scriptRam);

  if (threads <= 0) {
    ns.tprint("Not enough free RAM to share anything");
    return;
  }

  ns.tprint(`Sharing ${(threads * scriptRam).toFixed(2)}GB on ${targetServer} (${threads} threads)`);
  ns.exec(BRAINWORM_SCRIPT, targetServer, threads);
}