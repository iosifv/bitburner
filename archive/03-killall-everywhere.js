export async function main(ns) {
  const visited = new Set();

  function scan(s) {
    if (!s || visited.has(s)) return;
    visited.add(s);

    for (const n of ns.scan(s)) {
      scan(n);

      if (ns.hasRootAccess(n)) {
        ns.killall(n);
        ns.tprint(`Killed scripts on ${n}`);
      }
    }
  }

  scan("home");
  ns.tprint("DONE");
}