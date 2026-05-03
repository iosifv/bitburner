export async function main(ns) {
  const target = ns.args[0];
  if (!target) return;

  const hackScript = "hack.js";
  const growScript = "grow.js";
  const weakenScript = "weaken.js";

  const hackTime = ns.getHackTime(target);
  const growTime = ns.getGrowTime(target);
  const weakenTime = ns.getWeakenTime(target);

  const delay = 50;

  ns.tprint(`Batching ${target}`);

  // -------------------------
  // HACK
  // -------------------------
  ns.exec(hackScript, "home", 10, target);
  await ns.sleep(growTime - hackTime - delay);

  // -------------------------
  // WEAKEN (after hack)
  // -------------------------
  ns.exec(weakenScript, "home", 10, target);
  await ns.sleep(hackTime - weakenTime - delay);

  // -------------------------
  // GROW
  // -------------------------
  ns.exec(growScript, "home", 10, target);
  await ns.sleep(weakenTime - growTime - delay);

  // -------------------------
  // FINAL WEAKEN
  // -------------------------
  ns.exec(weakenScript, "home", 10, target);
}