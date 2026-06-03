const DARKNET_ROAMING_PORT   = 666;
const DARKNET_BROADCAST_PORT = 1666;
const SPORE         = "spores/dark-tendril.js";
const BRAINWORM     = "spores/brainworm.js";
const LOOP_MS       = 2_000;
const DEBUG_DUMP    = false;


function sporeFingerprint(content) {
  let h = 0;
  for (let i = 0; i < content.length; i++) h = (h * 31 + content.charCodeAt(i)) >>> 0;
  return (h >>> 0).toString(16).padStart(8, "0");
}

// ── DarkAuthenticator ─────────────────────────────────────────────────────────
// Strategy contract: canAttempt(server) → bool
//                    crack(ns, node, server) → { success: bool, detail?: string }

class DarkAuthenticator {
  static #fromRoman(s) {
    const vals = { I:1, V:5, X:10, L:50, C:100, D:500, M:1000 };
    let n = 0;
    for (let i = 0; i < s.length; i++) {
      const cur = vals[s[i]], nxt = vals[s[i+1]];
      n += (nxt && cur < nxt) ? -cur : cur;
    }
    return n;
  }

  static #commonPasswords = [
    "",
    "password", "12345678",
    "qwerty", "123456789", "12345", "1234", "111111", "1234567",
    "dragon", "123123", "baseball", "abc123", "football", "monkey", "letmein"
  ];

  static #strategies = [
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
        const detail = server.passwordHint.replace(/\D/g, "");
        return { success: await ns.dnet.authenticate(node, detail), detail };
      },
    },
    {
      name: "pin-in-data",
      canAttempt(server) {
        return server.passwordHint.includes("Type the numbers to prove you are human");
      },
      async crack(ns, node, server) {
        const detail = server.data.replace(/\D/g, "");
        return { success: await ns.dnet.authenticate(node, detail), detail };
      },
    },
    {
      name: "fresh-install",
      canAttempt(server) {
        return server.modelId.includes("FreshInstall");
      },
      async crack(ns, node, server) {
        let detail = null;
        if (server.passwordFormat == "numeric") {
          if (server.passwordLength == 4) detail = "0000";
          if (server.passwordLength == 5) detail = "12345";
        }
        if (server.passwordFormat == "alphabetic") {
          if (server.passwordLength == 5) detail = "admin";
          if (server.passwordLength == 8) detail = "password";
        }
        if (!detail) return { success: false };
        return { success: await ns.dnet.authenticate(node, detail), detail };
      },
    },
    {
      name: "roman-numeral",
      canAttempt(server) {
        return server.data.length > 0 && /^[IVXLCDM]+$/.test(server.data);
      },
      async crack(ns, node, server) {
        const detail = String(DarkAuthenticator.#fromRoman(server.data));
        return { success: await ns.dnet.authenticate(node, detail), detail };
      },
    },
    {
      name: "brute-force",
      canAttempt(server) {
        return server.passwordLength == 2;
      },
      async crack(ns, node) {
        for (let i = 0; i < 100; i++) {
          const detail = i.toString().padStart(2, "0");
          if (await ns.dnet.authenticate(node, detail)) return { success: true, detail };
        }
        return { success: false };
      },
    },
    {
      name: "common-password",
      canAttempt() {
        return true;
      },
      async crack(ns, node) {
        for (const detail of DarkAuthenticator.#commonPasswords) {
          if (await ns.dnet.authenticate(node, detail)) return { success: true, detail };
        }
        return { success: false };
      },
    },
  ];

  #knownSecrets = new Map(); // node → secret (downlinked from engine)

  // Called each tick with the engine's latest broadcast object { node: secret, ... }
  syncSecrets(obj) {
    this.#knownSecrets = new Map(Object.entries(obj ?? {}));
  }

  async authenticate(ns, node, server) {
    // Tier 0: live session — no auth call needed at all
    if (server.hasSession) {
      return { success: true, strategy: "session", secret: this.#knownSecrets.get(node) };
    }

    // Tier 1: cached secret from engine downlink — single auth call
    const cached = this.#knownSecrets.get(node);
    if (cached != null) {
      if (await ns.dnet.authenticate(node, cached)) {
        return { success: true, strategy: "cached", secret: cached };
      }
    }

    // Tier 2: cold path — full strategy search
    for (const strategy of DarkAuthenticator.#strategies) {
      if (!strategy.canAttempt(server)) continue;
      const r = await strategy.crack(ns, node, server);
      if (r.success) {
        return { success: true, strategy: strategy.name, secret: r.detail };
      }
    }
    return { success: false, strategy: null, secret: undefined };
  }
}

// ── DarkAction ────────────────────────────────────────────────────────────────
// Strategy contract: canAttempt(ns, node, server) → bool
//                    execute(ns, node) → { success: bool, ...details }

class DarkAction {
  static #strategies = [
    {
      name: "propagate",
      canAttempt(ns, node, server) {
        return server.isOnline && server.isConnectedToCurrentServer && server.hasSession;
      },
      async execute(ns, node) {
        if (ns.isRunning(SPORE, node)) ns.kill(SPORE, node);
        ns.scp(SPORE, node);
        const pid = ns.exec(SPORE, node, { preventDuplicates: true });
        return { success: pid > 0 };
      },
    },
    {
      name: "brainworm",
      canAttempt(ns, node, server) {
        return server.isOnline && server.isConnectedToCurrentServer && server.hasSession
            && !ns.isRunning(BRAINWORM, node);
      },
      async execute(ns, node) {
        ns.scp(BRAINWORM, node, "home");
        const wormRam = ns.getScriptRam(BRAINWORM);
        const freeRam = ns.getServerMaxRam(node) - ns.getServerUsedRam(node);
        const threads = wormRam > 0 ? Math.floor(freeRam / wormRam) : 0;
        if (threads <= 0) return { success: false };
        const pid = ns.exec(BRAINWORM, node, threads);
        return { success: pid > 0, threads };
      },
    },
    {
      name: "exfiltrate",
      canAttempt(ns, node, server) {
        return server.isOnline && server.isConnectedToCurrentServer && server.hasSession;
      },
      async execute(ns, node) {
        const files = ns.ls(node).filter(f => f.endsWith(".txt") || f.endsWith(".lit"));
        if (!files.length) return { success: false };

        // Stage on this host to read contents, then clean up — engine stores in darknet.json
        ns.scp(files, ns.getHostname(), node);
        const loot = {};
        for (const f of files) {
          loot[f.split("/").at(-1)] = ns.read(f);
          ns.rm(f);
        }
        return { success: true, loot };
      },
    },
  ];

  // Runs all applicable action strategies against a node; returns result array.
  async run(ns, node, server) {
    const results = [];
    for (const action of DarkAction.#strategies) {
      if (!action.canAttempt(ns, node, server)) continue;
      results.push({ name: action.name, ...(await action.execute(ns, node)) });
    }
    return results;
  }
}

// ── DarkTendril ───────────────────────────────────────────────────────────────

class DarkTendril {
  constructor(ns) {
    this.ns      = ns;
    this.myV     = sporeFingerprint(ns.read(SPORE));
    this.host    = ns.getHostname();
    this.auth    = new DarkAuthenticator();
    this.actions = new DarkAction();
  }

  #report(payload) {
    this.ns.tryWritePort(DARKNET_ROAMING_PORT, JSON.stringify({ v: this.myV, host: this.host, ...payload }));
  }

  // Peek the engine downlink and refresh the authenticator's secret cache
  #syncSecrets() {
    const raw = this.ns.peek(DARKNET_BROADCAST_PORT);
    if (!raw || raw === "NULL PORT DATA") return;
    try { this.auth.syncSecrets(JSON.parse(raw)); } catch {}
  }

  async #phish() {
    const result = await this.ns.dnet.phishingAttack();
    this.#report({ phishing: result });
  }

  async #openCaches() {
    const allFiles   = this.ns.ls(this.host);
    const cacheFiles = allFiles.filter(f => f.endsWith(".cache"));
    this.#report({ caches: allFiles });
    if (!cacheFiles.length) return;

    const results = [];
    for (const filename of cacheFiles) {
      try {
        const content = await this.ns.dnet.openCache(filename);
        results.push({ filename, content });
      } catch (e) {
        results.push({ filename, error: e?.message ?? String(e) });
      }
    }
    this.#report({ caches: results });
  }

  async tick() {
    this.#syncSecrets();
    this.#report({ ts: Date.now() });

    for (const node of this.ns.dnet.probe()) {
      const server      = this.ns.dnet.getServerDetails(node);
      const auth        = await this.auth.authenticate(this.ns, node, server);
      const freshServer = auth.success ? this.ns.dnet.getServerDetails(node) : server;

      if (DEBUG_DUMP && auth.success) this.#report({ dbg: "server-dump", node, server: freshServer });

      // Report auth result + live connectivity so engine always has current state
      this.#report({
        node,
        auth:       { success: auth.success, strategy: auth.strategy },
        secret:     auth.secret,
        isOnline:   freshServer.isOnline,
        hasSession: freshServer.hasSession,
        serverInfo: auth.success ? undefined : server,
        ts:         Date.now(),
      });

      const actionResults = await this.actions.run(this.ns, node, freshServer);
      for (const result of actionResults) {
        if (result.loot) this.#report({ node, loot: result.loot });
      }
      if (DEBUG_DUMP && actionResults.length) this.#report({ dbg: "actions", node, results: actionResults });
    }

    await this.#phish();
    await this.#openCaches();
  }
}

export async function main(ns) {
  ns.disableLog("ALL");
  const tendril = new DarkTendril(ns);

  ns.atExit(() => {
    ns.tryWritePort(DARKNET_ROAMING_PORT, JSON.stringify({
      v:    tendril.myV,
      host: tendril.host,
      died: true,
      ts:   Date.now(),
    }));
  });

  while (true) {
    await tendril.tick();
    await ns.sleep(LOOP_MS);
  }
}

