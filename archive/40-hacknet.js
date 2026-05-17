/**
 * 40-hacknet.js
 * Buys new hacknet nodes and upgrades all existing ones (level, RAM, cores).
 * Always upgrades the cheapest option first to maximize value per dollar.
 *
 * Usage: run 40-hacknet.js
 */
export async function main(ns) {
  ns.disableLog("ALL");

  const LOOP_DELAY   = 10 * 1000; // 10 seconds
  const BUDGET_RATIO = 0.25;      // never spend more than 25% of current money at once
  // const BUDGET_RATIO = 1;  
  const MAX_NODES    = 12; // ns.hacknet.maxNumNodes();

  while (true) {
    const money = () => ns.getPlayer().money * BUDGET_RATIO;

    // ── Buy new node if affordable ────────────────────────────────────────
    const nodeCount  = ns.hacknet.numNodes();
    const newNodeCost = ns.hacknet.getPurchaseNodeCost();

    if (nodeCount < MAX_NODES && money() >= newNodeCost) {
      const index = ns.hacknet.purchaseNode();
      ns.tprint(`BUY     node-${index}  cost: $${ns.format.number(newNodeCost)}`);
    }

    // ── Upgrade all existing nodes — cheapest first ───────────────────────
    let upgraded = true;
    while (upgraded) {
      upgraded = false;

      // Build list of all possible upgrades across all nodes
      const options = [];
      for (let i = 0; i < ns.hacknet.numNodes(); i++) {
        options.push({ i, type: "level", cost: ns.hacknet.getLevelUpgradeCost(i, 1) });
        options.push({ i, type: "ram",   cost: ns.hacknet.getRamUpgradeCost(i, 1)   });
        options.push({ i, type: "core",  cost: ns.hacknet.getCoreUpgradeCost(i, 1)  });
      }

      // Sort by cheapest first
      options.sort((a, b) => a.cost - b.cost);

      for (const opt of options) {
        if (!Number.isFinite(opt.cost) || opt.cost <= 0) continue;
        if (money() < opt.cost) continue;

        let success = false;
        if (opt.type === "level") success = ns.hacknet.upgradeLevel(opt.i, 1);
        if (opt.type === "ram")   success = ns.hacknet.upgradeRam(opt.i, 1);
        if (opt.type === "core")  success = ns.hacknet.upgradeCore(opt.i, 1);

        if (success) {
          ns.print(`UP      node-${opt.i}  ${opt.type.padEnd(6)}  $${ns.format.number(opt.cost)}`);
          upgraded = true;
          break; // re-sort after each upgrade since costs change
        }
      }
    }

    await ns.sleep(LOOP_DELAY);
  }
}