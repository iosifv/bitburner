// ── log ──────────────────────────────────────────────────────────────────────
export function log(ns, mode, source, action, message) {
  const line =
    `[${source}]`.padEnd(12) +
    action.padEnd(10) +
    message;

  switch (mode) {
    case "tprint": ns.tprint(line); break;
    case "print":  ns.print(line);  break;
    default:       ns.print(line);  break;
  }
}
