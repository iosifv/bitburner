export const LOG_PORT        = 100;
export const BATCH_DONE_PORT = 101; // reserved for JIT batcher completion signals


// ── log ──────────────────────────────────────────────────────────────────────
export function log(ns, mode, source, action, message) {
  const line =
    `[${source}]`.padEnd(12) +
    action.padEnd(10) +
    message;

  switch (mode) {
    case "silent": break;
    case "port": {
      const ok = ns.tryWritePort(LOG_PORT, JSON.stringify({ ts: Date.now(), source, action, message }));
      if (!ok) ns.print(line);
      break;
    }
    case "tprint": ns.tprint(line); break;
    case "print":  ns.print(line);  break;
    default:       ns.print(line);  break;
  }
}

/** Send to LOG_PORT — appears in the propulsion engine window. */
export function logPropulsion(ns, source, action, message) {
  log(ns, "port", source, action, message);
}

/** Send to LOG_PORT as source DEBUG — for generic debug output in the propulsion engine window. */
export function logDebug(ns, action, message) {
  log(ns, "port", "DEBUG", action, message);
}

/** Print to the calling script's own tail window. */
export function logTail(ns, source, action, message) {
  log(ns, "print", source, action, message);
}

/** Print to the terminal. */
export function logTerminal(ns, source, action, message) {
  log(ns, "tprint", source, action, message);
}
