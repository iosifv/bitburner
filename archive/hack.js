export async function main(ns) {
  const target = ns.args[0];

  if (!target) {
    ns.tprint("NO TARGET PASSED");
    return;
  }

  const moneyBefore = ns.getServerMoneyAvailable(target);
  const sec = ns.getServerSecurityLevel(target);

  ns.tprint(`--- HACK DEBUG ---`);
  ns.tprint(`Target: ${target}`);
  ns.tprint(`Money before: ${moneyBefore}`);
  ns.tprint(`Security: ${sec}`);

  // If server is empty, don't even try
  if (moneyBefore <= 0) {
    ns.tprint("SKIP: no money available");
    return;
  }

  const result = await ns.hack(target);

  ns.tprint(`HACK RESULT: $${result}`);
  ns.tprint(`Money after: ${ns.getServerMoneyAvailable(target)}`);
}