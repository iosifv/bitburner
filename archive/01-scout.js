import { reloadServers, printDiff } from "lib.js";

export async function main(ns) {
  ns.disableLog("ALL");
  await reloadServers(ns);
  printDiff(ns);
}
