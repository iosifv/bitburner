export async function main(ns) {
  const budget   = ns.getPlayer().money;
  for (let i = 20; i >= 4; i--) {
    const ram = Math.pow(2, i);
    const cost = ns.getPurchasedServerCost(ram);
    if (budget >= cost) {
      const name = ns.purchaseServer("botnet", ram);
      ns.tprint(`OK  Purchased ${name} (${ram}GB) for $${ns.formatNumber(cost)}`);
      return;
    }
    ns.tprint(`Skipping - ${ram} GB — $${ns.formatNumber(cost)}`);
  }
}