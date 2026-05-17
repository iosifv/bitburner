/**
 * singularity-test.js
 *
 * Probes the Singularity API to see what's accessible.
 * Run this to check which ns.singularity.* calls work in the current BN.
 */

export async function main(ns) {
  ns.disableLog("ALL");
  const s = ns.singularity;

  ns.tprint("── Singularity API probe ──────────────────────────");

  // ── Identity / stats ────────────────────────────────────────────────────
  try {
    const karma = ns.heart.break();
    ns.tprint(`karma:            ${karma}`);
  } catch (e) { ns.tprint(`karma:            ERROR — ${e.message}`); }

  // ── Current work ─────────────────────────────────────────────────────────
  try {
    const work = s.getCurrentWork();
    ns.tprint(`currentWork:      ${work ? JSON.stringify(work) : "idle"}`);
  } catch (e) { ns.tprint(`currentWork:      ERROR — ${e.message}`); }

  // ── Factions ─────────────────────────────────────────────────────────────
  try {
    const joined   = s.getOwnedAugmentations(true);   // reuse as existence check
    const factions = s.checkFactionInvitations();
    ns.tprint(`faction invites:  ${factions.length ? factions.join(", ") : "none"}`);
  } catch (e) { ns.tprint(`faction invites:  ERROR — ${e.message}`); }

  try {
    const player = ns.getPlayer();
    ns.tprint(`joined factions:  ${player.factions.join(", ") || "none"}`);
  } catch (e) { ns.tprint(`joined factions:  ERROR — ${e.message}`); }

  // ── Augmentations ────────────────────────────────────────────────────────
  try {
    const owned = s.getOwnedAugmentations(false);
    ns.tprint(`owned augs:       ${owned.length} (${owned.join(", ")})`);
  } catch (e) { ns.tprint(`owned augs:       ERROR — ${e.message}`); }

  try {
    const pending = s.getOwnedAugmentations(true).filter(
      a => !s.getOwnedAugmentations(false).includes(a)
    );
    ns.tprint(`pending install:  ${pending.length ? pending.join(", ") : "none"}`);
  } catch (e) { ns.tprint(`pending install:  ERROR — ${e.message}`); }

  // ── Crime ─────────────────────────────────────────────────────────────────
  try {
    const crimes = ["Shoplift","Rob Store","Mug","Larceny","Deal Drugs","Bond Forgery","Traffick Arms","Homicide","Grand Theft Auto","Kidnap","Assassination","Heist"];
    ns.tprint("crime chances:");
    for (const crime of crimes) {
      const ch = s.getCrimeChance(crime);
      const stats = s.getCrimeStats(crime);
      ns.tprint(`  ${crime.padEnd(20)} chance=${(ch*100).toFixed(1)}%  karma=${stats.karma}  money=$${ns.format.number(stats.money)}`);
    }
  } catch (e) { ns.tprint(`crimes:           ERROR — ${e.message}`); }

  // ── Companies ─────────────────────────────────────────────────────────────
  try {
    const player = ns.getPlayer();
    ns.tprint("company reps:");
    for (const [co, data] of Object.entries(player.jobs ?? {})) {
      const rep = s.getCompanyRep(co);
      ns.tprint(`  ${co.padEnd(25)} rep=${ns.format.number(rep)}  title=${data}`);
    }
  } catch (e) { ns.tprint(`companies:        ERROR — ${e.message}`); }

  // ── Travel / location ─────────────────────────────────────────────────────
  try {
    const loc = s.getCurrentServer();   // not in singularity but quick check
    ns.tprint(`server:           ${loc}`);
  } catch (e) { ns.tprint(`server (ns):      ${ns.getHostname()}`); }

  // ── TOR / programs ───────────────────────────────────────────────────────
  try {
    const programs = ["BruteSSH.exe","FTPCrack.exe","relaySMTP.exe","HTTPWorm.exe","SQLInject.exe","ServerProfiler.exe","DeepscanV1.exe","DeepscanV2.exe","AutoLink.exe","Formulas.exe"];
    ns.tprint("programs owned:");
    for (const prog of programs) {
      const has = ns.fileExists(prog, "home");
      if (has) ns.tprint(`  ✓ ${prog}`);
    }
  } catch (e) { ns.tprint(`programs:         ERROR — ${e.message}`); }

  ns.tprint("── done ────────────────────────────────────────────");
}