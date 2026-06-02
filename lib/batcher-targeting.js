// Part of the engine-v2 system — lib/batcher-targeting.js: target selection with hysteresis

import { getServers } from "lib/scout.js";

/**
 * Pick the hacking target with hysteresis to prevent per-tick thrashing.
 *
 * Priority: forced-target config > locked target (hysteresis) > top scored victim.
 * Only switches the lock when a new victim beats the current by `switchMargin`× or
 * the current target becomes unhackable (falls off the victims list).
 *
 * Returns { target, locked } — caller owns the lock across ticks.
 */
export function pickTarget(ns, config, lockedTarget) {
  const forced = (config.forcedTarget ?? "").trim();
  if (forced) {
    const match = getServers(ns, "all").find(s => s.name === forced);
    if (match) return { target: match, locked: match };
  }

  const victims = getServers(ns, "victims");
  if (!victims.length) return { target: null, locked: null };
  const top = victims[0];

  const locked = lockedTarget ? victims.find(v => v.name === lockedTarget.name) : null;

  if (!locked) {
    return { target: top, locked: top };
  }

  if (top.name !== locked.name && top.score > locked.score * config.switchMargin) {
    return { target: top, locked: top };
  }

  return { target: locked, locked };
}
