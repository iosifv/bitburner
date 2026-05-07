// ── fillTerminal ──────────────────────────────────────────────────────────────
export function fillTerminal(cmd) {
  const input = document.getElementById("terminal-input");
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(input, cmd);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.focus();
}

// ── createButton ──────────────────────────────────────────────────────────────
export function createButton(label, onClick) {
  return React.createElement("button", {
    onClick,
    style: { cursor: "pointer", fontSize: "0.8em", padding: "1px 6px", marginLeft: "6px" },
  }, label);
}

// ── printButton ───────────────────────────────────────────────────────────────
export function printButton(ns, textBefore, btnLabel, textAfter, onClick) {
  ns.tprintRaw(React.createElement("span", null, textBefore,  createButton(btnLabel, onClick), textAfter));
}
