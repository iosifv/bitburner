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
    const payload = JSON.stringify({ 
      v: "1.04", 
      host, 
      nodes, 
      ts: Date.now() 
    }, null, 2);
    // ns.tryWritePort(DARKNET_PORT, payload);

    for (const node of nodes) {

      const darknetServer = ns.dnet.getServerDetails(node);

      // Try to connect by checking if there is no password
      const emptyPasswordAuth = await ns.dnet.authenticate(node, "");

      // Try to connect by checking if password hint contains a PIN and using that as the password
      let pinPasswordAuth = null;
      if (!emptyPasswordAuth.success
        && darknetServer.passwordHint.includes("PIN")
      ) {
        const digitsFromHint = darknetServer.passwordHint.replace(/\D/g, "");
        pinPasswordAuth = await ns.dnet.authenticate(node, digitsFromHint);
      }
      
      

      // Skip nodes that aren't reachable or don't have an active session
      if (
        !darknetServer.isOnline 
        || !darknetServer.isConnectedToCurrentServer 
        || !darknetServer.hasSession
      ) {
        continue;
      }

      


      const payloadServer = JSON.stringify({ 
        v: "1.04 ++",
        node: node,
        emptyPasswordAuth: emptyPasswordAuth.success,
        pinPasswordAuth:  pinPasswordAuth ? pinPasswordAuth.success : null,
        // darknetServer, 
        ts: 
        Date.now() 
      }, null, 2);
      ns.tryWritePort(DARKNET_PORT, payloadServer);
      
      // kill any running version so the freshly scp'd file takes over
      if (ns.isRunning(SPORE, node)) {
        ns.kill(SPORE, node);
      }

      ns.scp(SPORE, node);
      ns.exec(SPORE, node, { preventDuplicates: true });
    }

    await ns.sleep(10000);
  }
}
