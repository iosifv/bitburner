// travel-worker.js — spawned by travel-controller.js; one or more threads per exec.
// Minimal RAM footprint: only calls travelToCity + getPlayer.
const CITIES = ["Sector-12", "Aevum", "Volhaven", "Chongqing", "New Tokyo", "Ishima"];

export async function main(ns) {
  while (true) {
    const current = ns.getPlayer().city;
    const options = CITIES.filter(c => c !== current);
    ns.singularity.travelToCity(options[Math.floor(Math.random() * options.length)]);
    await ns.sleep(0);
  }
}
