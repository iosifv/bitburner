// Part of the engine-v2 system — lib/darknet.js: darknet node ledger (read/write)

const DATA_FILE = "darknet.json";

/**
 * Persist the nodeMap to darknet.json.
 * @param {NS} ns
 * @param {Map<string, object>} nodeMap  node name → full record
 */
export function writeLedger(ns, nodeMap) {
  const records = {};
  for (const [node, rec] of nodeMap) records[node] = rec;
  ns.write(DATA_FILE, JSON.stringify(records, null, 2), "w");
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
  let records;
  try { records = Object.values(JSON.parse(raw)); } catch { return []; }
  if (filter === "cracked") return records.filter(r => r.cracked);
  if (filter === "locked")  return records.filter(r => !r.cracked);
  return records;
}
