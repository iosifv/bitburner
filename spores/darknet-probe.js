const DARKNET_PORT = 666;
const SPORE        = "spores/darknet-probe.js";
const DEBUG_DUMP   = false;
const COMMON_PASSWORDS = [
  "",
  "password", "12345678", 
  "qwerty", "123456789", "12345", "1234", "111111", "1234567", 
  "dragon", "123123", "baseball", "abc123", "football", "monkey", "letmein"
];

function fromRoman(s) {
  const vals = { I:1, V:5, X:10, L:50, C:100, D:500, M:1000 };
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const cur = vals[s[i]], nxt = vals[s[i+1]];
    n += (nxt && cur < nxt) ? -cur : cur;
  }
  return n;
}

function sporeFingerprint(content) {
  let h = 0;
  for (let i = 0; i < content.length; i++) h = (h * 31 + content.charCodeAt(i)) >>> 0;
  return (h >>> 0).toString(16).padStart(8, "0");
}

const AUTH_STRATEGIES = [
  {
    name: "pin-in-hint",
    canAttempt(server) {
      return server.passwordHint.includes("PIN") 
      || server.passwordHint.includes("set to")
      || server.passwordHint.includes("The key is")
      || server.passwordHint.includes("The secret is")
      || server.passwordHint.includes("Remember to use");
    },
    async crack(ns, node, server) {
      const pin = server.passwordHint.replace(/\D/g, "");
      const ok  = await ns.dnet.authenticate(node, pin);
      return ok ? { strategy: this.name + ": " + pin, success: true } : false;
    },
  },
  {
    name: "pin-in-data",
    canAttempt(server) {
      return server.passwordHint.includes("Type the numbers to prove you are human");
    },
    async crack(ns, node, server) {
      const digits = server.data.replace(/\D/g, "");
      const ok     = await ns.dnet.authenticate(node, digits);
      return ok ? { strategy: this.name + ": " + digits, success: true } : false;
    },
  },
  {
    name: "fresh-install",
    canAttempt(server) {
      return server.modelId.includes("FreshInstall");
    },
    async crack(ns, node, server) {
      let guess = null;
      if (server.passwordFormat == "numeric") {
        if (server.passwordLength == 4) guess = "0000";
        if (server.passwordLength == 5) guess = "12345";
      }
      if (server.passwordFormat == "alphabetic") {
        if (server.passwordLength == 5) guess = "admin";
        if (server.passwordLength == 8) guess = "password";
      }
      if (!guess) return false;
      const ok = await ns.dnet.authenticate(node, guess);
      return ok ? { strategy: this.name + ": " + guess, success: true } : false;
    },
  },
  {
    name: "roman-numeral",
    canAttempt(server) {
      return server.data.length > 0 && /^[IVXLCDM]+$/.test(server.data);
    },
    async crack(ns, node, server) {
      const guess = String(fromRoman(server.data));
      const ok    = await ns.dnet.authenticate(node, guess);
      return ok ? { strategy: this.name + ": " + guess, success: true } : false;
    },
  },
  {
    name: "brute-force",
    canAttempt(server) {
      return server.passwordLength == 2;
    },
    async crack(ns, node) {
      for (let i = 0; i < 100; i++) {
        const guess = i.toString().padStart(2, "0");
        if (await ns.dnet.authenticate(node, guess)) {
          return { strategy: this.name + ": " + guess, success: true };
        }
      }
      return false;
    },
  },
  {
    name: "common-password",
    canAttempt() {
      return true;
    },
    async crack(ns, node) {
      for (const password of COMMON_PASSWORDS) {
        if (await ns.dnet.authenticate(node, password)) {
          return { strategy: this.name + ": " + password, success: true };
        }
      }
      return false;
    },
  },
];

async function openLocalCaches(ns, host, MY_V) {
  const allFiles = ns.ls(host);
  ns.tryWritePort(DARKNET_PORT, JSON.stringify({ v: MY_V, host, caches: allFiles }));
  
  const cacheFiles = ns.ls(host).filter(f => f.endsWith(".cache"));
  if (!cacheFiles.length) return;
  const results = [];
  for (const filename of cacheFiles) {
    try {
      const content = await ns.dnet.openCache(filename);
      results.push({ filename, content });
    } catch (e) {
      results.push({ filename, error: e?.message ?? String(e) });
    }
  }
  ns.tryWritePort(DARKNET_PORT, JSON.stringify({ v: MY_V, host, caches: results }));
}

async function authenticate(ns, node, server) {
  for (const strategy of AUTH_STRATEGIES) {
    if (!strategy.canAttempt(server)) continue;
    const result = await strategy.crack(ns, node, server);
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
      const server      = ns.dnet.getServerDetails(node);
      const auth        = await authenticate(ns, node, server);
      const freshServer = auth.success ? ns.dnet.getServerDetails(node) : server;

      if (DEBUG_DUMP && auth.success) ns.tryWritePort(DARKNET_PORT, JSON.stringify({ dbg: "server-dump", node, server: freshServer }));

      ns.tryWritePort(DARKNET_PORT, JSON.stringify({
        v: MY_V,
        host,
        node,
        auth,
        serverInfo: auth.success ? undefined : server,
        ts: Date.now()
      }));

      if (!freshServer.isOnline || !freshServer.isConnectedToCurrentServer || !freshServer.hasSession) {
        continue;
      }

      // Aggressive propagation — self-healing chain for multi-hop nodes
      if (ns.isRunning(SPORE, node)) ns.kill(SPORE, node);
      ns.scp(SPORE, node);
      ns.exec(SPORE, node, { preventDuplicates: true });
    }

    const phishResult = await ns.dnet.phishingAttack();
    ns.tryWritePort(DARKNET_PORT, JSON.stringify({ v: MY_V, host, phishing: phishResult }));

    await openLocalCaches(ns, host, MY_V);

    await ns.sleep(10000);
  }
}
