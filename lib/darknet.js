// Part of the engine-v2 system — lib/darknet.js: darknet node ledger (read/write)

const DATA_FILE = "darknet.json";

/**
 * Persist the nodeMap and engine meta (phishing counts etc.) to darknet.json.
 * @param {NS} ns
 * @param {Map<string, object>} nodeMap  node name → full record
 * @param {object} meta  arbitrary engine-level stats to store alongside nodes
 */
export function writeLedger(ns, nodeMap, meta = {}) {
  const nodes = {};
  for (const [node, rec] of nodeMap) nodes[node] = rec;
  ns.write(DATA_FILE, JSON.stringify({ nodes, meta }, null, 2), "w");
}

/**
 * Read darknet.json and return node records.
 * @param {NS} ns
 * @param {"all"|"cracked"|"locked"} filter
 * @returns {object[]}
 */
export function getDarknetNodes(ns, filter = "all") {
  const raw = ns.read(DATA_FILE);
  if (!raw) return [];
  let data;
  try { data = JSON.parse(raw); } catch { return []; }
  const records = Object.values(data.nodes ?? data); // backwards-compat with old flat format
  if (filter === "cracked") return records.filter(r => r.cracked);
  if (filter === "locked")  return records.filter(r => !r.cracked);
  return records;
}

/**
 * Wipe darknet.json to an empty ledger.
 * Called on engine start (so external readers never see stale previous-run data)
 * and by the dashboard's reset-state button.
 * @param {NS} ns
 */
export function clearLedger(ns) {
  ns.write(DATA_FILE, JSON.stringify({ nodes: {}, meta: {} }), "w");
}

/**
 * Read engine-level meta from darknet.json (phishing counts, etc.).
 * @param {NS} ns
 * @returns {object}
 */
export function getDarknetMeta(ns) {
  const raw = ns.read(DATA_FILE);
  if (!raw) return {};
  try { return JSON.parse(raw).meta ?? {}; } catch { return {}; }
}
