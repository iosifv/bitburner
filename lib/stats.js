import { getServers } from "lib/scout.js";

const HACK_SCRIPT     = "spores/leech-hack.js";
const BRAINWORM_SCRIPT = "spores/brainworm.js";

function findBatcherTarget(ns, zombies) {
  for (const z of zombies) {
    for (const p of ns.ps(z.name)) {
      if (p.filename === HACK_SCRIPT && p.args[0]) return p.args[0];
    }
  }
  return null;
}

function telepathySharedRam(ns, zombies) {
  const wormRam = ns.getScriptRam(BRAINWORM_SCRIPT);
  if (!wormRam) return 0;
  let threads = 0;
  for (const z of zombies) {
    for (const p of ns.ps(z.name)) {
      if (p.filename === BRAINWORM_SCRIPT) threads += p.threads;
    }
  }
  return threads * wormRam;
}

// Empirical fit from controlled tests: shareBonus = 0.01735 * totalSharedGB^0.535
// Invert to estimate total shared RAM from share power, then subtract known telepathy share.
function darknetSharedRam(shareBonus, telepathyRam) {
  if (shareBonus <= 0) return 0;
  const totalGb = Math.pow(shareBonus / 0.01735, 1 / 0.535);
  return Math.max(0, totalGb - telepathyRam);
}

export function sampleStats(ns) {
  const ts      = Date.now();
  const zombies = getServers(ns, "zombies");
  const si      = ns.getMoneySources()?.sinceInstall ?? {};

  return {
    ts,
    incomeSourcesSnapshot: {
      hacking:        ns.getTotalScriptIncome()[0] ?? 0, // live rate — sinceInstall.hacking doesn't track scripts
      hacknet:        si.hacknet        ?? 0,
      crime:          si.crime          ?? 0,
      work:           si.work           ?? 0,
      codingcontract: si.codingcontract ?? 0,
      infiltration:   si.infiltration   ?? 0,
      stock:          si.stock          ?? 0,
      bladeburner:    si.bladeburner    ?? 0,
      corporation:    si.corporation    ?? 0,
      sleeves:        si.sleeves        ?? 0,
      other:          si.other          ?? 0,
      playerMoney:    ns.getPlayer().money,
    },
    target:           findBatcherTarget(ns, zombies),
    sharedRam:        telepathySharedRam(ns, zombies),
    darknetSharedRam: darknetSharedRam(ns.getSharePower() - 1, telepathySharedRam(ns, zombies)),
  };
}

/** Render a sparkline scaled to `ceiling` (defaults to window max if omitted). */
export function sparkline(values, ceiling) {
  if (!values.length) return "";
  const max  = ceiling ?? Math.max(...values);
  const BARS = " ▁▂▃▄▅▆▇█";
  return values.map(v => BARS[max > 0 ? Math.min(8, Math.round((v / max) * 8)) : 0]).join("");
}
