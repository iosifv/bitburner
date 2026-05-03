export async function main(ns) {
  const visited = new Set();
  const added = new Set(); // 🔥 NEW: prevents duplicates
  const servers = [];

  function scan(server) {
    if (!server || visited.has(server)) return;

    visited.add(server);

    for (const n of ns.scan(server)) {
      scan(n);

      if (!n) continue;
      if (added.has(n)) continue; // 🔥 prevents duplicates

      const maxMoney = ns.getServerMaxMoney(n);
      if (maxMoney <= 0) continue;

      servers.push({
        name: n,
        rooted: ns.hasRootAccess(n),
        maxMoney,
        minSec: ns.getServerMinSecurityLevel(n),
        reqHack: ns.getServerRequiredHackingLevel(n),
        hackable: ns.getHackingLevel() >= ns.getServerRequiredHackingLevel(n)
      });

      added.add(n); // 🔥 mark as inserted
    }
  }

  scan("home");

  const valid = servers.filter(s =>
    s &&
    s.name &&
    s.hackable &&
    s.maxMoney > 0
  );

  function score(ns, s) {
    if (!s || !s.rooted) return 0;

    const maxMoney = s.maxMoney || 0;
    const sec = (s.minSec || 0) + 1;
    const req = (s.reqHack || 0) + 1;
    const time = ns.getHackTime(s.name || "home") || 1;

    return maxMoney / (sec * req * time);
  }

  valid.sort((a, b) => score(ns, b) - score(ns, a));

  ns.tprint("=== BEST TARGETS (DEDUPED) ===");
  ns.tprint("NAME              SCORE");

  for (const s of valid) {
    ns.tprint(
      (s.name || "unknown").padEnd(18) +
      score(ns, s).toFixed(2)
    );
  }

  return valid.map(s => s.name);
}