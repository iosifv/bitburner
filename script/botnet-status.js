import { printPrices } from "lib/botnet.js";

export async function main(ns) {
  ns.disableLog("ALL");

  printBotnetStatus(ns);
  printPrices(ns, "tprint");
}

function printBotnetStatus(ns) {
  const raw     = ns.read("servers.json");
  const servers = raw && raw !== "NULL PORT DATA" ? JSON.parse(raw) : [];
  const botnet  = servers.filter(s => s.name.startsWith("botnet-")).sort((a, b) => a.name.localeCompare(b.name));
  const maxRam  = ns.cloud.getRamLimit();
  const maxLevel = Math.log2(maxRam);
  const money   = ns.getPlayer().money;

  ns.tprint("─".repeat(62));
  ns.tprint(``);
  ns.tprint(`${"Server".padEnd(14)} ${"RAM".padStart(6)}  ${"Upgrades".padEnd(22)} ${"Next".padStart(10)}  ${"To Max".padStart(10)}`);
  ns.tprint("─".repeat(62));

  for (const s of botnet) {
    const ram      = ns.getServerMaxRam(s.name);
    const level    = Math.log2(ram);
    const steps    = maxLevel - level;
    // const bar      = "▰".repeat(level) + "▱".repeat(steps);  // rounded blocks (active)
    // const bar   = "█".repeat(level) + "░".repeat(steps);  // solid blocks
    // const bar   = "━".repeat(level) + "╌".repeat(steps);  // thick/thin lines
    // const bar   = "●".repeat(level) + "○".repeat(steps);  // dots
    const bar   = "■ ".repeat(level) + "□ ".repeat(steps);  // squares
    // const bar   = "▶".repeat(level) + "▷".repeat(steps);  // arrows

    const nextRam  = ram * 2;
    const nextCost = steps > 0 ? ns.cloud.getServerUpgradeCost(s.name, nextRam) : 0;

    let totalCost = 0;
    for (let r = nextRam; r <= maxRam; r *= 2) {
      totalCost += ns.cloud.getServerUpgradeCost(s.name, r);
    }

    const canAffordNext  = steps > 0 && money >= nextCost;
    const nextStr  = steps > 0 ? `$${ns.format.number(nextCost)}`  : "maxed";
    const totalStr = steps > 0 ? `$${ns.format.number(totalCost)}` : "—";
    const marker   = canAffordNext ? "✓" : "·";

    ns.tprint(`${marker} ${s.name.padEnd(12)} ${`${ram}GB`.padStart(6)}  ${bar.padEnd(22)} ${nextStr.padStart(10)}  ${totalStr.padStart(10)}`);
  }

  ns.tprint("─".repeat(62));
  ns.tprint(`Fleet: ${botnet.length} servers   Max RAM: ${maxRam}GB`);
  ns.tprint("─".repeat(62));
}
