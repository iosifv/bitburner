/**
 * buy-servers.js
 * Bulk purchases servers named "botnet", letting the game append -1, -2, etc.
 *
 * Usage: run buy-servers.js 
 */
export async function main(ns) {
  const gb = 1048576;
  const cost = ns.getPurchasedServerCost(gb);
  const budget = ns.getPlayer().money;
  const countAfford = Math.trunc(budget / cost);
  const totalCost = cost * countAfford;


  if (budget < cost) {
    ns.print(`ERROR  You're too poor to buy one big-boy server. Need an extra ${ns.formatNumber(cost -budget)}$`);
    return;
  } 

  const maxServers = ns.getPurchasedServerLimit();
  const countOwned = ns.getPurchasedServers().length;
  const countSlots = maxServers - countOwned;

  if (countOwned == maxServers) {
    ns.tprint(`WARN  You have reached the limit of how many servers you can buy`);
    return;
  }

  if (countAfford >= countSlots) {
    ns.tprint(`WARN  You will not be able to buy any more servers after this.`);
  }

  const countBuy = countAfford > countSlots ? countSlots : countAfford;

  ns.tprint(`Buying ${countBuy}x ${gb}GB servers — $${ns.formatNumber(cost)} each, $${ns.formatNumber(totalCost)} total`);

  let bought = 0;
  for (let i = 0; i < countBuy; i++) {
    const name = ns.purchaseServer("botnet", gb);
    if (!name) {
      ns.tprint(`WARN  Purchase failed on server ${i + 1} — stopping`);
      break;
    }
    ns.tprint(`OK  Purchased ${name} - ${ns.formatRam(gb)}`);
    bought++;
  }

  ns.tprint(`Done — bought ${bought} server(s) for $${ns.formatNumber(cost * bought)}`);
}