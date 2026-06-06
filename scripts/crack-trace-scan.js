/**
 * crack-trace-scan.js — post-crash forensic tool
 *
 * After a Bitburner black-screen (OOM) crash, reload and run:
 *   run scripts/crack-trace-scan.js
 *
 * Each dark-tendril writes crack-trace.txt on its node before entering a cold
 * crack and clears it immediately after. A non-empty file left behind = the
 * strategy that was mid-flight when the tab died.
 */
export async function main(ns) {
  ns.disableLog("ALL");

  const FILE = "crack-trace.txt";
  let found = 0;

  // Check home first.
  const homeTrace = ns.read(FILE);
  if (homeTrace) {
    ns.tprint(`[home] crack-trace.txt: ${homeTrace}`);
    found++;
  }

  // Walk every known darknet node (best-effort: probe + darknet.json).
  const nodes = new Set();
  try {
    for (const node of ns.dnet.probe()) nodes.add(node);
  } catch {}

  try {
    const raw = ns.read("darknet.json");
    if (raw) {
      const data = JSON.parse(raw);
      for (const node of Object.keys(data.nodes ?? {})) nodes.add(node);
    }
  } catch {}

  for (const node of nodes) {
    try {
      const trace = ns.read(FILE, node);
      if (trace && trace !== "NULL PORT DATA") {
        ns.tprint(`[${node}] crack-trace.txt: ${trace}`);
        found++;
      }
    } catch {}
  }

  if (found === 0) {
    ns.tprint("No crack-trace.txt files found — either no crash occurred, or the autosave didn't capture it.");
  } else {
    ns.tprint(`Found ${found} trace file(s). The listed model(s) were mid-crack when the game died.`);
  }
}
