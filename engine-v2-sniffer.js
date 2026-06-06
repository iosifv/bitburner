// Part of the engine-v2 system — engine-v2-sniffer.js: live port traffic inspector
import { EngineStoke }  from "lib/engine-stoke.js";
import {
  DARKNET_BROADCAST_PORT, DARKNET_ROAMING_TAP_PORT, BATCHER_PORT,
  uiSnifferWidth, uiSnifferHeight, uiTopPadding,
} from "env.js";

const TAP_DISPLAY_LIMIT = 80;

// ── Port registry ─────────────────────────────────────────────────────────────
//
// kind "tap"      — port holds { ts, entries: string[] } — a peek-able rolling
//                   buffer published by the consumer of the real drain-queue.
//                   Port 667 is the tap for port-666 roaming traffic.
//
// kind "snapshot" — port holds a single self-replacing JSON blob;
//                   peek() always returns current state.
//
const PORTS = [
  { port: DARKNET_ROAMING_TAP_PORT, label: "666 roaming (tap)",  kind: "tap"      },
  { port: DARKNET_BROADCAST_PORT,   label: "1666 broadcast",     kind: "snapshot" },
  { port: BATCHER_PORT,             label: "102 batcher",        kind: "snapshot" },
];

// ── Styles ────────────────────────────────────────────────────────────────────
const S = {
  wrap:    { fontFamily: "monospace", fontSize: "0.82em", padding: "4px 8px" },
  input:   { background: "#111", color: "#ccc", border: "1px solid #444", outline: "none",
             padding: "3px 10px", fontFamily: "monospace", fontSize: "0.9em", width: "340px" },
  section: { color: "#36d9d9", borderBottom: "1px solid #2a2a2a", paddingBottom: "2px",
             marginTop: "10px", marginBottom: "3px", letterSpacing: "0.5px" },
  meta:    { color: "#555", paddingLeft: "8px", marginBottom: "2px" },
  row:     { whiteSpace: "pre", color: "#555", paddingLeft: "8px", lineHeight: "1.35" },
  hit:     { whiteSpace: "pre", color: "#fbbf24", paddingLeft: "8px", lineHeight: "1.35" },
  empty:   { color: "#333", fontStyle: "italic", paddingLeft: "8px" },
};

// ── Per-port section renderer ─────────────────────────────────────────────────

function portSection(label, kind, raw, query) {
  const q       = query.toLowerCase();
  const header  = React.createElement("div", { style: S.section }, `── ${label}`);

  if (!raw || raw === "NULL PORT DATA") {
    return [header, React.createElement("div", { style: S.empty }, "(empty)")];
  }

  try {
    if (kind === "tap") {
      const { ts, entries } = JSON.parse(raw);
      const ageMs   = Date.now() - (ts ?? 0);
      const matched = q ? entries.filter(e => e.toLowerCase().includes(q)) : entries;
      const shown   = matched.slice(0, TAP_DISPLAY_LIMIT);

      const meta = React.createElement("div", { style: S.meta },
        `${ageMs}ms ago  ·  ${entries.length} entries` +
        (q ? `  ·  ${matched.length} match${matched.length === 1 ? "" : "es"}` : "")
      );

      const rows = shown.map((entry, i) => {
        let parsed;
        try { parsed = JSON.parse(entry); } catch { parsed = entry; }
        const text    = typeof parsed === "string" ? parsed : JSON.stringify(parsed);
        const display = text.length > 200 ? text.slice(0, 197) + "…" : text;
        return React.createElement("div", { key: i, style: S.row }, display);
      });

      const more = matched.length > TAP_DISPLAY_LIMIT
        ? [React.createElement("div", { style: S.meta }, `… ${matched.length - TAP_DISPLAY_LIMIT} more`)]
        : [];

      return [header, meta, ...rows, ...more];
    } else {
      // Snapshot — pretty-print full JSON, highlight matching lines
      const text  = JSON.stringify(JSON.parse(raw), null, 2);
      if (q && !text.toLowerCase().includes(q)) {
        return [header, React.createElement("div", { style: S.empty }, `(no match for "${query}")`)];
      }
      const lines = text.split("\n").slice(0, 200);
      const rows  = lines.map((line, i) =>
        React.createElement("div", { key: i, style: q && line.toLowerCase().includes(q) ? S.hit : S.row }, line)
      );
      return [header, ...rows];
    }
  } catch {
    return [header, React.createElement("div", { style: S.empty }, `(parse error)  ${raw.slice(0, 100)}`)];
  }
}

// ── React component (rendered once; data injected via pushPortData) ────────────

let pushPortData = null;

function SnifferApp({ initialData }) {
  const [snapshots, setSnapshots] = React.useState(initialData);
  const [query,     setQuery]     = React.useState("");

  pushPortData = setSnapshots;

  return React.createElement("div", { style: S.wrap },
    React.createElement("input", {
      type:        "text",
      value:       query,
      onChange:    e => setQuery(e.target.value),
      placeholder: "filter…",
      style:       S.input,
    }),
    ...snapshots.flatMap(({ label, kind, raw }) => portSection(label, kind, raw, query)),
  );
}

// ── Engine ────────────────────────────────────────────────────────────────────

class SnifferEngine extends EngineStoke {
  constructor(ns) { super(ns, "sniffer"); }

  async tick() {
    pushPortData?.(PORTS.map(({ port, label, kind }) => ({
      label,
      kind,
      raw: this.ns.peek(port),
    })));
  }
}

// ── init ──────────────────────────────────────────────────────────────────────

export async function main(ns) {
  ns.disableLog("ALL");
  ns.ui.openTail();
  ns.ui.resizeTail(uiSnifferWidth, uiSnifferHeight);
  ns.ui.moveTail(10, uiTopPadding);
  ns.atExit(() => ns.ui.closeTail());

  // Render the React app once — subsequent ticks push data into it via React state,
  // never calling clearLog (which would destroy the live search input).
  ns.clearLog();
  ns.printRaw(React.createElement(SnifferApp, { initialData: [] }));

  const engine = new SnifferEngine(ns);
  while (true) {
    await engine.tick();
    await ns.sleep(engine.loopDelay);
  }
}
