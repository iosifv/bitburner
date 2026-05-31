/**
 * singularity-infiltration.js
 *
 * Formula (src/Infiltration/formulas/game.ts — bitburner-src PR #2257):
 *   playerDiff = clamp(secLevel - (str+def+dex+agi+cha)^0.9 / 250 - int / 1600,  0, 3.5)
 *
 * getInfiltration().difficulty returns startingSecurityLevel (raw, 0-3.5).
 * The UI shows it as secLevel * 100/3.5 — it is STATIC (player-independent).
 * "Now" is the player-adjusted mini-game difficulty for your current stats.
 * "Need" is combined (str+def+dex+agi+cha) to bring playerDiff to TARGET_DIFF.
 */

const TARGET_DIFF = 1.4; // 40/100 on UI — "Normal" tier
const MAX_DIFF    = 3.5;

function playerDiff(secLevel, combined, int) {
  return Math.max(0, Math.min(MAX_DIFF, secLevel - (combined ** 0.9) / 250 - int / 1600));
}

function statsNeededFor(secLevel, targetDiff, int) {
  const x = (secLevel - targetDiff - int / 1600) * 250;
  if (x <= 0) return 0; // intelligence alone is sufficient
  return Math.ceil(x ** (1 / 0.9));
}

export async function main(ns) {
  ns.disableLog("ALL");

  const player   = ns.getPlayer();
  const s        = player.skills;
  const combined = s.strength + s.defense + s.dexterity + s.agility + s.charisma;
  const int      = s.intelligence ?? 0;

  const rows = ns.infiltration.getPossibleLocations().flatMap(loc => {
    try {
      const data    = ns.infiltration.getInfiltration(loc.name);
      const secLvl  = data.difficulty; // raw startingSecurityLevel
      const base    = (secLvl / MAX_DIFF) * 100;
      const now     = (playerDiff(secLvl, combined, int) / MAX_DIFF) * 100;
      const need    = statsNeededFor(secLvl, TARGET_DIFF, int);
      return [{ name: loc.name, city: loc.city, base, now, need, ready: combined >= need, data }];
    } catch { return []; }
  }).sort((a, b) => a.base - b.base);

  const sep      = "  │  ";
  const D        = "─";
  const W        = { name: 26, city: 12, base: 5, now: 5, levels: 5, cash: 11, rep: 9, soa: 9, need: 8 };
  const targetUi = ((TARGET_DIFF / MAX_DIFF) * 100).toFixed(0);

  ns.tprintRaw("── Infiltration ─────────────────────────────────────────────────────────────────");
  ns.tprintRaw(`Stats: str:${s.strength}  def:${s.defense}  dex:${s.dexterity}  agi:${s.agility}  cha:${s.charisma}  int:${int}  combined:${combined}`);
  ns.tprintRaw(`Target: "Now" ≤ ${targetUi}/100  →  need = combined (str+def+dex+agi+cha) to reach that`);
  ns.tprintRaw("");

  ns.tprintRaw(
    `  ${"Location".padEnd(W.name)}  ${"City".padEnd(W.city)}` +
    sep + `${"Base".padStart(W.base)} ${"Now".padStart(W.now)}  ${"Lvls".padStart(W.levels)}` +
    sep + `${"Cash".padStart(W.cash)}  ${"Rep".padStart(W.rep)}  ${"SoA".padStart(W.soa)}` +
    sep + `${"Need".padStart(W.need)}`
  );
  ns.tprintRaw(
    `  ${D.repeat(W.name)}  ${D.repeat(W.city)}` +
    sep + `${D.repeat(W.base)} ${D.repeat(W.now)}  ${D.repeat(W.levels)}` +
    sep + `${D.repeat(W.cash)}  ${D.repeat(W.rep)}  ${D.repeat(W.soa)}` +
    sep + `${D.repeat(W.need)}`
  );

  for (const r of rows) {
    const marker = r.ready ? "✓" : "✗";
    const base   = `${r.base.toFixed(0)}`.padStart(W.base);
    const now    = `${r.now.toFixed(0)}`.padStart(W.now);
    const cash   = ("$" + ns.format.number(r.data.reward.sellCash)).padStart(W.cash);
    const rep    = ns.format.number(r.data.reward.tradeRep).padStart(W.rep);
    const soa    = ns.format.number(r.data.reward.SoARep ?? 0).padStart(W.soa);
    const need   = (r.need === 0 ? "int ok" : r.need.toString()).padStart(W.need);

    ns.tprintRaw(
      `${marker} ${r.name.padEnd(W.name)}  ${r.city.padEnd(W.city)}` +
      sep + `${base} ${now}  ${r.data.maxClearanceLevel.toString().padStart(W.levels)}` +
      sep + `${cash}  ${rep}  ${soa}` +
      sep + `${need}`
    );
  }

  ns.tprintRaw("── done ─────────────────────────────────────────────────────────────────────────");
}
