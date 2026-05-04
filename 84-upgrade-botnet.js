/**
 * 84-upgrade-botnet.js
 * Buys new botnet servers if slots are available (useful after a reset),
 * then upgrades all existing ones as far as the budget allows.
 *
 * Called automatically by 99-engine.js every cycle.
 */
export async function main(ns) {
  ns.disableLog("ALL");

  const BOTNET_NAME    = "botnet";
  const STARTING_RAM   = 4;   // GB for newly purchased servers
  const SERVER_LIMIT   = ns.cloud.getServerLimit();

  // ── Buy missing servers ───────────────────────────────────────────────────
  // After an augmentation reset, all purchased servers are wiped.
  // Fill back up to the limit with STARTING_RAM servers.
  const owned = ns.cloud.getServerNames();
  const slots = SERVER_LIMIT - owned.length;

  if (slots > 0) {
    ns.tprint(`BUY     ${slots} slot(s) available — buying ${STARTING_RAM}GB servers`);
    for (let i = 0; i < slots; i++) {
      const cost = ns.cloud.getServerUpgradeCost(STARTING_RAM);
      if (ns.getPlayer().money < cost) {
        ns.tprint(`SKIP    insufficient funds for next server ($${ns.format.number(cost)})`);
        break;
      }
      const name = ns.purchaseServer(BOTNET_NAME, STARTING_RAM);
      name
        ? ns.tprint(`OK      purchased ${name.padEnd(20)} ${STARTING_RAM}GB  $${ns.format.number(cost)}`)
        : ns.tprint(`ERROR   purchaseServer() failed`);
    }
  }

  // ── Upgrade existing servers ──────────────────────────────────────────────
  let needRepeat = true;

  while (needRepeat) {
    needRepeat = false;

    // Always upgrade the cheapest (lowest RAM) server first — keeps fleet balanced
    const sorted = ns.cloud.getServerNames()
      .sort((a, b) => ns.getServerMaxRam(a) - ns.getServerMaxRam(b));

    for (const server of sorted) {
      const currentRam  = ns.getServerMaxRam(server);
      const upgradeRam  = currentRam * 2;
      const upgradeCost = ns.cloud.getServerUpgradeCost(server, upgradeRam);

      if (ns.getPlayer().money > upgradeCost) {
        needRepeat = true;
        const success = ns.cloud.upgradeServer(server, upgradeRam);
        success
          ? ns.tprint(`UP      ${server.padEnd(20)} ${`${currentRam}GB → ${upgradeRam}GB`.padEnd(18)} $${ns.format.number(upgradeCost)}`)
          : ns.tprint(`ERROR   ${server.padEnd(20)} upgrade failed`);
      }
    }
  }
}