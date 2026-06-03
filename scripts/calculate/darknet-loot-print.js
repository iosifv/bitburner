import { getDarknetNodes } from "lib/darknet.js";

export async function main(ns) {
  const nodes = getDarknetNodes(ns, "all").filter(r => Object.keys(r.loot ?? {}).length > 0);

  if (!nodes.length) {
    ns.tprintRaw("No loot found in darknet.json yet.");
    return;
  }

  for (const rec of nodes) {
    ns.tprintRaw(`\n── ${rec.node} ${"─".repeat(Math.max(0, 50 - rec.node.length))}`);
    for (const [filename, content] of Object.entries(rec.loot)) {
      ns.tprintRaw(`  [${filename}]`);
      ns.tprintRaw(content.replace(/<[^>]+>/g, "").trim());
    }
  }
}
