import { printPrices } from "lib/botnet.js";

export async function main(ns) {
  ns.disableLog("ALL");
  printPrices(ns);
}
