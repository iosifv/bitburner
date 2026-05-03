/**
 * 00-init.js
 * Nukes and hacks faction servers in order.
 * Prints the path to each server from servers.json.
 * Also buys TOR router and all available programs.
 *
 * Usage: run 00-init.js
 */
export async function main(ns) {

  const TARGETS = [
    "CSEC",
    "avmnite-02h",
    "run4theh111z",
  ];

  // ── Buy TOR + programs ───────────────────────────────────────────────────
  ns.tprint("─".repeat(50));
  ns.tprint("SHOP    Running buy -a...");
  ns.terminal("buy -a");

  // ── Hack targets ─────────────────────────────────────────────────────────
  const raw        = ns.read("servers.json");
  const allServers = raw && raw !== "NULL PORT DATA" ? JSON.parse(raw) : [];
  const pathMap    = Object.fromEntries(allServers.map(s => [s.name, s.path]));

  for (const target of TARGETS) {
    const tag  = target.padEnd(20);
    const path = pathMap[target];

    ns.tprint("─".repeat(50));
    ns.tprint(`TARGET  ${tag}`);
    ns.tprint(`PATH    ${path ? path.join(" → ") : "not found in servers.json"}`);

    if (!ns.hasRootAccess(target)) {
      try { ns.nuke(target); } catch {
        ns.tprint(`SKIP    ${tag} — could not nuke`);
        continue;
      }
    }

    ns.tprint(`HACK    ${tag} hacking...`);
    const result = await ns.hack(target);
    ns.tprint(`OK      ${tag} stole $${ns.formatNumber(result)}`);
  }

  ns.tprint("─".repeat(50));
}
