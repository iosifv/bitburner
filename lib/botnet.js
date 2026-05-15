import { getConfig } from "lib/config.js";
import { log }       from "lib/logger.js";


const BOTNET_NAME  = "botnet";
const STARTING_RAM = 2;

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

export function renameAllServers(ns, mode = "print") {
  const owned = ns.cloud.getServerNames();

  for (let i = 0; i < owned.length; i++) {
    const server  = owned[i];
    const newName = `${BOTNET_NAME}-${String(i).padStart(2, "0")}`;
    const success = ns.cloud.renameServer(server, newName);
    success
      ? log(ns, mode, "BOTNET", "RENAMED", `${server.padEnd(20)} → ${newName}`)
      : log(ns, mode, "BOTNET", "ERROR",   `failed to rename ${server}`);
  }
}

export function buyServers(ns, mode = "print") {
  const limit = ns.cloud.getServerLimit();
  const owned = ns.cloud.getServerNames();
  const slots = limit - owned.length;
  const quiet = mode === "port" ? "silent" : mode;

  if (slots <= 0) return;

  log(ns, quiet, "BOTNET", "BUY", `${slots} slot(s) available — buying ${getStartingRam(ns)}GB servers`);
  for (let i = 0; i < slots; i++) {
    const cost = ns.cloud.getServerCost(getStartingRam(ns));
    if (ns.getPlayer().money < cost) {
      log(ns, quiet, "BOTNET", "SKIP", `insufficient funds for next server ($${ns.format.number(cost)})`);
      break;
    }
    const name = ns.cloud.purchaseServer(getNextBotnetName(ns), getStartingRam(ns));
    name
      ? log(ns, mode, "BOTNET", "OK",    `purchased ${name.padEnd(20)} ${getStartingRam(ns)}GB  $${ns.format.number(cost)}`)
      : log(ns, mode, "BOTNET", "ERROR", `purchaseServer() failed`);
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

export function printPrices(ns, mode = "print") {
  const money = ns.getPlayer().money;
  for (const { ram, cost } of getPrices(ns)) {
    const affordable = money >= cost ? "✓" : " ";
    log(ns, mode, "BOTNET", "PRICE", `${affordable} ${`${ram}GB`.padStart(8)}  $${ns.format.number(cost)}`);
  }
}

export function upgradeServers(ns, mode = "print") {
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
          ? log(ns, mode, "BOTNET", "UP",    `${server.padEnd(20)} ${`${currentRam}GB → ${upgradeRam}GB`.padEnd(18)} $${ns.format.number(upgradeCost)}`)
          : log(ns, mode, "BOTNET", "ERROR", `${server.padEnd(20)} upgrade failed`);
      }
    }
  }
}
