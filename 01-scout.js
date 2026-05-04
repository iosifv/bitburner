import { reloadServers, printDiff } from "lib/scout.js";

export async function main(ns) {
  ns.disableLog("ALL");
  await reloadServers(ns, "tprint");
  printDiff(ns, "tprint");
}
