/** @param {NS} ns */
export async function main(ns) {
  const symbols = ns.stock.getSymbols();

  let totalGain = 0;

  for (const symbol of symbols) {
    const [longShares, shortShares] = ns.stock.getPosition(symbol);

    if (longShares > 0) {
      const gain = ns.stock.sell(symbol, longShares);
      totalGain += gain;
      ns.tprint(`✓ Sold ${ns.format.number(longShares)} ${symbol} for $${ns.format.number(gain)}`);
    }

    if (shortShares > 0) {
      const gain = ns.stock.sellShort(symbol, shortShares);
      totalGain += gain;
      ns.tprint(`✓ Closed short ${ns.format.number(shortShares)} ${symbol} for $${ns.format.number(gain)}`);
    }
  }

  ns.tprint(`\nTotal gain: $${ns.format.number(totalGain)}`);
}
