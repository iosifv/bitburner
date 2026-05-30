/**
 * singularity-favor.js
 *
 * Calculates favor gain for Daedalus after next reset.
 *
 * Usage: run singularity-favor.js
 */

const FACTION = "Daedalus";

const THRESHOLDS = [
  {  favor: 75,  label: "donate to faction (rep boost)" },
  { favor: 150,  label: "The Red Pill (endgame aug)"    },
];

export async function main(ns) {
  const rep        = ns.singularity.getFactionRep(FACTION);
  const favorNow   = ns.singularity.getFactionFavor(FACTION);
  const prevRep    = favorToRep(favorNow);           // implied rep from all previous resets
  const favorAfter = repToFavor(prevRep + rep);      // apply formula to total rep ever earned
  const favorGained = favorAfter - favorNow;

  ns.tprint("─".repeat(50));
  ns.tprint(`Faction:       ${FACTION}`);
  ns.tprint(`Reputation:    ${ns.format.number(rep)}`);
  ns.tprint(`Favor now:     ${favorNow}`);
  ns.tprint(`Favor gained:  +${favorGained}`);
  ns.tprint(`Favor after:   ${favorAfter}`);
  ns.tprint("─".repeat(50));

  for (const { favor, label } of THRESHOLDS) {
    if (favorAfter >= favor) {
      ns.tprint(`✓ ${favor} — ${label}`);
    } else {
      const totalRepNeeded = favorToRep(favor);
      const repShort = Math.max(0, totalRepNeeded - prevRep - rep);
      ns.tprint(`· ${favor} — ${label}  (need ${ns.format.number(repShort)} more rep this run)`);
    }
  }

  ns.tprint("─".repeat(50));
}

function repToFavor(rep) {
  return Math.log(rep / 25000 + 1) / Math.log(1.02);
}

function favorToRep(favor) {
  return Math.round(25000 * (Math.pow(1.02, favor) - 1));
}
