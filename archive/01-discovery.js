/**
 * 01-discovery.js
 * Crawls the network, roots every reachable server, copies scripts,
 * and writes an information-rich servers.json for the dispatcher to consume.
 *
 * Run once (or re-run any time you want a fresh scan).
 * Safe to re-run — idempotent.
 */
export async function main(ns) {
  ns.disableLog("ALL");

  const VIRUS_SCRIPT     = "00-virus.js";
  const BRAINWORM_SCRIPT = "20-brainworm.js";
  const OUT_FILE         = "servers.json";

  // ── Port-opener executables ──────────────────────────────────────────────
  const PORT_OPENERS = [
    { file: "BruteSSH.exe",  fn: (h) => ns.brutessh(h)  },
    { file: "FTPCrack.exe",  fn: (h) => ns.ftpcrack(h)  },
    { file: "relaySMTP.exe", fn: (h) => ns.relaysmtp(h) },
    { file: "HTTPWorm.exe",  fn: (h) => ns.httpworm(h)  },
    { file: "SQLInject.exe", fn: (h) => ns.sqlinject(h) },
  ];

  // ── DFS traversal ────────────────────────────────────────────────────────
  const visited      = new Set();                          // Set because we need instant lookup
  const stack        = [{ host: "home", path: ["home"] }]; // array of objects because we need to scan each elem
  const myLevel      = ns.getHackingLevel();
  const ownedServers = new Set(ns.getPurchasedServers());
  const servers      = [];

  while (stack.length > 0) {
    const { host, path } = stack.pop();

    if (visited.has(host)) continue;
    visited.add(host);

    // ── Attempt: Open Ports + root (skip home, we already own it) ─────────
    if (host !== "home") {
      if (!ns.hasRootAccess(host)) {
        for (const op of PORT_OPENERS) {
          if (ns.fileExists(op.file, "home")) {
            try { op.fn(host); } catch { /* not enough level — ignore */ }
          }
        }
        try { ns.nuke(host); } catch { /* not enough open ports yet */ }
      }

      if (!ns.hasRootAccess(host)) {
        ns.tprint(`WARN  ${host} — could not root, skipping`);
        continue;
      }

      // ── Copy scripts ─────────────────────────────────────────────────
      await ns.scp(VIRUS_SCRIPT,     host, "home");
      await ns.scp(BRAINWORM_SCRIPT, host, "home");
    }

    // ── Gather all metadata (same for every server including home) ─────────
    const serverMaxRam   = ns.getServerMaxRam(host);
    const serverMaxMoney = ns.getServerMaxMoney(host);
    const serverReqLevel = ns.getServerRequiredHackingLevel(host);
    const raw            = ns.getServer(host);

    const hackable = serverReqLevel <= myLevel;
    const zombie   = serverMaxRam >= 4;
    const victim   = serverMaxMoney > 0 && hackable;

    servers.push({
      name:   host,
      path,
      zombie,
      victim,
      owned:  host === "home" || ownedServers.has(host),

      // Stats
      serverMaxRam,
      serverMaxMoney,
      serverMoneyAvailable: ns.getServerMoneyAvailable(host),

      // Security
      serverSecurity:    ns.getServerSecurityLevel(host),
      serverMinSecurity: ns.getServerMinSecurityLevel(host),

      // Hacking
      serverReqLevel,
      hackTime:   ns.getHackTime(host),
      growTime:   ns.getGrowTime(host),
      weakenTime: ns.getWeakenTime(host),
      hackChance: ns.hackAnalyzeChance(host),
      growRate:   ns.growthAnalyze(host, 2),

      backdoored: raw.backdoorInstalled,
      raw,
    });

    ns.tprint(`OK    ${host.padEnd(20)}  RAM: ${ `${serverMaxRam}GB`.padStart(8)}  $: ${ns.formatNumber(serverMaxMoney).padStart(10)}`);

    // ── Enqueue neighbors ──────────────────────────────────────────────────
    for (const neighbor of ns.scan(host)) {
      if (!visited.has(neighbor)) {
        stack.push({ host: neighbor, path: [...path, neighbor] });
      }
    }
  }

  await ns.write(OUT_FILE, JSON.stringify(servers, null, 2), "w");

  const zombies = servers.filter(s => s.zombie);
  const victims = servers.filter(s => s.victim);

  ns.tprint(`Discovery complete — ${servers.length} rooted servers`);
  ns.tprint(`Zombies: ${zombies.length} [${zombies.map(s => s.name).join(", ")}]`);
  ns.tprint(`Victims: ${victims.length} [${victims.map(s => s.name).join(", ")}]`);
  ns.tprint(`Total RAM: ${servers.reduce((sum, s) => sum + s.serverMaxRam, 0)} GB`);
  ns.tprint(`Saved to ${OUT_FILE}`);
}
