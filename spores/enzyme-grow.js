export async function main(ns) {
  const [target, additionalMsec = 0] = ns.args;
  await ns.grow(target, { additionalMsec });
  // ns.tryWritePort(101, JSON.stringify({ batchId: ns.args[2], opTag: "G", target, ts: Date.now() })); // JIT-ready
}
