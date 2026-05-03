/** @param {NS} ns */
export async function scout(ns) {
  ns.disableLog("ALL");

  const COPY_SCRIPTS = ["00-virus.js", "20-brainworm.js"];
  const OUT_FILE     = "servers.json";

  // ── Port-opener executables ──────────────────────────────────────────────
  const PORT_OPENERS = [
    { file: "BruteSSH.exe", fn: (h) => ns.brutessh(h) },
    { file: "FTPCrack.exe", fn: (h) => ns.ftpcrack(h) },
    { file: "relaySMTP.exe", fn: (h) => ns.relaysmtp(h) },
    { file: "HTTPWorm.exe", fn: (h) => ns.httpworm(h) },
    { file: "SQLInject.exe", fn: (h) => ns.sqlinject(h) },
  ];

  // ── DFS traversal ────────────────────────────────────────────────────────
  const visited = new Set();                        // Set because we need instant lookup
  const stack = [{ host: "home", path: ["home"] }]; // array of objects because we need to scan each elem
  const myLevel = ns.getHackingLevel();
  const ownedServers = new Set(ns.getPurchasedServers());
  const servers = [];

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
        ns.print(`WARN  ${host} — could not root, skipping`);
        continue;
      }

      // ── Copy scripts ─────────────────────────────────────────────────
      for (script of COPY_SCRIPTS) {
        await ns.scp(script, host, "home");
      }
    }

    // ── Gather all metadata (same for every server including home) ─────────
    const serverMaxRam = ns.getServerMaxRam(host);
    const serverMaxMoney = ns.getServerMaxMoney(host);
    const serverReqLevel = ns.getServerRequiredHackingLevel(host);
    const hackChance = ns.hackAnalyzeChance(host);
    const weakenTime = ns.getWeakenTime(host);
    const raw = ns.getServer(host);

    const hackable = serverReqLevel <= myLevel;
    const zombie = serverMaxRam >= 4;
    const victim = serverMaxMoney > 0 && hackable;

    // Higher = better target. Balances money potential, hack success rate,
    // and time investment. Only meaningful for victims.
    const score = victim ? (serverMaxMoney * hackChance) / weakenTime : 0;

    servers.push({
      name: host,
      path,
      zombie,
      victim,
      owned: host === "home" || ownedServers.has(host),
      score,

      // Stats
      serverMaxRam,
      serverMaxMoney,
      serverMoneyAvailable: ns.getServerMoneyAvailable(host),

      // Security
      serverSecurity: ns.getServerSecurityLevel(host),
      serverMinSecurity: ns.getServerMinSecurityLevel(host),

      // Hacking
      serverReqLevel,
      hackTime: ns.getHackTime(host),
      growTime: ns.getGrowTime(host),
      weakenTime,
      hackChance,
      growRate: ns.growthAnalyze(host, 2),

      backdoored: raw.backdoorInstalled,
      raw,
    });

    ns.print(`OK    ${host.padEnd(20)}  RAM: ${`${serverMaxRam}GB`.padStart(8)}  $: ${ns.formatNumber(serverMaxMoney).padStart(10)}  score: ${score.toFixed(2).padStart(10)}`);

    // ── Enqueue neighbors ──────────────────────────────────────────────────
    for (const neighbor of ns.scan(host)) {
      if (!visited.has(neighbor)) {
        stack.push({ host: neighbor, path: [...path, neighbor] });
      }
    }
  }

  await ns.write(OUT_FILE, JSON.stringify(servers, null, 2), "w");

  const zombies = servers.filter(s => s.zombie);
  const victims = servers.filter(s => s.victim).sort((a, b) => b.score - a.score);

  ns.print(`Discovery complete — ${servers.length} rooted servers`);
  ns.print(`Zombies: ${zombies.length} [${zombies.map(s => s.name).join(", ")}]`);
  ns.print(`Victims by score: ${victims.map(s => `${s.name}(${s.score.toFixed(2)})`).join(", ")}`);
  ns.print(`Total RAM: ${servers.reduce((sum, s) => sum + s.serverMaxRam, 0)} GB`);
  ns.print(`Saved to ${OUT_FILE}`);

  return servers;
}