/**
 * singularity-test.js
 *
 * Probes the Singularity API to see what's accessible.
 * Run this to check which ns.singularity.* calls work in the current BN.
 */

function getSuccessWeights(stats) {
  return Object.entries(stats)
    .filter(([k]) => k.endsWith("_success_weight"))
    .map(([k, v]) => [k.replace("_success_weight", ""), v]);
}

function skillNeededFor100(ns, player, crime, skill) {
  let lo = player.skills[skill] ?? 1;
  let hi = 1_000_000;

  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);

    const upgradedPlayer = {
      ...player,
      skills: { ...player.skills, [skill]: mid },
    };
    const chance = ns.formulas.work.crimeSuccessChance(upgradedPlayer, crime);
    const gotTo100 = chance >= 1;

    if (gotTo100) hi = mid;
    else          lo = mid;
  }

  return hi;
}

const SKILLS    = ["hacking", "strength", "defense", "dexterity", "agility", "charisma"];
const SKILL_COL = { hacking: "hack", strength: "str", defense: "def", dexterity: "dex", agility: "agi", charisma: "cha"};

export async function main(ns) {
  ns.disableLog("ALL");

  ns.tprintRaw("── Crime success chances ───────────────────────────");

  try {
    const crimes = ["Shoplift","Rob Store","Mug","Larceny","Deal Drugs","Bond Forgery","Traffick Arms","Homicide","Grand Theft Auto","Kidnap","Assassination","Heist"];
    const player = ns.getPlayer();

    // Column widths — header and data must use the same W for each column
    const W = { money: 10, karma: 5, time: 6, moneyS: 10, karmaS: 7, chance: 7, eMoneyS: 10, eKarmaS: 7 };
    const sep = "  │  ";
    const D = "─";

    const skillHeader = SKILLS.map(s => SKILL_COL[s].padStart(7)).join("");
    ns.tprintRaw(
      ` ${"Crime".padEnd(20)}  ` +
      `${"Money".padEnd(W.money)}${"Karma".padEnd(W.karma)}${"Time".padEnd(W.time)}${"$/s".padEnd(W.moneyS)}${"k/s".padEnd(W.karmaS)}` +
      sep +
      `${"Chance".padStart(W.chance)}  ${"E$/s".padEnd(W.eMoneyS)}${"Ek/s".padEnd(W.eKarmaS)}` +
      sep +
      skillHeader
    );
    ns.tprintRaw(
      ` ${D.repeat(20)}  ` +
      `${D.repeat(W.money)}${D.repeat(W.karma)}${D.repeat(W.time)}${D.repeat(W.moneyS)}${D.repeat(W.karmaS)}` +
      sep +
      `${D.repeat(W.chance)}  ${D.repeat(W.eMoneyS)}${D.repeat(W.eKarmaS)}` +
      sep +
      D.repeat(SKILLS.length * 7 - 2)
    );

    for (const crime of crimes) {
      const ch    = ns.singularity.getCrimeChance(crime);
      const stats = ns.singularity.getCrimeStats(crime);

      const neededBySkill = Object.fromEntries(
        getSuccessWeights(stats)
          .map(([skill, weight]) => [skill, weight > 0 ? skillNeededFor100(ns, player, crime, skill) : 0])
      );

      const skillCols = SKILLS.map(s => String(neededBySkill[s] ?? 0).padStart(7)).join("");

      const timeSec        = stats.time / 1000;
      const moneyPerSec    = stats.money / timeSec;
      const expMoneyPerSec = moneyPerSec * ch;
      const karmaPerSec    = stats.karma / timeSec;
      const expKarmaPerSec = karmaPerSec * ch;

      const fmt = {
        money:   ("$" + ns.format.number(stats.money)).padEnd(W.money),
        karma:   String(stats.karma).padEnd(W.karma),
        time:    (timeSec + "\"").padEnd(W.time),
        moneyS:  ("$" + ns.format.number(moneyPerSec)).padEnd(W.moneyS),
        karmaS:  karmaPerSec.toFixed(3).padEnd(W.karmaS),
        chance:  ((ch * 100).toFixed(1) + "%").padStart(W.chance),
        eMoneyS: ("$" + ns.format.number(expMoneyPerSec)).padEnd(W.eMoneyS),
        eKarmaS: expKarmaPerSec.toFixed(3).padEnd(W.eKarmaS),
      };

      ns.tprintRaw(
        ` ${crime.padEnd(20)}  ` +
        `${fmt.money}${fmt.karma}${fmt.time}${fmt.moneyS}${fmt.karmaS}` +
        sep +
        `${fmt.chance}  ${fmt.eMoneyS}${fmt.eKarmaS}` +
        sep +
        skillCols
      );
    }
  } catch (e) { ns.tprint(`ERROR — ${e.message}`); }

  ns.tprintRaw("── done ────────────────────────────────────────────");
}