export async function main(ns) {
  const hackScript = "farm.js";
  const zombieServer = ns.args[0];
  while (true) {
    // ----------------------------
    // 1. COLLECT WORKERS
    // ----------------------------
    const visited = new Set();
    const workers = [];

    function scan(s) {
      if (!s || visited.has(s)) return;
      visited.add(s);

      for (const n of ns.scan(s)) {
        scan(n);
        if (!ns.hasRootAccess(n)) continue;
        workers.push(n);
      }
    }

    scan(zombieServer);
    if (!workers.includes(zombieServer)) workers.push(zombieServer);

    // ----------------------------
    // 2. TARGETS (stable copy each loop)
    // ----------------------------
    const baseTargets = [
      "foodnstuff",
      "sigma-cosmetics",
      "joesguns",
      "harakiri-sushi",
      "hong-fang-tea",
      "neo-net",
      "max-hardware",
      "zer0"
    ];

    // rotate targets WITHOUT mutating original permanently
    const targets = [...baseTargets];

    const shiftCount = ns.getRunningScript()?.threads || 1;
    for (let i = 0; i < shiftCount % targets.length; i++) {
      const t = targets.shift();
      targets.push(t);
    }

    // ----------------------------
    // 3. BUILD ASSIGNMENT MAP
    // ----------------------------
    const assignments = [];
    let tIndex = 0;

    for (const w of workers) {
      const target = targets[tIndex % targets.length];
      tIndex++;

      if (w === target) continue;

      assignments.push({ worker: w, target });
    }

    // ----------------------------
    // 4. EXECUTE
    // ----------------------------
    ns.print("=== CLEAN DISPATCH ===");

    for (const a of assignments) {
      const freeRam =
        ns.getServerMaxRam(a.worker) - ns.getServerUsedRam(a.worker);

      const threads = Math.floor(freeRam / ns.getScriptRam(hackScript));

      if (threads <= 0) continue;

      ns.print(`${a.worker} → ${a.target} (${threads})`);

      ns.exec(hackScript, a.worker, threads, a.target);
    }

    ns.print("=== DONE ===");

    // ----------------------------
    // 5. LOOP DELAY
    // ----------------------------
    await ns.sleep(10000);
  }
}