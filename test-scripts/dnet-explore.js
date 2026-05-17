export async function main(ns) {
  ns.tprint("=== DARKNET EXPLORER ===");

  ns.tprint(`Instability  : ${JSON.stringify(ns.dnet.getDarknetInstability())}`);
  ns.tprint(`Stasis limit : ${ns.dnet.getStasisLinkLimit()}`);
  ns.tprint(`Stasis linked: ${JSON.stringify(ns.dnet.getStasisLinkedServers())}`);

  const nearby = ns.dnet.probe();
  ns.tprint(`Nearby servers: ${JSON.stringify(nearby)}`);

  for (const host of nearby) {
    ns.tprint(`\n--- ${host} ---`);
    ns.tprint(`  depth     : ${ns.dnet.getDepth(host)}`);
    ns.tprint(`  charisma  : ${ns.dnet.getServerRequiredCharismaLevel(host)}`);
    ns.tprint(`  blockedRam: ${ns.dnet.getBlockedRam(host)}`);
    ns.tprint(`  authDetail: ${JSON.stringify(ns.dnet.getServerAuthDetails(host))}`);

    // Pull any logs from this server
    const logs = await ns.dnet.heartbleed(host);
    ns.tprint(`  heartbleed: ${JSON.stringify(logs)}`);
  }

  // Probe deeper from darkweb by running a script on it
  ns.tprint("\n=== PROBING FROM darkweb ===");
  ns.scp("dnet-explore-deep.js", "darkweb");
}
