// Part of the engine-v2 system — engine-v2-darknet.js: DarknetEngine runner
import { EngineStoke }                              from "lib/engine-stoke.js";
import { writeLedger }                              from "lib/darknet.js";
import { textCyane, textYellow, textGreen, textRed, createButton } from "lib/ui.js";
import { DARKNET_ROAMING_PORT, DARKNET_BROADCAST_PORT,
         uiQuonfigWidth, uiEngineWidth,
         uiTopPadding, uiDarknetWidth, uiDarknetHeight } from "env.js";

const SPORE            = "spores/dark-tendril.js";
const STALE_TIMEOUT_MS = 30_000;
const DASH_WIDTH       = 94;

let searchQuery        = "";    // current name filter; empty = show all
let pendingSearch      = false; // set by the 🔍 button, consumed by the main loop
let pendingStasis      = false; // set by the ⚓ button, consumed by the main loop
let pendingFilterNode  = null;  // set by per-row 🔍 buttons; consumed by the main loop
let currentSingleMatch = null;  // node name when exactly one row is shown, else null

// ── helpers ───────────────────────────────────────────────────────────────────

/** FNV-ish hash of spore source — used to detect outdated tendril instances. */
function sporeFingerprint(content) {
  let h = 0;
  for (let i = 0; i < content.length; i++) h = (h * 31 + content.charCodeAt(i)) >>> 0;
  return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * Cyan section header sized to DASH_WIDTH.
 * Pass visibleLen when title already contains ANSI codes — otherwise ANSI bytes
 * inflate prefix.length and the dash count comes out wrong.
 */
function sectionTitle(title, visibleLen = null) {
  if (visibleLen == null) {
    const prefix = `── ${textCyane(title)} `;
    return prefix + "─".repeat(DASH_WIDTH - prefix.length);
  }
  const prefix = `── ${title} `;
  return prefix + "─".repeat(Math.max(0, DASH_WIDTH - (3 + visibleLen + 1)));
}

// ── TickHistory ───────────────────────────────────────────────────────────────

/** Fixed-capacity ring buffer of tick snapshots, used for sparkline rendering. */
class TickHistory {
  #capacity;
  #entries = [];

  constructor(capacity = 60) { this.#capacity = capacity; }

  push(snapshot) {
    this.#entries.push(snapshot);
    if (this.#entries.length > this.#capacity) this.#entries.shift();
  }

  get entries() { return this.#entries; }
  get latest()  { return this.#entries.at(-1) ?? null; }
  get length()  { return this.#entries.length; }
}

/** Renders an array of numeric values as a single-line unicode bar chart. */
function sparkline(values) {
  const BARS = " ▁▂▃▄▅▆▇█";
  const max  = Math.max(...values, 1);
  return values.map(v => BARS[Math.min(8, Math.round((v / max) * 8))]).join("");
}

/** Walks parent links to build a terminal connect chain, e.g. "connect darkweb ; connect neo-hub ; connect node". */
function buildConnectChain(node, nodeMap) {
  const chain   = [];
  let   current = node;
  const visited = new Set();
  while (current) {
    if (visited.has(current)) break;
    visited.add(current);
    chain.unshift(current);
    const rec = nodeMap.get(current);
    current = rec?.parent ?? null;
  }
  if (chain[0] !== "darkweb") chain.unshift("darkweb");
  return chain.map(n => `connect ${n}`).join(" ; ");
}

// ── React CSS colour tokens ───────────────────────────────────────────────────
const COLOR = { green: "#4ade80", yellow: "#fbbf24", red: "#f87171", cyan: "#36d9d9", dim: "#6b7280" };

/** Wrap text in a React span with the given CSS color. */
function c(text, color) {
  return React.createElement("span", { style: { color } }, text);
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

/**
 * Clears and redraws the darknet tail window each tick.
 * Sections: search bar (🔍 button + active query), CONVERGENCE (spore fleet health +
 * cracked tallies), NODES (per-node table, filtered by searchQuery when set; single
 * match expands to full JSON record).
 */
function printDashboard(ns, engine) {
  const { nodeMap, history } = engine;
  const expected = engine.expectedV;
  const now      = Date.now();

  // Classify nodes by spore freshness; also tally cracked vs locked
  const current = new Set(), stale = new Set(), silent = new Set(), dead = new Set();
  let cracked = 0, locked = 0;
  for (const [node, rec] of nodeMap) {
    if (rec.cracked) cracked++; else locked++;
    if (rec.dead) { dead.add(node); continue; }
    if (now - rec.ts > STALE_TIMEOUT_MS) { silent.add(node); continue; }
    if (rec.v === expected) current.add(node);
    else stale.add(node);
  }

  ns.clearLog();

  // ── SEED STORM banner (persists for the session once triggered) ────────────
  if (engine.stormSeedEvents.length > 0) {
    const BANNER = { fontFamily: "monospace", fontSize: "1em", fontWeight: "bold",
                     color: "#ffffff", background: "#7c3aed", padding: "2px 8px",
                     display: "block", whiteSpace: "pre" };
    ns.printRaw(React.createElement("span", { style: BANNER },
      `⚡ SEED STORM UNLEASHED (${engine.stormSeedEvents.length})`
    ));
    for (const ev of engine.stormSeedEvents) {
      const ageS  = Math.floor((now - ev.ts) / 1000);
      const ageStr = ageS < 60 ? `${ageS}s ago` : `${Math.floor(ageS/60)}m ago`;
      ns.printRaw(React.createElement("span", { style: { fontFamily: "monospace", fontSize: "0.85em", color: "#c4b5fd", whiteSpace: "pre" } },
        `  ⚡ ${ev.node.padEnd(24)} ${ageStr}`
      ));
    }
  }

  // ── Search bar ─────────────────────────────────────────────────────────────
  const stasisLabel = currentSingleMatch ? `⚓ ${currentSingleMatch}` : "⚓ stasis";
  const searchBar = React.createElement("span", { style: { fontFamily: "monospace", fontSize: "0.9em" } },
    createButton("🔍 filter", () => { pendingSearch = true; }),
    searchQuery
      ? React.createElement("span", { style: { marginLeft: "10px", color: "#36d9d9" } }, `"${searchQuery}"`)
      : null,
    searchQuery
      ? createButton("✕", () => { searchQuery = ""; })
      : null,
    React.createElement("span", { style: { marginLeft: "16px" } }),
    createButton(stasisLabel, () => { pendingStasis = true; }),
  );
  ns.printRaw(searchBar);

  // ── CONVERGENCE ────────────────────────────────────────────────────────────
  ns.print(sectionTitle("CONVERGENCE"));
  const snap = history.latest;
  if (snap) {
    const window = history.entries.slice(-40).map(s => s.current);
    const total  = nodeMap.size;
    ns.print(`  current ${String(current.size).padStart(3)}  stale ${String(stale.size).padStart(3)}  silent ${String(silent.size).padStart(3)}  dead ${String(dead.size).padStart(3)}   ·   ${textGreen(`cracked ${cracked}`)} / ${textRed(`locked ${locked}`)}  (${total} total)`);
    if (window.length > 1) ns.print(`  trend   ${sparkline(window)}`);
    try {
      const linked = ns.dnet.getStasisLinkedServers();
      const limit  = ns.dnet.getStasisLinkLimit();
      const names  = linked.length ? linked.map(n => textCyane(`⚓ ${n}`)).join("  ") : "none";
      ns.print(`  stasis  ${names}  (${linked.length}/${limit})`);
    } catch {}
  } else {
    ns.print("  awaiting first tick…");
  }

  // ── NODES ──────────────────────────────────────────────────────────────────
  const nodesTitle        = `${textCyane("NODES")} ( ${textGreen("●")} current  ${textYellow("●")} stale  ○ silent  ${textRed("●")} dead )`;
  const nodesTitleVisible = "NODES ( ● current  ● stale  ○ silent  ● dead )".length;
  ns.print(sectionTitle(nodesTitle, nodesTitleVisible));
  if (nodeMap.size === 0) {
    ns.print("  no nodes discovered yet");
  } else {
    // Tier 0: cracked + not dead  |  Tier 1: online + locked  |  Tier 2: dead / offline
    const nodeTier = rec => {
      if (rec.dead || !rec.isOnline) return 2;
      if (rec.cracked) return 0;
      return 1;
    };
    const sortedNodes = [...nodeMap.entries()].sort(([, a], [, b]) => {
      const tierDiff = nodeTier(a) - nodeTier(b);
      if (tierDiff !== 0) return tierDiff;
      return (a.depth ?? 999) - (b.depth ?? 999);
    });

    const q     = searchQuery.toLowerCase();
    const shown = q ? sortedNodes.filter(([name]) => name.toLowerCase().includes(q)) : sortedNodes;

    // Shared style for all table rows — must match header for column alignment
    const ROW = { fontFamily: "monospace", fontSize: "0.9em", whiteSpace: "pre" };

    // Header (React so font/size matches data rows)
    ns.printRaw(React.createElement("span", { style: ROW },
      `  ${"●"} ${"NODE".padEnd(22)} ${"D".padStart(2)}  ${"CHA".padStart(5)} ${"C/L".padStart(5)}  ${"AGE".padStart(5)}  ${"STAT".padEnd(5)}  AUTH`
    ));
    if (q) ns.print(`  ${textYellow(`filter "${searchQuery}"  (${shown.length} match${shown.length === 1 ? "" : "es"})`)}`);
    if (q && shown.length === 0) ns.print("  no nodes match");

    for (const [node, rec] of shown) {
      // ── dot ──────────────────────────────────────────────────────────────
      const dotEl = dead.has(node)   ? c("●", COLOR.red)
                  : silent.has(node) ? "○"
                  : stale.has(node)  ? c("●", COLOR.yellow)
                  : c("●", COLOR.green);

      // ── node name (22 cols) ───────────────────────────────────────────────
      const variationSelectors = (node.match(/️/g) ?? []).length;
      const nodeNameParts = node.length > 22
        ? [node.slice(0, 21), c("|", COLOR.red)]
        : [node.padEnd(22) + " ".repeat(variationSelectors)];

      // ── fixed-width columns ───────────────────────────────────────────────
      const depth        = rec.depth       != null ? String(rec.depth).padStart(2)       : " ?";
      const charisma     = rec.charismaReq != null ? String(rec.charismaReq).padStart(5) : "    ?";
      const cRaw         = rec.caches?.length ?? 0;
      const lRaw         = Object.keys(rec.loot ?? {}).length;
      const cacheAndLoot = `${String(cRaw || "-").padStart(2)}${String(lRaw || "-").padStart(2)}`;

      // ── age (yellow when stale) ───────────────────────────────────────────
      const ageSeconds = rec.lastSeen == null ? null : Math.round((now - rec.lastSeen) / 1000);
      const ageStr     = ageSeconds == null ? "    —" : `${ageSeconds}s`.padStart(5);
      const ageEl      = ageSeconds != null && ageSeconds > STALE_TIMEOUT_MS / 1000
        ? c(ageStr, COLOR.yellow)
        : ageStr;

      // ── online status ─────────────────────────────────────────────────────
      const statusParts = rec.isOnline == null ? ["?    "]
        : !rec.isOnline  ? [c("off", COLOR.red),    "  "]
        : rec.hasSession ? [c("on+s", COLOR.green),  " "]
        :                  [c("on", COLOR.yellow),   "   "];

      // ── auth / fail info ──────────────────────────────────────────────────
      let authParts;
      if (rec.cracked) {
        const authDisplay = rec.strategy === "cached" && rec.crackedStrategy
          ? `(c) ${rec.crackedStrategy}${rec.crackedMs != null ? ` (${rec.crackedMs}ms)` : ""}`
          : `${rec.strategy ?? "cracked"}${rec.authMs != null ? ` (${rec.authMs}ms)` : ""}`;
        authParts = [c(`✓ ${authDisplay}`, COLOR.green)];
      } else {
        authParts = [c("✗ locked", COLOR.red)];
        if (rec.failCount > 0) authParts.push(c(`  ⟳x${rec.failCount}`, COLOR.dim));
      }

      // Per-row filter button — sets searchQuery to this node, triggering single-match JSON view
      const filterBtn = React.createElement("button", {
        onClick: () => { pendingFilterNode = node; },
        style: { cursor: "pointer", fontSize: "0.7em", padding: "0 3px", marginRight: "4px", opacity: "0.5" },
      }, "🔍");

      const AUTH_COL = "   ";

      ns.printRaw(React.createElement("span", { style: ROW },
        filterBtn, dotEl, " ", ...nodeNameParts, " ", depth, "  ", charisma, "  ", cacheAndLoot, "  ", ageEl, "  ", ...statusParts, "  ", ...authParts
      ));

      // Cracking info on its own line, indented to AUTH column; single space between each segment
      if (!rec.cracked && rec.crackingInfo) {
        const { model, length, format, hint } = rec.crackingInfo;
        const debugParts = [
          model  && c(model, COLOR.cyan),
          length && c(` len:${length}`, COLOR.dim),
          format && c(` fmt:${format}`, COLOR.dim),
          hint   && c(` "${hint.slice(0, 60)}"`, COLOR.yellow),
        ].filter(Boolean);
        if (debugParts.length) ns.printRaw(React.createElement("span", { style: ROW }, AUTH_COL, ...debugParts));
      }

      if (shown.length === 1) {
        ns.print(`  ${textCyane(buildConnectChain(node, nodeMap))}`);
        JSON.stringify(rec, null, 2).split("\n").forEach(line => ns.print("  " + line));
      }
    }
    currentSingleMatch = shown.length === 1 ? shown[0][0] : null;
  }
}

// ── Engine ────────────────────────────────────────────────────────────────────

/**
 * Orchestrates the darknet fleet: spreads dark-tendril spores across reachable
 * nodes, drains their uplink reports, broadcasts known secrets back down, enriches
 * node records from direct ns.dnet.* queries, persists state to darknet.json, and
 * redraws the dashboard each tick.
 */
class DarknetEngine extends EngineStoke {
  constructor(ns) {
    super(ns, "darknet");
    this.nodeMap         = new Map();
    this.history         = new TickHistory(60);
    this.phishSuccesses  = 0;
    this.phishFailures   = 0;
    this.stormSeedEvents = []; // { node, ts, result }
  }

  /** Hash of the spore file currently on home — tendrils reporting a different v are stale. */
  get expectedV() {
    return sporeFingerprint(this.ns.read(SPORE));
  }

  /** Upserts a node record with default nulls; always returns the live record. */
  #record(node) {
    if (!this.nodeMap.has(node)) {
      this.nodeMap.set(node, { node, v: null, ts: 0, cracked: false, strategy: null,
        secret: null, depth: null, charismaReq: null, blockedRam: null,
        isOnline: null, hasSession: null, isConnectedToCurrentServer: null,
        modelId: null, caches: [], loot: {}, lastSeen: null, dead: false,
        authMs: null, crackedStrategy: null, crackedMs: null, parent: null,
        crackingInfo: null, crackDebugHistory: [], failCount: 0 });
    }
    return this.nodeMap.get(node);
  }

  /**
   * Ensures a dark-tendril is running on the given node at the current spore version.
   * Skips nodes that are unreachable, under-RAM, or already current + fresh.
   * Updates the node record with live connectivity state before any early return.
   */
  async spread(node) {
    const darknetServer = this.ns.dnet.getServerDetails(node);

    const rec = this.#record(node);
    rec.isOnline                   = darknetServer.isOnline;
    rec.hasSession                 = darknetServer.hasSession;
    rec.isConnectedToCurrentServer = darknetServer.isConnectedToCurrentServer;

    if (!darknetServer.isOnline || !darknetServer.isConnectedToCurrentServer) return;

    // Session expired but we have the secret — try to restore it before spreading
    if (!darknetServer.hasSession && rec.cracked && rec.secret != null) {
      try {
        const ok = await this.ns.dnet.authenticate(node, rec.secret);
        if (ok) rec.hasSession = true;
      } catch {}
    }

    if (!rec.hasSession) return;

    const sporeRam = this.ns.getScriptRam(SPORE, "home");
    const nodeRam  = this.ns.getServerMaxRam(node);
    if (nodeRam < sporeRam) return;

    const fresh   = rec.ts && (Date.now() - rec.ts) < STALE_TIMEOUT_MS;
    const current = rec.v === this.expectedV;
    const running = this.ns.isRunning(SPORE, node);

    if (running && current && fresh) return;

    if (running) this.ns.kill(SPORE, node);

    this.ns.scp(SPORE, node, "home");
    this.ns.exec(SPORE, node, { preventDuplicates: true });
  }

  /**
   * Consumes all messages from the roaming port (666) and merges them into nodeMap.
   * Handles: heartbeats (version + ts), auth results (cracked + secret), cache
   * discoveries, phishing results, and server connectivity flags.
   */
  drainPort() {
    let entry;
    while ((entry = this.ns.readPort(DARKNET_ROAMING_PORT)) !== "NULL PORT DATA") {
      try {
        const msg = JSON.parse(entry);
        const { host, v, node, auth, secret, isOnline, hasSession, serverInfo, dbg, phishing, caches, loot, stormSeed, died, depth, charismaReq, authMs, crackingInfo, crackDebug } = msg;

        if (host && v) {
          const rec    = this.#record(host);
          rec.v        = v;
          rec.ts       = died ? 0 : Date.now();
          rec.lastSeen = Date.now();
          if (died) { rec.dead = true; rec.hasSession = false; }
          else        rec.dead = false;
        }

        if (phishing) {
          if (phishing.success) this.phishSuccesses++;
          else                  this.phishFailures++;
          if (!node) continue;
        }

        if (dbg) continue;

        if (caches?.length) {
          const key = host ?? node;
          if (key) this.#record(key).caches = caches;
          continue;
        }

        if (loot && node) {
          const rec = this.#record(node);
          rec.loot = { ...rec.loot, ...loot };
          continue;
        }

        if (stormSeed && node) {
          this.stormSeedEvents.push({ node, ts: stormSeed.ts ?? Date.now(), result: stormSeed.result });
          continue;
        }

        if (!node) continue;

        const rec    = this.#record(node);
        rec.lastSeen = Date.now();
        if (isOnline  != null) rec.isOnline  = isOnline;
        if (hasSession != null) rec.hasSession = hasSession;
        if (auth?.success) {
          if (!rec.cracked) {
            rec.crackedStrategy = auth.strategy ?? null;
            rec.crackedMs       = authMs        ?? null;
            rec.failCount       = 0;
          }
          rec.cracked  = true;
          rec.strategy = auth.strategy ?? rec.strategy;
          rec.secret   = secret        ?? rec.secret;
        } else if (auth && !auth.success) {
          rec.failCount = (rec.failCount ?? 0) + 1;
          if (rec.cracked && isOnline !== false) {
            // Secret is stale (e.g. KingOfTheHill password changed) — force re-crack.
            rec.cracked  = false;
            rec.secret   = null;
            rec.strategy = null;
          }
        }
        if (serverInfo) {
          rec.isOnline                   = serverInfo.isOnline  ?? rec.isOnline;
          rec.hasSession                 = serverInfo.hasSession ?? rec.hasSession;
          rec.isConnectedToCurrentServer = serverInfo.isConnectedToCurrentServer ?? rec.isConnectedToCurrentServer;
          rec.modelId                    = serverInfo.modelId   ?? rec.modelId;
        }
        if (depth      != null) rec.depth       = depth;
        if (charismaReq != null) rec.charismaReq = charismaReq;
        if (authMs     != null) rec.authMs      = authMs;
        if (rec.parent      == null && host)        rec.parent      = host;
        if (crackingInfo)                           rec.crackingInfo = crackingInfo;
        if (crackDebug  != null && Object.keys(crackDebug).length > 0) {
          rec.crackDebugHistory = [...(rec.crackDebugHistory ?? []).slice(-4), { ts: Date.now(), ...crackDebug }];
        }
      } catch {
        // ignore malformed port messages
      }
    }
  }

  /**
   * Enriches node records with data only the engine can query directly:
   * depth, charisma requirement, blocked RAM, and live connectivity.
   * Only covers nodes visible from home via ns.dnet.probe(); deeper nodes
   * are enriched exclusively through tendril uplink reports.
   */
  enrichFromDnet() {
    try {
      for (const node of this.ns.dnet.probe()) {
        const rec = this.#record(node);
        try { rec.depth       = this.ns.dnet.getDepth(node); }                       catch {}
        try { rec.charismaReq = this.ns.dnet.getServerRequiredCharismaLevel(node); } catch {}
        try { rec.blockedRam  = this.ns.dnet.getBlockedRam(node); }                  catch {}
        try {
          const det = this.ns.dnet.getServerDetails(node);
          rec.isOnline                   = det.isOnline;
          rec.hasSession                 = det.hasSession;
          rec.isConnectedToCurrentServer = det.isConnectedToCurrentServer;
          rec.modelId                    = det.modelId ?? rec.modelId;
        } catch {}
      }
    } catch {
      // ns.dnet.probe() throws if darknet is not yet unlocked
    }
  }

  /**
   * Refreshes the broadcast port (1666) with a peek-able { node: secret } snapshot.
   * Tendrils read this each tick to skip re-cracking already-known nodes.
   * The port is drained before writing to ensure exactly one message is present.
   */
  publishSecrets() {
    const secrets = {};
    for (const [node, rec] of this.nodeMap) {
      if (rec.cracked && rec.secret != null) secrets[node] = rec.secret;
    }
    while (this.ns.readPort(DARKNET_BROADCAST_PORT) !== "NULL PORT DATA") {}
    this.ns.tryWritePort(DARKNET_BROADCAST_PORT, JSON.stringify(secrets));
  }

  /**
   * Re-spreads the spore to nodes that are active (seen within STALE_TIMEOUT_MS)
   * but running an outdated version. Uses preventDuplicates: false to force a
   * fresh exec alongside any lingering stale instance.
   */
  floodStale() {
    const expected = this.expectedV;
    for (const [node, rec] of this.nodeMap) {
      if (!rec.ts || Date.now() - rec.ts > STALE_TIMEOUT_MS) continue;
      if (rec.v === expected) continue;
      this.ns.scp(SPORE, node, "home");
      this.ns.exec(SPORE, node, { preventDuplicates: false });
    }
  }

  /** One engine cycle: spread → flood stale → drain uplink → publish secrets →
   *  enrich from dnet → snapshot history → persist ledger → redraw dashboard. */
  async tick() {
    const ns = this.ns;

    for (const node of ns.dnet.probe()) {
      await this.spread(node);
    }
    this.floodStale();
    this.drainPort();
    this.publishSecrets();
    this.enrichFromDnet();

    const expected = this.expectedV;
    const now      = Date.now();
    let currentCount = 0;
    for (const rec of this.nodeMap.values()) {
      if (now - rec.ts <= STALE_TIMEOUT_MS && rec.v === expected) currentCount++;
    }
    this.history.push({ current: currentCount, ts: now });

    writeLedger(ns, this.nodeMap, { phishSuccesses: this.phishSuccesses, phishFailures: this.phishFailures });
    printDashboard(ns, this);
  }
}

// ── init ──────────────────────────────────────────────────────────────────────

function initDarknetWindow(ns) {
  ns.disableLog("ALL");
  const W = ns.ui.windowSize()[0];
  const x = W - uiQuonfigWidth - uiEngineWidth - uiDarknetWidth - 2;
  const y = uiTopPadding + 30;
  ns.ui.openTail();
  ns.ui.resizeTail(uiDarknetWidth, uiDarknetHeight);
  ns.ui.moveTail(x, y);
}

export async function main(ns) {
  initDarknetWindow(ns);
  ns.atExit(() => ns.ui.closeTail());
  const engine = new DarknetEngine(ns);

  while (true) {
    await engine.tick();
    const until = Date.now() + engine.loopDelay;
    while (Date.now() < until) {
      if (pendingSearch) {
        pendingSearch = false;
        const result = await ns.prompt("Filter nodes by name (blank to clear)", { type: "text" });
        searchQuery = result ? String(result) : "";
        printDashboard(ns, engine);
      }
      if (pendingFilterNode != null) {
        searchQuery = pendingFilterNode;
        pendingFilterNode = null;
        printDashboard(ns, engine);
      }
      if (pendingStasis) {
        pendingStasis = false;
        const target = currentSingleMatch
          ?? await ns.prompt("Node to stasis-link", { type: "text" });
        if (target) {
          try { await ns.dnet.setStasisLink(String(target)); } catch {}
        }
        printDashboard(ns, engine);
      }
      await ns.sleep(50);
    }
  }
}
