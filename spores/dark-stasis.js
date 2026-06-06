// Worker: applies a stasis link on its own host, then idles.
// Deployed by dark-tendril.js and the engine's ⚓ button onto target nodes.
// setStasisLink() acts on the script's CURRENT server — no node argument — costs ~12GB RAM.
// To unlink: the engine navigates home → darkweb → node via singularity.connect,
// kills this worker, then execs with args [false].
const DARKNET_ROAMING_PORT = 666;

export async function main(ns) {
  ns.disableLog("ALL");
  const node       = ns.getHostname();
  const shouldLink = ns.args[0] !== false;
  let result, error;
  try { result = await ns.dnet.setStasisLink(shouldLink); }
  catch (e) { error = e?.message ?? String(e); }

  ns.tryWritePort(DARKNET_ROAMING_PORT, JSON.stringify({
    node, stasisLinked: shouldLink && !error, stasisResult: result, stasisError: error, ts: Date.now(),
  }));

  if (!shouldLink) return; // unlink: one-shot, free the RAM

  // Link: stay alive so tendril re-exec hits preventDuplicates (free no-op).
  while (true) await ns.sleep(60_000);
}
