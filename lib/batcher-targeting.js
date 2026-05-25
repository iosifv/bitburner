// Part of the engine-v2 system — lib/batcher-targeting.js: target selection with hysteresis

import { getServers } from "lib/scout.js";

const STATE_FILE = "batcher.json";

function readState(ns) {
  const raw = ns.read(STATE_FILE);
  if (!raw || raw === "NULL PORT DATA") return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function writeState(ns, name) {
  await ns.write(STATE_FILE, JSON.stringify({ target: name, lockedAt: Date.now() }), "w");
}

/**
 * Pick the hacking target with hysteresis to prevent per-tick thrashing.
 *
 * Priority: forced-target config > locked target (hysteresis) > top scored victim.
 * Only switches the lock when a new victim beats the current by `switchMargin`× or
 * the current target becomes unhackable (falls off the victims list).
 */
export async function pickTarget(ns, config) {
  const forced = (config.forcedTarget ?? "").trim();
  if (forced) {
    const match = getServers(ns, "all").find(s => s.name === forced);
    if (match) return match;
  }

  const victims = getServers(ns, "victims");
  if (!victims.length) return null;
  const top = victims[0];

  const state  = readState(ns);
  const locked = state ? victims.find(v => v.name === state.target) : null;

  if (!locked) {
    // No valid lock — lock onto the top victim
    await writeState(ns, top.name);
    return top;
  }

  // Switch only when the new best is significantly better (hysteresis prevents thrash)
  if (top.name !== locked.name && top.score > locked.score * config.switchMargin) {
    await writeState(ns, top.name);
    return top;
  }

  return locked;
}
