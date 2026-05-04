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
    "I.I.I.I",
    "run4theh111z",
    "w0r1d_d43m0n",
  ];

  // Not sure this works tbh
  // function runTerminalCommand(cmd) {
  //   const input = document.getElementById("terminal-input");
  //   input.value = cmd;
  //   input.dispatchEvent(new KeyboardEvent("keydown", { keyCode: 13, bubbles: true }));
  // }

  // runTerminalCommand("buy -a");

  // ── Buy TOR + programs ───────────────────────────────────────────────────
  ns.tprint("─".repeat(50));
  // ns.tprint("SHOP    Running buy -a...");
  // ns.terminal("buy -a");

  // ── Hack targets ─────────────────────────────────────────────────────────
  const raw = ns.read("servers.json");
  const allServers = raw && raw !== "NULL PORT DATA" ? JSON.parse(raw) : [];
  const pathMap = Object.fromEntries(allServers.map(s => [s.name, s.path]));

  for (const target of TARGETS) {
    const tag = target.padEnd(20);
    const path = pathMap[target];

    ns.tprint("─".repeat(50));
    ns.tprint(`TARGET  ${tag}`);

    if (path) {
      ns.tprint(`PATH      ${path.join(" → ")}`);
      ns.tprint(`COMMAND   connect ${path.join("; connect ")}; hack`);
    } else {
      ns.tprint(`PATH      not found in servers.json`);
    }
    // if (!ns.hasRootAccess(target)) {
    //   try { ns.nuke(target); } catch {
    //     ns.tprint(`SKIP    ${tag} — could not nuke`);
    //     continue;
    //   }
    // }

    // ns.tprint(`HACK    ${tag} hacking...`);
    // const result = await ns.hack(target);
    // ns.tprint(`OK      ${tag} stole $${ns.formatNumber(result)}`);
  }

  ns.tprint("─".repeat(50));
}