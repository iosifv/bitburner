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

  const PROGRAMS = [
    "BruteSSH.exe",
    "FTPCrack.exe",
    "relaySMTP.exe",
    "HTTPWorm.exe",
    "SQLInject.exe",
    "DeepscanV1.exe",
    "DeepscanV2.exe",
    "AutoLink.exe",
    "ServerProfiler.exe",
    "Formulas.exe",
  ];

  // ── Buy TOR + programs ───────────────────────────────────────────────────
  ns.tprint("─".repeat(50));
  ns.tprint("SHOP    Buying TOR + programs...");

  const torBought = ns.singularity.purchaseTor();
  ns.tprint(`${"TOR".padEnd(8)} ${torBought ? "purchased ✅" : "already owned or insufficient funds"}`);

  for (const program of PROGRAMS) {
    if (ns.fileExists(program, "home")) {
      ns.tprint(`${"OWN".padEnd(8)} ${program.padEnd(25)} already owned`);
      continue;
    }
    const bought = ns.singularity.purchaseProgram(program);
    ns.tprint(`${(bought ? "BUY" : "SKIP").padEnd(8)} ${program.padEnd(25)} ${bought ? "purchased ✅" : "insufficient funds"}`);
  }

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