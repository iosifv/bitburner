export async function main(ns) {
  const visited = new Set();
  const servers = [];

  function scan(server) {
    for (const next of ns.scan(server)) {
      if (visited.has(next)) continue;

      visited.add(next);
      servers.push(next);

      scan(next);
    }
  }

  visited.add("home");
  scan("home");

  ns.tprint("=== Auto Rooting Started ===");

  for (const s of servers) {
    if (s === "home") continue;

    if (ns.hasRootAccess(s)) {
      ns.tprint(`[OK] Already rooted: ${s}`);
      continue;
    }

    let portsOpened = 0;

    // Step 1: BruteSSH
    if (ns.fileExists("BruteSSH.exe", "home")) {
      ns.brutessh(s);
      portsOpened++;
      ns.tprint(`[SSH]  Opened on ${s}`);
    }

    // Step 2: NUKE
    try {
      ns.nuke(s);
      ns.tprint(`[ROOT] Gained access: ${s}`);
    } catch (e) {
      ns.tprint(`[FAIL] Cannot nuke ${s} yet`);
    }
  }

  ns.tprint("=== Auto Rooting Finished ===");
}