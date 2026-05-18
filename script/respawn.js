/**
 * 91-respawn.js
 *
 * Quick access to early-game hack targets after respawning.
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

  // const PROGRAMS = [
  //   "BruteSSH.exe", "FTPCrack.exe", "relaySMTP.exe", "HTTPWorm.exe", "SQLInject.exe",
  //   "DarkscapeNavigator.exe"
  // ];

  // // ── Buy TOR + programs ───────────────────────────────────────────────────
  // ns.tprint("─".repeat(50));

  //  if (ns.singularity.purchaseTor()) {
  //   ns.tprint("TOR router ready");
  // } else {
  //   ns.tprint("Not enough money for TOR");
  // }

  // for (const prog of PROGRAMS) {
  //   if (!ns.singularity.purchaseProgram(prog)) {
  //     ns.tprint(`Failed to purchase ${prog}`);
  //   } else {
  //     ns.tprint(`Purchased ${prog}`);
  //   }
  // }
  // ns.tprint("─".repeat(50));
  
  // ── Hack targets ─────────────────────────────────────────────────────────
  const raw = ns.read("servers.json");
  const allServers = raw && raw !== "NULL PORT DATA" ? JSON.parse(raw) : [];
  const pathMap = Object.fromEntries(allServers.map(s => [s.name, s.path]));
  const myLevel = ns.getHackingLevel();

  for (const target of TARGETS) {
    const tag = target.padEnd(20);
    const path = pathMap[target];

    if (!path) {
      ns.tprintRaw(` →   ⚠️    ${target.padEnd(20)} - not found in servers.json`);
      continue;
    }

    const command = `connect ${path.join("; connect ")}; hack`;
    const targetInfo = allServers.find(s => s.name === target);
    const hackable = targetInfo?.serverReqLevel <= myLevel;

    if (!hackable) {
      ns.tprintRaw(` →   ⚠️    ${target.padEnd(20)} - requires hacking level ${targetInfo?.serverReqLevel || "N/A"}`);
      continue;
    }

    printButton(ns, ` → `, "▶ run", `  ${tag} - ${path.join(" → ")}`,() => fillTerminal(command));
    // ns.tprintRaw(`COMMAND   connect ${path.join("; connect ")}; hack`);
  }

  ns.tprintRaw("Darknet = Chongqing ─ Shadowed walkway");
  ns.tprintRaw("─".repeat(50));
}