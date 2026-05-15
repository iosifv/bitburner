// Run this from darkweb to probe deeper into the darknet
export async function main(ns) {
  ns.tprint("=== PROBE FROM darkweb ===");
  const nearby = ns.dnet.probe();
  ns.tprint(`Servers connected to darkweb: ${JSON.stringify(nearby)}`);

  for (const host of nearby) {
    ns.tprint(`\n--- ${host} ---`);
    ns.tprint(`  depth     : ${ns.dnet.getDepth(host)}`);
    ns.tprint(`  charisma  : ${ns.dnet.getServerRequiredCharismaLevel(host)}`);
    ns.tprint(`  authDetail: ${JSON.stringify(ns.dnet.getServerAuthDetails(host))}`);
  }
}
