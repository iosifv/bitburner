export async function main(ns) {
  const [target, additionalMsec = 0] = ns.args;
  await ns.weaken(target, { additionalMsec });
  // ns.tryWritePort(101, JSON.stringify({ batchId: ns.args[2], opTag: "W", target, ts: Date.now() })); // JIT-ready
}
