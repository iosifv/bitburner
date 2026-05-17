/**
 * singularity-test.js
 *
 * Probes the Singularity API to see what's accessible.
 * Run this to check which ns.singularity.* calls work in the current BN.
 */

export async function main(ns) {
  ns.disableLog("ALL");

  ns.tprint("── Singularity API probe ──────────────────────────");

  // ── Crime ─────────────────────────────────────────────────────────────────
  try {
    const crimes = ["Shoplift","Rob Store","Mug","Larceny","Deal Drugs","Bond Forgery","Traffick Arms","Homicide","Grand Theft Auto","Kidnap","Assassination","Heist"];
    ns.tprint("crime chances:");
    for (const crime of crimes) {
      const ch = ns.singularity.getCrimeChance(crime);
      const stats = ns.singularity.getCrimeStats(crime);
      ns.tprint(`  ${crime.padEnd(20)} chance=${(ch*100).toFixed(1)}%  karma=${stats.karma}  money=$${ns.format.number(stats.money)}`);


      const weights = Object.entries(stats)
        .filter(([k, v]) => k.endsWith("_success_weight") && v > 0)
        .map(([k, v]) => `${k.replace("_success_weight", "")}=${v}`)
        .join("  ");
      ns.tprint(`  ${crime.padEnd(20)} ${weights}`);

      // const player = ns.getPlayer();
      // const hypothetical = {
      //   ...player,
      //   skills: { ...player.skills, strength: 500, defence: 500, agility: 500, agility: 500 },
      // };
      // const chance = ns.formulas.work.crimeSuccessChance(hypothetical, crime);

      // ns.tprint(`  chance with 500 str/agi: ${(chance*100).toFixed(1)}%`);

    }
  } catch (e) { ns.tprint(`crimes:           ERROR — ${e.message}`); }

  ns.tprint("── done ────────────────────────────────────────────");
}