const BOTNET_NAME  = "botnet";
const STARTING_RAM = 4; // GB for newly purchased servers

export function buyServers(ns) {
  const limit = ns.cloud.getServerLimit();
  const owned = ns.cloud.getServerNames();
  const slots = limit - owned.length;

  if (slots <= 0) return;

  ns.tprint(`BUY     ${slots} slot(s) available — buying ${STARTING_RAM}GB servers`);
  for (let i = 0; i < slots; i++) {
    const cost = ns.cloud.getServerCost(STARTING_RAM);
    if (ns.getPlayer().money < cost) {
      ns.tprint(`SKIP    insufficient funds for next server ($${ns.format.number(cost)})`);
      break;
    }
    const name = ns.cloud.purchaseServer(BOTNET_NAME, STARTING_RAM);
    name
      ? ns.tprint(`OK      purchased ${name.padEnd(20)} ${STARTING_RAM}GB  $${ns.format.number(cost)}`)
      : ns.tprint(`ERROR   purchaseServer() failed`);
  }
}

export function getPrices(ns) {
  const maxRam = ns.cloud.getRamLimit();
  const prices = [];
  for (let ram = 2; ram <= maxRam; ram *= 2) {
    prices.push({ ram, cost: ns.cloud.getServerCost(ram) });
  }
  return prices;
}

export function printPrices(ns) {
  const money = ns.getPlayer().money;
  for (const { ram, cost } of getPrices(ns)) {
    const affordable = money >= cost ? "✓" : " ";
    ns.tprint(`${affordable} ${`${ram}GB`.padStart(8)}  $${ns.format.number(cost)}`);
  }
}

export function upgradeServers(ns) {
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
