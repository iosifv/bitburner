import { getConfig } from "lib/config.js";

const BOTNET_NAME  = "botnet";
const STARTING_RAM = 2; // GB for newly purchased servers

function getStartingRam(ns) {
  const minRam = getConfig(ns, "botnet-min-ram");
  return Math.max(STARTING_RAM, minRam);
}

function getNextBotnetName(ns) {
  const owned = ns.cloud.getServerNames();
  for (let i = 0; i < owned.length + 1; i++) {
    const name = `${BOTNET_NAME}-${String(i).padStart(2, "0")}`;
    if (!owned.includes(name)) return name;
  }
}

export function renameAllServers(ns) {
  const owned = ns.cloud.getServerNames();

  for (let i = 0; i < owned.length; i++) {
    const server = owned[i];
    const newName = `${BOTNET_NAME}-${String(i).padStart(2, "0")}`;
    // const newName = `${BOTNET_NAME}-${String(i.toString(2)).padStart(8, "0")}`; // include binary index for fun
    const success = ns.cloud.renameServer(server, newName);
    success
      ? ns.tprint(`RENAMED ${server.padEnd(20)} → ${newName}`)
      : ns.tprint(`ERROR   failed to rename ${server}`);
  }
}

export function buyServers(ns) {
  const limit = ns.cloud.getServerLimit();
  const owned = ns.cloud.getServerNames();
  const slots = limit - owned.length;

  if (slots <= 0) return;

  ns.tprint(`BUY     ${slots} slot(s) available — buying ${getStartingRam(ns)}GB servers`);
  for (let i = 0; i < slots; i++) {
    const cost = ns.cloud.getServerCost(getStartingRam(ns));
    if (ns.getPlayer().money < cost) {
      ns.tprint(`SKIP    insufficient funds for next server ($${ns.format.number(cost)})`);
      break;
    }
    const name = ns.cloud.purchaseServer(BOTNET_NAME, getStartingRam(ns));
    name
      ? ns.tprint(`OK      purchased ${name.padEnd(20)} ${getStartingRam(ns)}GB  $${ns.format.number(cost)}`)
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
