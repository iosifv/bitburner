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
