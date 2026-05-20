// Port where discovered darknet topology is published for orchestrators to consume
const DARKNET_PORT = 666;
// Self-reference used for scp + exec propagation to peer nodes
const SPORE        = "spores/darknet-probe.js";

export async function main(ns) {
  ns.disableLog("ALL");

  while (true) {
    const host  = ns.getHostname();
    const nodes = ns.dnet.probe(); // darknet peers visible from this node

    // Publish this node's view of the darknet so an orchestrator can aggregate topology
    ns.tryWritePort(DARKNET_PORT, JSON.stringify({ host, nodes, ts: Date.now() }));

    for (const node of nodes) {
      const darknetServer = ns.dnet.getServerDetails(node);
      // Skip nodes that aren't reachable or don't have an active session
      if (
        !darknetServer.isOnline 
        || !darknetServer.isConnectedToCurrentServer 
        || !darknetServer.hasSession
      ) continue;
      
      // already spreading, nothing to do
      if (ns.isRunning(SPORE, node)) continue; 

      // propagate spore to peer
      ns.scp(SPORE, node);
      ns.exec(SPORE, node, { preventDuplicates: true }); 
    }

    await ns.sleep(10000);
  }
}
