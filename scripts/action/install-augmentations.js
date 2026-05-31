export async function main(ns) {
  ns.killall("home");
  ns.tprint("KILL  all scripts on home");
  ns.singularity.installAugmentations("quonfig.js");
}
