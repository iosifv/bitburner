export async function main(ns) {
  for (let i = 1; i <= 20; i++) {
    const ram = Math.pow(2, i);
    const cost = ns.getPurchasedServerCost(ram);
    ns.tprint(`${ram} GB — $${ns.formatNumber(cost)}`);
  }
}