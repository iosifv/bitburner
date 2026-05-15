import { setConfig } from "lib/config.js";

let pendingEdit  = null;  // set by buttons, consumed by main loop
let pushCfg      = null;  // set by component, called by main loop to push fresh cfg
let notifySaved  = null;  // set by component, called by main loop after a write

function loadCfg(ns) {
  const raw = ns.read("config.json");
  return raw && raw !== "NULL PORT DATA" ? JSON.parse(raw) : {};
}

function groupByPrefix(cfg) {
  const groups = {};
  for (const [key, entry] of Object.entries(cfg)) {
    if (!entry) continue;
    const prefix = key.split("-")[0];
    (groups[prefix] ??= []).push([key, entry]);
  }
  return groups;
}

function ConfigApp({ initialCfg }) {
  const [cfg, setCfg]         = React.useState(initialCfg);
  const [savedKey, setSavedKey] = React.useState(null);

  pushCfg     = setCfg;
  notifySaved = (key) => {
    setSavedKey(key);
    setTimeout(() => setSavedKey(null), 1200);
  };

  const groups = groupByPrefix(cfg);

  const sections = Object.entries(groups).flatMap(([prefix, entries]) => [
    React.createElement("tr", { key: `__hdr-${prefix}` },
      React.createElement("td", {
        colSpan: 3,
        style: { color: "#666", fontSize: "0.75em", paddingTop: "10px", paddingBottom: "2px", textTransform: "uppercase", letterSpacing: "2px" },
      }, prefix),
    ),
    ...entries.map(([key, { type, value, label }]) => {
      let control;
      if (type === "boolean") {
        control = React.createElement("button", {
          onClick: () => { pendingEdit = { key, type: "boolean", newValue: !value }; },
          style: {
            background: value ? "#1a4d1a" : "#4d1a1a",
            color:      value ? "#4dff4d" : "#ff4d4d",
            border: "none", padding: "2px 14px", cursor: "pointer",
            borderRadius: "3px", fontWeight: "bold", minWidth: "56px", fontFamily: "monospace",
          },
        }, value ? "ON" : "OFF");
      } else {
        control = React.createElement("span", { style: { whiteSpace: "nowrap" } },
          React.createElement("button", {
            onClick: () => { pendingEdit = { key, type }; },
            style: { cursor: "pointer", background: "#8b8b8b",fontSize: "0.9em", padding: "1px 7px", opacity: 0.7 , minWidth: "52px", marginRight: "10px"},
          }, "✍️"),

          React.createElement("span", { style: { marginRight: "10px", color: "#e0e0e0" } }, String(value)),
        );
      }

      return React.createElement("tr", { key },
        React.createElement("td", { style: { paddingRight: "20px", color: "#aaa", paddingBottom: "3px" } }, label),
        React.createElement("td", { style: { paddingRight: "16px", color: "#555", fontSize: "0.75em", fontStyle: "italic" } }, type),
        React.createElement("td", { style: { paddingBottom: "3px" } }, control),
        React.createElement("td", { style: { paddingLeft: "10px", color: "#4dff4d", fontSize: "0.8em", opacity: savedKey === key ? 1 : 0, transition: "opacity 0.3s" } }, "✓"),
      );
    }),
  ]);

  return React.createElement("div", { style: { fontFamily: "monospace", padding: "6px 10px", fontSize: "0.75em" } },
    React.createElement("div", {
      style: { color: "#888", marginBottom: "4px", borderBottom: "1px solid #333", paddingBottom: "6px", fontSize: "0.85em" },
    }, "⚙  config.json — click to edit"),
    React.createElement("table", { style: { borderCollapse: "collapse" } },
      React.createElement("tbody", null, ...sections),
    ),
  );
}

export async function main(ns) {
  ns.disableLog("ALL");
  ns.ui.openTail();
  ns.ui.resizeTail(quonfigWidth, quonfigHeight);
  ns.ui.moveTail(ns.ui.windowSize()[0] - quonfigWidth - 1, quonfigTopPadding);

  const initialCfg = loadCfg(ns);
  ns.printRaw(React.createElement(ConfigApp, { initialCfg }));

  while (true) {
    await ns.sleep(50);

    if (!pendingEdit) continue;
    const { key, type, newValue } = pendingEdit;
    pendingEdit = null;

    if (type === "boolean") {
      setConfig(ns, key, newValue);
    } else {
      const result = await ns.prompt(loadCfg(ns)[key].label, { type: "text" });
      if (result !== "" && result !== null) {
        setConfig(ns, key, type === "number" ? Number(result) : result);
      }
    }

    pushCfg?.(loadCfg(ns));
    notifySaved?.(key);
  }
}

export const quonfigTopPadding = 20;
export const quonfigWidth      = 420;
export const quonfigHeight     = 1300;
