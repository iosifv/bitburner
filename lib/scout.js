import { logPropulsion, logTail, logTerminal } from "lib/logger.js";

const DATA_FILE   = "servers.json";
const BACKUP_FILE = "servers.backup.json";

// ── bitnodeReset ─────────────────────────────────────────────────────────────
export function bitnodeReset(ns) {
  ns.write(DATA_FILE, "[]", "w");
  logTail(ns, "SCOUT", "RESET", `${DATA_FILE} cleared — will re-scout on first tick`);
}

// ── reloadServers ────────────────────────────────────────────────────────────
export async function reloadServers(ns) {
  const spores = ns.ls("home", "spores");

  const PORT_OPENERS = [
    { file: "BruteSSH.exe",  fn: (h) => ns.brutessh(h)  },
    { file: "FTPCrack.exe",  fn: (h) => ns.ftpcrack(h)  },
    { file: "relaySMTP.exe", fn: (h) => ns.relaysmtp(h) },
    { file: "HTTPWorm.exe",  fn: (h) => ns.httpworm(h)  },
    { file: "SQLInject.exe", fn: (h) => ns.sqlinject(h) },
  ];

  const existing = ns.read(DATA_FILE);
  if (existing && existing !== "NULL PORT DATA") {
    await ns.write(BACKUP_FILE, existing, "w");
  }

  const visited      = new Set();
  const stack        = [{ host: "home", path: ["home"] }];
  const myLevel      = ns.getHackingLevel();
  const ownedServers = new Set(ns.cloud.getServerNames());
  const servers      = [];

  while (stack.length > 0) {
    const { host, path } = stack.pop();

    if (visited.has(host)) continue;
    visited.add(host);

    if (host !== "home") {
      if (!ns.hasRootAccess(host)) {
        for (const op of PORT_OPENERS) {
          if (ns.fileExists(op.file, "home")) {
            try { op.fn(host); } catch { /* ignore */ }
          }
        }
        try { ns.nuke(host); } catch { /* ignore */ }
      }

      if (!ns.hasRootAccess(host)) {
        logPropulsion(ns, "SCOUT", "WARN", `${host} — could not root, skipping`);
        continue;
      }

      await ns.scp(spores, host, "home");
    }

    const serverMaxRam   = ns.getServerMaxRam(host);
    const serverMaxMoney = ns.getServerMaxMoney(host);
    const serverReqLevel = ns.getServerRequiredHackingLevel(host);
    const hackChance     = ns.hackAnalyzeChance(host);
    const weakenTime     = ns.getWeakenTime(host);
    const raw            = ns.getServer(host);

    const hackable     = serverReqLevel <= myLevel;
    const zombie       = serverMaxRam >= 4;
    const victim       = serverMaxMoney > 0 && hackable;
    // Geometric mean of current and max money: a server at 25% fill scores 50% of its
    // max-money score, so depleted servers are deprioritised without being ignored entirely.
    const currentMoney = raw.moneyAvailable ?? 0;
    const score        = victim ? (Math.sqrt(currentMoney * serverMaxMoney) * hackChance) / weakenTime : 0;

    servers.push({
      name:   host,
      path,
      zombie,
      victim,
      owned:  host === "home" || ownedServers.has(host),
      score,

      serverMaxRam,
      serverMaxMoney,
      serverMoneyAvailable: ns.getServerMoneyAvailable(host),

      serverSecurity:    ns.getServerSecurityLevel(host),
      serverMinSecurity: ns.getServerMinSecurityLevel(host),

      serverReqLevel,
      hackTime:   ns.getHackTime(host),
      growTime:   ns.getGrowTime(host),
      weakenTime,
      hackChance,
      growRate:   ns.growthAnalyze(host, 2),

      backdoored: raw.backdoorInstalled,
      raw,
    });


    for (const neighbor of ns.scan(host)) {
      if (!visited.has(neighbor)) {
        stack.push({ host: neighbor, path: [...path, neighbor] });
      }
    }
  }

  await ns.write(DATA_FILE, JSON.stringify(servers, null, 2), "w");
  logTail(ns, "SCOUT", "DONE", `${servers.length} servers written to ${DATA_FILE}`);

  return servers;
}

// ── getServers ───────────────────────────────────────────────────────────────
export function getServers(ns, filter = "all") {
  const raw = ns.read(DATA_FILE);
  if (!raw || raw === "NULL PORT DATA") {
    logTerminal(ns, "SCOUT", "ERROR", `${DATA_FILE} not found — run reloadServers() first`);
    return [];
  }

  let servers;
  try {
    servers = JSON.parse(raw);
  } catch {
    logTerminal(ns, "SCOUT", "ERROR", `${DATA_FILE} is corrupt — run reloadServers() first`);
    return [];
  }

  switch (filter) {
    case "zombies":
      return servers.filter(s => s.zombie);

    case "victims":
      return servers
        .filter(s => s.victim)
        .sort((a, b) => b.score - a.score);

    case "all":
    default:
      return servers;
  }
}

// ── getServersDiff ───────────────────────────────────────────────────────────
export function getServersDiff(ns) {
  const rawNew    = ns.read(DATA_FILE);
  const rawBackup = ns.read(BACKUP_FILE);

  const empty = { added: [], removed: [], upgraded: [], newVictims: [], lostVictims: [] };

  if (!rawNew    || rawNew    === "NULL PORT DATA") return empty;
  if (!rawBackup || rawBackup === "NULL PORT DATA") return empty;

  let current, backup;
  try {
    current = JSON.parse(rawNew);
    backup  = JSON.parse(rawBackup);
  } catch {
    return empty;
  }

  const currentMap = Object.fromEntries(current.map(s => [s.name, s]));
  const backupMap  = Object.fromEntries(backup.map(s  => [s.name, s]));

  return {
    added:       current.filter(s => !backupMap[s.name]).map(s => s.name),
    removed:     backup.filter(s  => !currentMap[s.name]).map(s => s.name),
    upgraded:    current
                   .filter(s => backupMap[s.name] && s.serverMaxRam > backupMap[s.name].serverMaxRam)
                   .map(s => ({ name: s.name, old: backupMap[s.name].serverMaxRam, new: s.serverMaxRam })),
    newVictims:  current.filter(s =>  s.victim && backupMap[s.name] && !backupMap[s.name].victim).map(s => s.name),
    lostVictims: current.filter(s => !s.victim && backupMap[s.name] &&  backupMap[s.name].victim).map(s => s.name),
  };
}

// ── printDiff ────────────────────────────────────────────────────────────────
export function printDiff(ns) {
  const diff = getServersDiff(ns);

  const anyChanges = diff.added.length || diff.removed.length ||
                     diff.upgraded.length || diff.newVictims.length ||
                     diff.lostVictims.length;

  if (!anyChanges) return;

  if (diff.added.length)
    logPropulsion(ns, "SCOUT", "DIFF", `new servers:    ${diff.added.join(", ")}`);

  if (diff.removed.length)
    logPropulsion(ns, "SCOUT", "DIFF", `removed:        ${diff.removed.join(", ")}`);


  if (diff.newVictims.length)
    logPropulsion(ns, "SCOUT", "DIFF", `new victims:    ${diff.newVictims.join(", ")}`);

  if (diff.lostVictims.length)
    logPropulsion(ns, "SCOUT", "DIFF", `lost victims:   ${diff.lostVictims.join(", ")}`);
}

// ── Navigation ───────────────────────────────────────────────────────────────

/** Connects to a server hop-by-hop using its stored path. */
export function serverNavigateTo(ns, server) {
  for (const hop of server.path) ns.singularity.connect(hop);
}

/** Navigates to a server, installs a backdoor, then returns to home. */
export async function serverInstallBackdoor(ns, server) {
  serverNavigateTo(ns, server);
  await ns.singularity.installBackdoor();
  ns.singularity.connect("home");
}
