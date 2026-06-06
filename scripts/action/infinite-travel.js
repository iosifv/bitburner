// scripts/action/infinite-travel.js — grind intelligence by randomly traveling between cities
// Requires Singularity (SF4). Each travel costs $200k and grants intelligence exp.

const CITIES      = ["Sector-12", "Aevum", "Volhaven", "Chongqing", "New Tokyo", "Ishima"];
const TRAVEL_COST = 200_000;
const SPEED_WINDOW = 120; // timestamps kept for speed calc — large window, negligible memory

export async function main(ns) {
  ns.disableLog("ALL");
  ns.ui.openTail();
  try { ns.ui.setTailTitle("✈ Infinite Travel"); } catch {}
  try { ns.ui.resizeTail(400, 250);               } catch {}

  const e = React.createElement;

  let travels       = 0;
  const startExp    = ns.getPlayer().exp.intelligence;
  const travelTimes = []; // ring buffer of successful travel timestamps

  function locationsPerSecond() {
    if (travelTimes.length < 2) return null;
    const elapsed = (travelTimes.at(-1) - travelTimes[0]) / 1000;
    return (travelTimes.length - 1) / elapsed;
  }

  function draw() {
    const player = ns.getPlayer();
    const intel  = player.skills.intelligence;
    const exp    = player.exp.intelligence;
    const gained = exp - startExp;
    const spent  = travels * TRAVEL_COST;
    const lps    = locationsPerSecond();

    const ROW = { display: "flex", justifyContent: "space-between", marginBottom: "3px" };
    const DIM = { color: "#555" };
    const row = (label, value, color = "#e2e8f0") =>
      e("div", { style: ROW },
        e("span", { style: DIM }, label),
        e("span", { style: { color, fontWeight: "bold" } }, value),
      );

    ns.clearLog();
    ns.printRaw(e("div", {
      style: { fontFamily: "monospace", fontSize: "15px", padding: "6px 8px", color: "#ccc", whiteSpace: "pre" },
    },
      e("div", { style: { color: "#36d9d9", fontWeight: "bold", fontSize: "16px", marginBottom: "8px" } },
        "✈  Infinite Travel",
      ),
      row("travels",        String(travels),                                        "#4ade80"),
      row("speed",          lps != null ? `${lps.toFixed(2)} / sec` : "…",          "#facc15"),
      row("money spent",    ns.format.number(spent),                                "#f87171"),
      row("intelligence",   String(intel),                                          "#c084fc"),
      row("int exp",        ns.format.number(exp),                                  "#a78bfa"),
      row("int exp gained", gained > 0 ? `+${ns.format.number(gained)}` : "—",      "#7dd3fc"),
      row("int exp/travel", travels > 0 ? ns.format.number(gained / travels) : "—", "#38bdf8"),
    ));
  }

  while (true) {
    const current     = ns.getPlayer().city;
    const options     = CITIES.filter(c => c !== current);
    const destination = options[Math.floor(Math.random() * options.length)];

    if (ns.singularity.travelToCity(destination)) {
      travels++;
      travelTimes.push(Date.now());
      if (travelTimes.length > SPEED_WINDOW) travelTimes.shift();
    }

    draw();
    await ns.sleep(50);
  }
}
