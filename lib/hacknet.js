// Part of the engine-v2 system — lib/hacknet.js: hacknet tick logic
import { getConfig } from "lib/config.js";
import { log }       from "lib/logger.js";

export function tickHacknet(ns, mode = "print") {
  const budgetRatio = getConfig(ns, "hacknet-budget-ratio");
  const maxNodes    = getConfig(ns, "hacknet-buy-limit");
  const quiet       = mode === "port" ? "silent" : mode;

  const money = () => ns.getPlayer().money * budgetRatio;

  const nodeCount   = ns.hacknet.numNodes();
  const newNodeCost = ns.hacknet.getPurchaseNodeCost();
  if (nodeCount < maxNodes && money() >= newNodeCost) {
    const index = ns.hacknet.purchaseNode();
    log(ns, mode, "HACKNET", "BUY", `node-${index}  cost: $${ns.format.number(newNodeCost)}`);
  }

  // Upgrade all existing nodes — cheapest option first
  let upgraded = true;
  while (upgraded) {
    upgraded = false;
    const options = [];
    for (let i = 0; i < ns.hacknet.numNodes(); i++) {
      options.push({ i, type: "level", cost: ns.hacknet.getLevelUpgradeCost(i, 1) });
      options.push({ i, type: "ram",   cost: ns.hacknet.getRamUpgradeCost(i, 1)   });
      options.push({ i, type: "core",  cost: ns.hacknet.getCoreUpgradeCost(i, 1)  });
    }
    options.sort((a, b) => a.cost - b.cost);
    for (const opt of options) {
      if (!Number.isFinite(opt.cost) || opt.cost <= 0) continue;
      if (money() < opt.cost) continue;
      let success = false;
      if (opt.type === "level") success = ns.hacknet.upgradeLevel(opt.i, 1);
      if (opt.type === "ram")   success = ns.hacknet.upgradeRam(opt.i, 1);
      if (opt.type === "core")  success = ns.hacknet.upgradeCore(opt.i, 1);
      if (success) {
        log(ns, quiet, "HACKNET", "UP", `node-${opt.i}  ${opt.type.padEnd(6)}  $${ns.format.number(opt.cost)}`);
        upgraded = true;
        break;
      }
    }
  }
}
