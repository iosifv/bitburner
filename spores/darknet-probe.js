const DARKNET_PORT = 666;
const SPORE        = "spores/darknet-probe.js";
const COMMON_PASSWORDS = [
  "",
  "password", "12345678", 
  "qwerty", "123456789", "12345", "1234", "111111", "1234567", 
  "dragon", "123123", "baseball", "abc123", "football", "monkey", "letmein"
];

function sporeFingerprint(content) {
  let h = 0;
  for (let i = 0; i < content.length; i++) h = (h * 31 + content.charCodeAt(i)) >>> 0;
  return (h >>> 0).toString(16).padStart(8, "0");
}

const AUTH_STRATEGIES = [
  {
    name: "common-password",
    canAttempt(server) {
      return true;
    },
    async attempt(ns, node, server) {
      for (const password of COMMON_PASSWORDS) {
        if (await ns.dnet.authenticate(node, password)) {
          return { strategy: this.name + ": " + password, success: true };
        }
      }
      return false;
    },
  },
  {
    name: "pin-in-hint",
    canAttempt(server) {
      return server.passwordHint.includes("PIN") 
      || server.passwordHint.includes("set to")
      || server.passwordHint.includes("The key is")
      || server.passwordHint.includes("The secret is")
      || server.passwordHint.includes("Remember to use");
    },
    async attempt(ns, node, server) {
      const pin = server.passwordHint.replace(/\D/g, "");
      return ns.dnet.authenticate(node, pin);
    },
  },
  {
    name: "pin-in-data",
    canAttempt(server) {
      return server.passwordHint.includes("Type the numbers to prove you are human");
    },
    async attempt(ns, node, server) {
      const digits   = server.data.replace(/\D/g, "");
      return ns.dnet.authenticate(node, digits);
    },
  },
  {
    name: "fresh-install",
    canAttempt(server) {
      return server.modelId.includes("FreshInstall");
    },
    async attempt(ns, node, server) {
      if (server.passwordFormat == "numeric") {
        if (server.passwordLength == 4) return ns.dnet.authenticate(node, "0000");
        if (server.passwordLength == 5) return ns.dnet.authenticate(node, "12345");
      }
      if (server.passwordFormat == "alphabetic") {
        if (server.passwordLength == 5) return ns.dnet.authenticate(node, "admin");
        if (server.passwordLength == 8) return ns.dnet.authenticate(node, "password");
      }
      return false;
    },
  },
  {
    name: "brute-force",
    canAttempt(server) {
      return server.passwordLength == 2;
    },
    async attempt(ns, node, server) {
      for (let i = 0; i < 100; i++) {
        const attempt = i.toString().padStart(2, "0");
        if (await ns.dnet.authenticate(node, attempt)) {
          return { strategy: this.name + ": " + attempt, success: true };
        }
      }
      
      return false;
    },
  },
];

const ACTION_STRATEGIES = [
  {
    name: "open-caches",
    canExecute(server) {
      return server.caches?.length > 0;
    },
    async execute(ns, node, server) {
      const results = [];
      for (const cache of server.caches) {
        const content = await ns.dnet.openCache(cache.filename);
        results.push({ filename: cache.filename, content });
      }
      return { action: this.name, results };
    },
  },
];

async function executeActions(ns, node, server) {
  const actions = [];
  for (const strategy of ACTION_STRATEGIES) {
    if (!strategy.canExecute(server)) continue;
    const result = await strategy.execute(ns, node, server);
    if (result) actions.push(result);
  }
  return actions;
}

async function authenticate(ns, node, server) {
  for (const strategy of AUTH_STRATEGIES) {
    if (!strategy.canAttempt(server)) continue;
    const result = await strategy.attempt(ns, node, server);
    if (result.success) {
      return { strategy: strategy.name, success: true };
    }
  }
  return { strategy: null, success: false };
}

export async function main(ns) {
  ns.disableLog("ALL");

  const MY_V = sporeFingerprint(ns.read(SPORE));

  while (true) {
    const host  = ns.getHostname();
    const nodes = ns.dnet.probe();

    // Heartbeat: report own version every tick regardless of peer discovery
    ns.tryWritePort(DARKNET_PORT, JSON.stringify({ v: MY_V, host, ts: Date.now() }));

    for (const node of nodes) {
      const server = ns.dnet.getServerDetails(node);
      const auth   = await authenticate(ns, node, server);


      let actions = [];
      if (auth.success) {
        actions = await executeActions(ns, node, server);
      }

      ns.tryWritePort(DARKNET_PORT, JSON.stringify({
        v: MY_V,
        host,
        node,
        auth,
        actions:    actions.length > 0 ? actions : undefined,
        serverInfo: auth.success ? undefined : server,
        ts: Date.now()
      }));

      if (!server.isOnline || !server.isConnectedToCurrentServer || !server.hasSession) {
        continue;
      }


      // Aggressive propagation — self-healing chain for multi-hop nodes
      if (ns.isRunning(SPORE, node)) ns.kill(SPORE, node);
      ns.scp(SPORE, node);
      ns.exec(SPORE, node, { preventDuplicates: true });
    }

    await ns.sleep(10000);
  }
}
