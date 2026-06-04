import { logPropulsion, logTail } from "lib/logger.js";

// ── combatScore ───────────────────────────────────────────────────────────────
export function combatScore(info) {
  return info.str + info.def + info.dex + info.agi;
}

// ── getMemberAvgStats ─────────────────────────────────────────────────────────
export function getMemberAvgStats(gang, name, includeCombat, includeHackCha) {
  const s = gang.getMemberInformation(name);
  const values = [];
  if (includeCombat)  values.push(s.str, s.def, s.dex, s.agi);
  if (includeHackCha) values.push(s.hack, s.cha);
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// ── getMemberAvgMultiplierStats ───────────────────────────────────────────────
export function getMemberAvgMultiplierStats(gang, name, includeCombat, includeHackCha) {
  const s = gang.getMemberInformation(name);
  const values = [];
  if (includeCombat)  values.push(s.str_asc_mult, s.def_asc_mult, s.dex_asc_mult, s.agi_asc_mult);
  if (includeHackCha) values.push(s.hack_asc_mult, s.cha_asc_mult);
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// ── getMemberAvgAscensionStats ────────────────────────────────────────────────
export function getMemberAvgAscensionStats(gang, name, includeCombat, includeHackCha) {
  const a = gang.getAscensionResult(name);
  if (!a) return 0;
  const values = [];
  if (includeCombat)  values.push(a.str, a.def, a.dex, a.agi);
  if (includeHackCha) values.push(a.hack, a.cha);
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// ── combat convenience wrappers ───────────────────────────────────────────────
export const getMemberAvgCombatStats          = (gang, name) => getMemberAvgStats(gang, name, true, false);
export const getMemberAvgMultiplierCombatStats = (gang, name) => getMemberAvgMultiplierStats(gang, name, true, false);
export const getMemberAvgAscensionCombatStats  = (gang, name) => getMemberAvgAscensionStats(gang, name, true, false);

// ── setTerritoryWarfare ───────────────────────────────────────────────────────
export function setTerritoryWarfare(ns, on) {
  if (ns.gang.getGangInformation().territoryWarfareEngaged !== on)
    ns.gang.setTerritoryWarfare(on);
}

// ── getClashWinChances ────────────────────────────────────────────────────────
export function getClashWinChances(ns) {
  const me   = ns.gang.getGangInformation().faction;
  const all  = ns.gang.getAllGangInformation();
  const out  = {};
  for (const g of Object.keys(all)) {
    if (g === me || all[g].territory <= 0) continue;
    out[g] = ns.gang.getChanceToWinClash(g);
  }
  return out;
}

// ── renameMembers ─────────────────────────────────────────────────────────────
export function renameMembers(ns, names) {
  ns.gang.getMemberNames().forEach((n, k) => {
    if (n !== names[k]) ns.gang.renameMember(n, names[k]);
  });
}

// ── recruit ───────────────────────────────────────────────────────────────────
export function recruit(ns, names, nameIndex, source = "GANG") {
  if (!ns.gang.canRecruitMember()) return nameIndex;
  const name = names[nameIndex % names.length];
  if (ns.gang.recruitMember(name)) {
    logPropulsion(ns, source, "RECRUIT", name);
    return nameIndex + 1;
  }
  return nameIndex;
}

// ── setTask ───────────────────────────────────────────────────────────────────
export function setTask(ns, info, task) {
  if (info.task === task) return;
  ns.gang.setMemberTask(info.name, task);
  const combat = info.str + info.def + info.dex + info.agi;
  logTail(ns, "GANG", "ASSIGN", `${info.name.padEnd(15)} ${`[${combat}]`.padEnd(8)} → ${task}`);
}

// ── getMaxRivalPower ──────────────────────────────────────────────────────────
// Returns the highest power value across all rival gangs (excluding our own).
// Because processTerritory() is a global tick, rival power changes on every
// territory tick regardless of our own member assignments — ideal for detecting
// the warfare cadence without a warm-up period.
export function getMaxRivalPower(ns) {
  const me  = ns.gang.getGangInformation().faction;
  const all = ns.gang.getAllGangInformation();
  let max = 0;
  for (const [g, info] of Object.entries(all)) {
    if (g === me) continue;
    if (info.power > max) max = info.power;
  }
  return max;
}

// ── WarfareTicker ─────────────────────────────────────────────────────────────
// Detects the global territory-tick period and phase by watching rival power.
// Feed it getMaxRivalPower() once per gang tick; after 2 observed changes it
// can predict whether the NEXT gang tick will be a warfare tick.
export class WarfareTicker {
  #tick            = -1;
  #prevPower       = null;
  #lastChangeTick  = -1;
  #gaps            = [];          // last ≤5 observed tick-gaps between power changes
  #period          = null;
  #lastTickWarfare = false;       // did the most recent observe() catch a change?

  // Call once per gang tick with the current max-rival-power reading.
  observe(rivalPower) {
    this.#tick++;
    this.#lastTickWarfare = false;

    if (this.#prevPower !== null && rivalPower !== this.#prevPower) {
      this.#lastTickWarfare = true;
      if (this.#lastChangeTick >= 0) {
        const gap = this.#tick - this.#lastChangeTick;
        this.#gaps.push(gap);
        if (this.#gaps.length > 5) this.#gaps.shift();
        this.#period = this.#mode();
      }
      this.#lastChangeTick = this.#tick;
    }
    this.#prevPower = rivalPower;
  }

  // Mode of recent observed gaps — the most-repeated gap is the true period.
  #mode() {
    const counts = {};
    let maxCount = 0, best = null;
    for (const g of this.#gaps) {
      counts[g] = (counts[g] ?? 0) + 1;
      if (counts[g] > maxCount) { maxCount = counts[g]; best = g; }
    }
    return best;
  }

  // True once at least 2 power changes have been observed (period known).
  get ready()              { return this.#period !== null && this.#lastChangeTick >= 0; }

  // True if the most recent observe() detected a rival-power change (warfare tick fired).
  get lastTickWasWarfare() { return this.#lastTickWarfare; }

  // Inferred territory-tick period in gang-ticks.
  get period()             { return this.#period; }

  // Gang-ticks remaining until the next warfare tick (1 means: next tick IS warfare).
  get countdown() {
    if (!this.ready) return null;
    const sinceLast = this.#tick - this.#lastChangeTick;
    return this.#period - (sinceLast % this.#period);
  }

  // True if the NEXT gang tick (upcoming nextUpdate()) will be a warfare tick.
  isNextTickWarfare() {
    if (!this.ready) return false;
    return (this.#tick + 1 - this.#lastChangeTick) % this.#period === 0;
  }
}
