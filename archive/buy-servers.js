/**
 * buy-servers.js
 * Bulk purchases servers named "botnet", letting the game append -1, -2, etc.
 *
 * Usage: run buy-servers.js <GB> <count>
 * Example: run buy-servers.js 32 5
 */
export async function main(ns) {
  const gb    = parseInt(ns.args[0]);
  const count = parseInt(ns.args[1]);

  if (!gb || !count) {
    ns.tprint("Usage: run buy-servers.js <GB> <count>");
    ns.tprint("Example: run buy-servers.js 32 5");
    return;
  }

  // Validate RAM is a power of 2
  if ((gb & (gb - 1)) !== 0) {
    ns.tprint(`ERROR  RAM must be a power of 2 (e.g. 8, 16, 32, 64...)`);
    return;
  }

  const cost     = ns.getPurchasedServerCost(gb);
  const totalCost = cost * count;
  const budget   = ns.getPlayer().money;

  ns.tprint(`Buying ${count}x ${gb}GB servers — $${ns.formatNumber(cost)} each, $${ns.formatNumber(totalCost)} total`);

  if (budget < totalCost) {
    ns.tprint(`ERROR  Not enough money — have $${ns.formatNumber(budget)}, need $${ns.formatNumber(totalCost)}`);
    return;
  }

  const maxServers = ns.getPurchasedServerLimit();
  const owned      = ns.getPurchasedServers().length;
  const slots      = maxServers - owned;

  if (count > slots) {
    ns.tprint(`ERROR  Only ${slots} server slot(s) remaining (limit is ${maxServers})`);
    return;
  }

  let bought = 0;
  for (let i = 0; i < count; i++) {
    const name = ns.purchaseServer("botnet", gb);
    if (!name) {
      ns.tprint(`WARN  Purchase failed on server ${i + 1} — stopping`);
      break;
    }
    ns.tprint(`OK  Purchased ${name} (${gb}GB)`);
    bought++;
  }

  ns.tprint(`Done — bought ${bought} server(s) for $${ns.formatNumber(cost * bought)}`);
}
