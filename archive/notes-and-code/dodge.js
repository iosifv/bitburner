// The dodge function implementation
async function dodge(ns, ...args) {
  const pid = ns.run("dodge.js", { threads: 1, temporary: true }, ...args);
  if (pid === 0) {
    throw `Failed to dodge cost for ${JSON.stringify(args)}`;
  }
  await ns.nextPortWrite(pid * 2);
  return ns.readPort(pid * 2);
}

// The dodge.js script
export async function main(ns) {
  const new_ram = ns.getFunctionRamCost("baseCost") + ns.getFunctionRamCost(ns.args[0]);
  if (Math.round(ns.ramOverride(new_ram)*100) != Math.round(new_ram*100)) {
    throw "Failed to call ramOverride";
  }
  ns.disableLog("ALL");
  ns.writePort(
    ns.pid * 2,
    await eval(`ns.${ns.args[0]}`)(...ns.args.slice(1)),
  );
}