import { buyServers, upgradeServers } from "lib/botnet.js";

export async function main(ns) {
  ns.disableLog("ALL");
  buyServers(ns);
  upgradeServers(ns);
}
