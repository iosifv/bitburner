// Part of the engine-v2 system — engine-v2-darknet.js: DarknetEngine runner
import { EngineStoke }                              from "lib/engine-stoke.js";
import { writeLedger }                              from "lib/darknet.js";
import { textCyane, textYellow, textGreen, textRed } from "lib/ui.js";
import { DARKNET_ROAMING_PORT, DARKNET_BROADCAST_PORT,
         uiQuonfigWidth, uiEngineWidth,
         uiBatchingWidth, uiStatsWidth,
         uiBoysWidth, uiTopPadding, uiBoysHeight,
         uiDarknetWidth, uiDarknetHeight }          from "env.js";

const SPORE            = "spores/dark-tendril.js";
const STALE_TIMEOUT_MS = 30_000;
const DASH_WIDTH       = 80;

// ── helpers ───────────────────────────────────────────────────────────────────

/** FNV-ish hash of spore source — used to detect outdated tendril instances. */
function sporeFingerprint(content) {
  let h = 0;
  for (let i = 0; i < content.length; i++) h = (h * 31 + content.charCodeAt(i)) >>> 0;
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Cyan section header sized to DASH_WIDTH, matching the stats engine style. */
function sectionTitle(title) {
  const prefix = `── ${textCyane(title)} `;
  return prefix + "─".repeat(DASH_WIDTH - prefix.length);
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

// ── Dashboard ─────────────────────────────────────────────────────────────────

/**
 * Clears and redraws the darknet tail window each tick.
 * Sections: DARKNET (global state), CONVERGENCE (spore fleet health),
 * NODES (per-node auth + connectivity table), LOOT (caches + phishing).
 */
function printDashboard(ns, engine) {
  const { nodeMap, history } = engine;
  const expected = engine.expectedV;
  const now      = Date.now();

  // Classify nodes by spore freshness
  const current = [], stale = [], silent = [];
  for (const [node, rec] of nodeMap) {
    if (now - rec.ts > STALE_TIMEOUT_MS) { silent.push(node); continue; }
    if (rec.v === expected) current.push(node);
    else stale.push(node);
  }

  const lootCount  = [...nodeMap.values()].filter(r => Object.keys(r.loot ?? {}).length > 0).length;
  const cacheCount = [...nodeMap.values()].filter(r => r.caches?.length).length;

  ns.clearLog();

  // ── DARKNET ────────────────────────────────────────────────────────────────
  ns.print(sectionTitle("DARKNET"));
  try {
    const instab      = ns.dnet.getDarknetInstability();
    const stasisLimit = ns.dnet.getStasisLinkLimit();
    const stasisUsed  = ns.dnet.getStasisLinkedServers().length;
    ns.print(`  Instability  ${JSON.stringify(instab)}`);
    ns.print(`  Stasis       ${stasisUsed} / ${stasisLimit} links`);
  } catch { /* dnet may not be available every tick */ }
  ns.print(`  Spore v      ${expected}`);

  // ── LOOT ──────────────────────────────────────────────────────────────────
  ns.print(sectionTitle("LOOT"));
  ns.print(`  Caches    ${cacheCount} nodes`);
  ns.print(`  Loot      ${lootCount} nodes`);
  ns.print(`  Phishing  ${textGreen(`✓ ${engine.phishSuccesses}`)}  ${textRed(`✗ ${engine.phishFailures}`)}`);

  // ── CONVERGENCE ────────────────────────────────────────────────────────────
  ns.print(sectionTitle("CONVERGENCE"));
  const snap = history.latest;
  if (snap) {
    const window = history.entries.slice(-40).map(s => s.current);
    ns.print(`  current ${String(current.length).padStart(3)}  stale ${String(stale.length).padStart(3)}  silent ${String(silent.length).padStart(3)}`);
    if (window.length > 1) ns.print(`  trend   ${sparkline(window)}`);
  } else {
    ns.print("  awaiting first tick…");
  }
  if (stale.length)  ns.print(`  ${textYellow("STALE")}   ${stale.join("  ")}`);
  if (silent.length) ns.print(`  ${textYellow("SILENT")}  ${silent.join("  ")}`);

  // ── NODES ──────────────────────────────────────────────────────────────────
  ns.print(sectionTitle("NODES"));
  if (nodeMap.size === 0) {
    ns.print("  no nodes discovered yet");
  } else {
    ns.print(`  ${"NODE".padEnd(24)} ${"D".padStart(2)}  ${"CHA".padStart(5)}  AUTH`);
    for (const [node, rec] of nodeMap) {
      const depth    = rec.depth      != null ? String(rec.depth).padStart(2)      : " ?";
      const charisma = rec.charismaReq != null ? String(rec.charismaReq).padStart(5) : "    ?";
      const authStr  = rec.cracked
        ? textGreen(`✓ ${rec.strategy ?? "cracked"}`)
        : textRed("✗ locked");
      const online  = rec.isOnline  ? "" : textRed(" offline");
      const session = rec.hasSession ? "" : textYellow(" no-session");
      ns.print(`  ${node.padEnd(24)} ${depth}  ${charisma}  ${authStr}${online}${session}`);
    }
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
        modelId: null, caches: [], loot: {}, lastSeen: null });
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

    if (!darknetServer.isOnline || !darknetServer.isConnectedToCurrentServer || !darknetServer.hasSession) {
      return;
    }

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
        const { host, v, node, auth, secret, isOnline, hasSession, serverInfo, dbg, phishing, caches, loot, died } = msg;

        if (host && v) {
          const rec    = this.#record(host);
          rec.v        = v;
          rec.ts       = died ? 0 : Date.now();
          rec.lastSeen = Date.now();
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

        if (!node) continue;

        const rec    = this.#record(node);
        rec.lastSeen = Date.now();
        if (isOnline  != null) rec.isOnline  = isOnline;
        if (hasSession != null) rec.hasSession = hasSession;
        if (auth?.success) {
          rec.cracked  = true;
          rec.strategy = auth.strategy ?? rec.strategy;
          rec.secret   = secret        ?? rec.secret;
        }
        if (serverInfo) {
          rec.isOnline                   = serverInfo.isOnline  ?? rec.isOnline;
          rec.hasSession                 = serverInfo.hasSession ?? rec.hasSession;
          rec.isConnectedToCurrentServer = serverInfo.isConnectedToCurrentServer ?? rec.isConnectedToCurrentServer;
          rec.modelId                    = serverInfo.modelId   ?? rec.modelId;
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

    writeLedger(ns, this.nodeMap);
    printDashboard(ns, this);
  }
}

// ── init ──────────────────────────────────────────────────────────────────────

function initDarknetWindow(ns) {
  ns.disableLog("ALL");
  const W = ns.ui.windowSize()[0];
  const x = W - uiQuonfigWidth - uiEngineWidth - uiBatchingWidth - uiStatsWidth - uiBoysWidth - 4;
  const y = uiTopPadding + uiBoysHeight;
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
    await ns.sleep(engine.loopDelay);
  }
}
