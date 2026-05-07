/**
 * 00-init.js
 * Nukes and hacks faction servers in order.
 * Prints the path to each server from servers.json.
 * Also buys TOR router and all available programs.
 *
 * Usage: run 00-init.js
 */
import { fillTerminal, printButton } from "lib/utils.js";

export async function main(ns) {

  const TARGETS = [
    "CSEC",
    "avmnite-02h",
    "I.I.I.I",
    "run4theh111z",
    "w0r1d_d43m0n",
  ];

  // ── Buy TOR + programs ───────────────────────────────────────────────────
  ns.tprint("─".repeat(50));

  // ── Hack targets ─────────────────────────────────────────────────────────
  const raw = ns.read("servers.json");
  const allServers = raw && raw !== "NULL PORT DATA" ? JSON.parse(raw) : [];
  const pathMap = Object.fromEntries(allServers.map(s => [s.name, s.path]));

  for (const target of TARGETS) {
    const tag = target.padEnd(20);
    const path = pathMap[target];

    // ns.tprintRaw("─".repeat(50));

    if (path) {
      const command = `connect ${path.join("; connect ")}; hack`;

      // ns.tprintRaw(`TARGET  ${tag} | ${path.join(" → ")}`);
      // ns.tprintRaw(`COMMAND   connect ${path.join("; connect ")}; hack`);

      printButton(ns, ` → `, "▶ run", `  ${tag} - ${path.join(" → ")}`,() => fillTerminal(command));
    } else {
      ns.tprintRaw(`PATH      not found in servers.json`);
    }
  }

  ns.tprintRaw("─".repeat(50));
}