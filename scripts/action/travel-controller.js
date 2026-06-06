// travel-controller.js — fills home RAM with travel-worker threads and shows a live dashboard.
// Stats are derived from intelligence exp change, avoiding any port overflow issues.
// Requires Singularity (SF4).

const WORKER      = "scripts/action/travel-worker.js";
const TRAVEL_COST = 200_000;
const CITIES      = ["Sector-12", "Aevum", "Volhaven", "Chongqing", "New Tokyo", "Ishima"];

// Speed is computed over a rolling window of exp samples taken every SAMPLE_INTERVAL ms.
const SAMPLE_INTERVAL_MS = 200;
const SPEED_WINDOW_MS    = 6_000;

export async function main(ns) {
  ns.disableLog("ALL");
  ns.ui.openTail();
  try { ns.ui.setTailTitle("✈ Travel Controller"); } catch {}
  try { ns.ui.resizeTail(400, 290);                } catch {}

  const e = React.createElement;

  // ── Calibrate exp per travel ───────────────────────────────────────────────
  // Do one travel before workers start so we know how much exp each trip grants.
  const calibratCity  = CITIES.find(c => c !== ns.getPlayer().city);
  const expBefore     = ns.getPlayer().exp.intelligence;
  ns.singularity.travelToCity(calibratCity);
  const expPerTravel  = ns.getPlayer().exp.intelligence - expBefore;
  const startExp      = ns.getPlayer().exp.intelligence;

  // ── Spawn workers ──────────────────────────────────────────────────────────
  const workerRam = ns.getScriptRam(WORKER, "home");
  const freeRam   = ns.getServerMaxRam("home") - ns.getServerUsedRam("home");
  const threads   = Math.max(1, Math.floor(freeRam / workerRam));
  const pid       = ns.exec(WORKER, "home", threads);

  ns.atExit(() => { if (pid > 0) ns.kill(pid); });

  if (pid === 0) {
    ns.tprint("ERROR  Could not spawn workers — not enough free RAM.");
    return;
  }

  // ── Speed tracking ─────────────────────────────────────────────────────────
  // Sample intelligence exp periodically; speed = Δexp / expPerTravel / Δsec.
  const expSamples  = []; // { ts, exp }
  let lastSampleTs  = 0;

  function recordSample() {
    const now = Date.now();
    if (now - lastSampleTs < SAMPLE_INTERVAL_MS) return;
    expSamples.push({ ts: now, exp: ns.getPlayer().exp.intelligence });
    while (expSamples.length > 1 && now - expSamples[0].ts > SPEED_WINDOW_MS) expSamples.shift();
    lastSampleTs = now;
  }

  function locationsPerSecond() {
    if (expSamples.length < 2 || expPerTravel <= 0) return null;
    const oldest  = expSamples[0];
    const newest  = expSamples.at(-1);
    const deltaMs = newest.ts - oldest.ts;
    if (deltaMs === 0) return null;
    return ((newest.exp - oldest.exp) / expPerTravel) / (deltaMs / 1000);
  }

  // ── Dashboard ──────────────────────────────────────────────────────────────
  function draw() {
    const player           = ns.getPlayer();
    const intel            = player.skills.intelligence;
    const exp              = player.exp.intelligence;
    const gained           = exp - startExp;
    const estimatedTravels = expPerTravel > 0 ? Math.round(gained / expPerTravel) : 0;
    const spent            = estimatedTravels * TRAVEL_COST;
    const lps              = locationsPerSecond();

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
        "✈  Travel Controller",
      ),
      row("threads",         String(threads),                                              "#4ade80"),
      row("travels",         String(estimatedTravels),                                     "#4ade80"),
      row("speed",           lps != null ? `${lps.toFixed(2)} / sec` : "…",              "#facc15"),
      row("money spent",     ns.format.number(spent),                                     "#f87171"),
      row("intelligence",    String(intel),                                                "#c084fc"),
      row("int exp",         Math.floor(exp).toLocaleString(),                             "#a78bfa"),
      row("int exp gained",  gained > 0 ? `+${Math.floor(gained).toLocaleString()}` : "—", "#7dd3fc"),
      row("int exp/travel",  expPerTravel > 0 ? expPerTravel.toFixed(4) : "?",           "#38bdf8"),
    ));
  }

  while (true) {
    recordSample();
    draw();
    await ns.sleep(50);
  }
}
