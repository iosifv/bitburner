/**
 * share-worker.js
 * Minimal worker — just calls ns.share() in a loop.
 * Launched by share-dispatcher.js with one thread per available GB.
 */
export async function main(ns) {
  while (true) {
    await ns.share();
  }
}
