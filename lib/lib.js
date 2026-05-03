/**
 * lib.js
 * Shared library of utility functions.
 *
 * Usage in other scripts:
 *   import { log, reloadServers, getServers, getServersDiff, printDiff } from "lib.js";
 */

const DATA_FILE   = "servers.json";
const BACKUP_FILE = "servers.backup.json";

// ── log ──────────────────────────────────────────────────────────────────────
/**
 * Unified logging function for all scripts.
 *
 * @param {import("Bitburner").NS} ns
 * @param {"print"|"tprint"} mode   - where to print
 * @param {string} source           - who is logging (e.g. "LIB", "SCOUT", "OVERLORD")
 * @param {string} action           - what is happening (e.g. "BACKUP", "SPAWN", "WARN")
 * @param {string} message          - the detail message
 *
 * Output format:
 *   [SOURCE] ACTION  message
 *
 * Example:
 *   log(ns, "tprint", "SCOUT",   "BACKUP",  "servers.json → servers.backup.json")
 *   log(ns, "print",  "OVERLORD","SPAWN",   "botnet-1  threads: 8  pid: 412")
 *   log(ns, "tprint", "LIB",     "ERROR",   "servers.json not found")
 */
export function log(ns, mode, source, action, message) {
  const line =
    `[${source}]`.padEnd(12) +
    action.padEnd(10) +
    message;

  switch (mode) {
    case "tprint": ns.tprint(line); break;
    case "print":  ns.print(line);  break;
    default:       ns.print(line);  break;
  }
}

// ── reloadServers ────────────────────────────────────────────────────────────
/**
 * Crawls the network, roots every reachable server, copies scripts,
 * backs up the previous servers.json, and writes a fresh one.
 *
 * @param {import("Bitburner").NS} ns
 * @param {"print"|"tprint"} mode - logging mode
 * @returns {object[]} the freshly discovered server list
 */
export async function reloadServers(ns, mode = "print") {
  const VIRUS_SCRIPT     = "00-virus.js";
  const BRAINWORM_SCRIPT = "20-brainworm.js";

  const PORT_OPENERS = [
    { file: "BruteSSH.exe",  fn: (h) => ns.brutessh(h)  },
    { file: "FTPCrack.exe",  fn: (h) => ns.ftpcrack(h)  },
    { file: "relaySMTP.exe", fn: (h) => ns.relaysmtp(h) },
    { file: "HTTPWorm.exe",  fn: (h) => ns.httpworm(h)  },
    { file: "SQLInject.exe", fn: (h) => ns.sqlinject(h) },
  ];

  // ── Backup current servers.json before overwriting ───────────────────────
  const existing = ns.read(DATA_FILE);
  if (existing && existing !== "NULL PORT DATA") {
    await ns.write(BACKUP_FILE, existing, "w");
    log(ns, mode, "LIB", "BACKUP", `${DATA_FILE} → ${BACKUP_FILE}`);
  }

  // ── DFS traversal ─────────────────────────────────────────────────────────
  const visited      = new Set();
  const stack        = [{ host: "home", path: ["home"] }];
  const myLevel      = ns.getHackingLevel();
  const ownedServers = new Set(ns.getPurchasedServers());
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
        log(ns, mode, "LIB", "WARN", `${host} — could not root, skipping`);
        continue;
      }

      await ns.scp(VIRUS_SCRIPT,     host, "home");
      await ns.scp(BRAINWORM_SCRIPT, host, "home");
    }

    const serverMaxRam   = ns.getServerMaxRam(host);
    const serverMaxMoney = ns.getServerMaxMoney(host);
    const serverReqLevel = ns.getServerRequiredHackingLevel(host);
    const hackChance     = ns.hackAnalyzeChance(host);
    const weakenTime     = ns.getWeakenTime(host);
    const raw            = ns.getServer(host);

    const hackable = serverReqLevel <= myLevel;
    const zombie   = serverMaxRam >= 4;
    const victim   = serverMaxMoney > 0 && hackable;
    const score    = victim ? (serverMaxMoney * hackChance) / weakenTime : 0;

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

    log(ns, mode, "LIB", "SCAN", `${host.padEnd(20)} RAM: ${`${serverMaxRam}GB`.padStart(8)}  $: ${ns.formatNumber(serverMaxMoney).padStart(10)}`);

    for (const neighbor of ns.scan(host)) {
      if (!visited.has(neighbor)) {
        stack.push({ host: neighbor, path: [...path, neighbor] });
      }
    }
  }

  await ns.write(DATA_FILE, JSON.stringify(servers, null, 2), "w");
  log(ns, mode, "LIB", "DONE", `${servers.length} servers written to ${DATA_FILE}`);

  return servers;
}

// ── getServers ───────────────────────────────────────────────────────────────
/**
 * Reads servers.json and returns a filtered + sorted list.
 *
 * @param {import("Bitburner").NS} ns
 * @param {"all"|"zombies"|"victims"} filter
 * @returns {object[]}
 */
export function getServers(ns, filter = "all") {
  const raw = ns.read(DATA_FILE);
  if (!raw || raw === "NULL PORT DATA") {
    log(ns, "tprint", "LIB", "ERROR", `${DATA_FILE} not found — run reloadServers() first`);
    return [];
  }

  let servers;
  try {
    servers = JSON.parse(raw);
  } catch {
    log(ns, "tprint", "LIB", "ERROR", `${DATA_FILE} is corrupt — run reloadServers() first`);
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
/**
 * Compares servers.json with servers.backup.json and returns a diff object.
 *
 * @returns {{
 *   added:       string[],
 *   removed:     string[],
 *   upgraded:    { name: string, old: number, new: number }[],
 *   newVictims:  string[],
 *   lostVictims: string[],
 * }}
 */
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
/**
 * Pretty-prints the result of getServersDiff().
 *
 * @param {import("Bitburner").NS} ns
 * @param {"print"|"tprint"} mode
 */
export function printDiff(ns, mode = "print") {
  const diff = getServersDiff(ns);

  const anyChanges = diff.added.length || diff.removed.length ||
                     diff.upgraded.length || diff.newVictims.length ||
                     diff.lostVictims.length;

  if (!anyChanges) {
    log(ns, mode, "LIB", "DIFF", "no changes since last scan");
    return;
  }

  if (diff.added.length)
    log(ns, mode, "LIB", "DIFF", `new servers:    ${diff.added.join(", ")}`);

  if (diff.removed.length)
    log(ns, mode, "LIB", "DIFF", `removed:        ${diff.removed.join(", ")}`);

  for (const u of diff.upgraded)
    log(ns, mode, "LIB", "DIFF", `upgraded:       ${u.name.padEnd(20)} ${u.old}GB → ${u.new}GB`);

  if (diff.newVictims.length)
    log(ns, mode, "LIB", "DIFF", `new victims:    ${diff.newVictims.join(", ")}`);

  if (diff.lostVictims.length)
    log(ns, mode, "LIB", "DIFF", `lost victims:   ${diff.lostVictims.join(", ")}`);
}

// ── dispatch ─────────────────────────────────────────────────────────────────
/**
 * Distributes virus workers across all zombie servers targeting the best victim.
 *  - If workers are on the wrong target: kill and respawn
 *  - If workers are on the right target: top up with any free RAM
 *  - If no workers yet: spawn fresh
 *
 * @param {import("Bitburner").NS} ns
 * @param {"print"|"tprint"} mode
 */
export async function dispatch(ns, mode = "print") {
  const VIRUS_SCRIPT = "00-virus.js";
  const HOME_RAM     = 10;

  const zombies = getServers(ns, "zombies");
  const victims  = getServers(ns, "victims"); // already sorted by score

  if (zombies.length === 0) { log(ns, "tprint", "OVERLORD", "ERROR", "no zombie servers found"); return; }
  if (victims.length === 0) { log(ns, "tprint", "OVERLORD", "ERROR", "no victim servers found"); return; }

  const best = victims[0];
  log(ns, "tprint", "OVERLORD", "TARGET", `${best.name.padEnd(25)} score: ${best.score.toFixed(2).padStart(10)}`);

  const scriptRam = ns.getScriptRam(VIRUS_SCRIPT, "home");
  if (!scriptRam || scriptRam <= 0) {
    log(ns, "tprint", "OVERLORD", "ERROR", `cannot read RAM cost for ${VIRUS_SCRIPT}`);
    return;
  }

  let totalProcs   = 0;
  let totalThreads = 0;

  for (const z of zombies) {
    const server = z.name;

    await ns.scp(VIRUS_SCRIPT, server, "home");

    const running        = ns.ps(server).filter(p => p.filename === VIRUS_SCRIPT);
    const currentThreads = running.reduce((sum, p) => sum + p.threads, 0);
    const alreadyCorrect = running.some(p => p.args[0] === best.name);

    const reserve  = server === "home" ? HOME_RAM : 0;
    const freeRam  = ns.getServerMaxRam(server) - ns.getServerUsedRam(server) - reserve;
    const extraThreads = Math.floor(freeRam / scriptRam);

    // ── Wrong target — kill everything and respawn fresh ──────────────────
    if (!alreadyCorrect && running.length > 0) {
      for (const proc of running) ns.kill(proc.pid);
      log(ns, "tprint", "OVERLORD", "KILL", `${server.padEnd(25)} killed ${String(running.length).padStart(2)} worker(s)  (wrong target)`);
    }

    // ── No room for more threads — leave it ──────────────────────────────
    if (alreadyCorrect && extraThreads <= 0) {
      log(ns, mode, "OVERLORD", "OK", `${server.padEnd(25)} threads: ${String(currentThreads).padStart(4)}  (full)`);
      totalProcs++;
      totalThreads += currentThreads;
      continue;
    }

    // ── Spawn — either fresh or topping up free RAM ───────────────────────
    const threads = alreadyCorrect ? extraThreads : Math.floor(freeRam / scriptRam);
    if (!Number.isFinite(threads) || threads <= 0) {
      log(ns, mode, "OVERLORD", "SKIP", `${server.padEnd(25)} freeRam: ${`${freeRam.toFixed(1)}GB`.padStart(8)} — not enough for 1 thread`);
      continue;
    }

    const reason = alreadyCorrect ? "top-up" : "fresh";
    const pid    = ns.exec(VIRUS_SCRIPT, server, threads, best.name);
    if (pid === 0) {
      log(ns, "tprint", "OVERLORD", "WARN", `${server.padEnd(25)} exec() failed  threads: ${String(threads).padStart(4)}`);
    } else {
      log(ns, mode, "OVERLORD", "SPAWN", `${server.padEnd(25)} threads: ${String(threads).padStart(4)}  pid: ${String(pid).padStart(5)}  (${reason})`);
      totalProcs++;
      totalThreads += currentThreads + threads;
    }
  }

  log(ns, "tprint", "OVERLORD", "TOTAL", `procs: ${String(totalProcs).padStart(4)}  threads: ${String(totalThreads).padStart(5)}`);
}