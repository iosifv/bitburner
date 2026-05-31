/**
 * script/world.js
 *
 * Interactive world map — all cities, companies, gyms, and universities.
 * Buttons let you travel, apply for jobs, start working, or begin training.
 * Shows best-fit job recommendation per company based on current player stats.
 *
 * Requires: Singularity augmentation (SF4)
 * Usage:    run script/world.js
 *
 * ns.* calls are queued and flushed from the main loop — Bitburner forbids
 * calling ns inside React event handlers.
 */

// ── World data (jobType resolved to actual enum values at runtime) ─────────────

const CITIES = ["Sector-12", "Aevum", "Volhaven", "Chongqing", "New Tokyo", "Ishima"];

const WORLD = {
  "Sector-12": {
    companies: [
      { name: "MegaCorp",             jobType: "corp"    },
      { name: "Blade Industries",     jobType: "corp"    },
      { name: "Four Sigma",           jobType: "corp"    },
      { name: "Icarus Microsystems",  jobType: "corp"    },
      { name: "Universal Energy",     jobType: "corp"    },
      { name: "Clarke Incorporated",  jobType: "corp"    },
      { name: "OmniTek Incorporated", jobType: "corp"    },
      { name: "NWO",                  jobType: "corp"    },
      { name: "Bachman & Associates", jobType: "corp"    },
    ],
    gyms:         ["Powerhouse Gym"],
    universities: [],
  },
  "Aevum": {
    companies: [
      { name: "ECorp",                jobType: "corp"    },
      { name: "AeroCorp",             jobType: "corp"    },
      { name: "Fulcrum Technologies", jobType: "corp"    },
      { name: "Galactic Cybersystems",jobType: "corp"    },
      { name: "Clarke Incorporated",  jobType: "corp"    },
      { name: "Bachman & Associates", jobType: "corp"    },
    ],
    gyms:         ["Snap Fitness Gym"],
    universities: ["Summit University"],
  },
  "Volhaven": {
    companies: [
      { name: "CompuTek",             jobType: "corp"    },
      { name: "HeliosLabs",           jobType: "corp"    },
      { name: "NWO",                  jobType: "corp"    },
      { name: "Omnia Cybersystems",   jobType: "corp"    },
      { name: "SysCore Securities",   jobType: "corp"    },
    ],
    gyms:         ["Millenium Fitness Gym"],
    universities: ["ZB Institute of Technology"],
  },
  "Chongqing": {
    companies: [
      { name: "KuaiGong International", jobType: "corp" },
      { name: "Solaris Space Systems",  jobType: "corp" },
      { name: "Infocomm",               jobType: "corp" },
    ],
    gyms:         [],
    universities: [],
  },
  "New Tokyo": {
    companies: [
      { name: "Global Pharmaceuticals", jobType: "corp"    },
      { name: "Noodle Bar",             jobType: "service" },
      { name: "VitaLife",               jobType: "corp"    },
      { name: "DefComm",                jobType: "corp"    },
    ],
    gyms:         [],
    universities: [],
  },
  "Ishima": {
    companies: [
      { name: "Storm Technologies",   jobType: "corp"  },
      { name: "NetLink Technologies", jobType: "corp"  },
      { name: "9-Tai Media Group",    jobType: "media" },
    ],
    gyms:         [],
    universities: [],
  },
};

const UNIVERSITY_COURSES = [
  "Study Computer Science", "Data Structures", "Networks",
  "Algorithms", "Management", "Leadership",
];
const GYM_STATS  = ["str", "def", "dex", "agi"];
const GYM_LABELS = { str: "STR", def: "DEF", dex: "DEX", agi: "AGI" };

// ── Job field resolution — uses ns.enums.JobField so it's always valid ────────

function buildJobSets(ns) {
  const all = Object.values(ns.enums?.JobField ?? {}).filter(v => typeof v === "string");

  // Categorise by stable substrings present in the enum value strings
  const isService  = v => v.includes("waiter") || (v.includes("employee") && !v.includes("part") === false || v.includes("employee"));
  const isTech     = v => ["software", "it", "engineer", "network", "research"].some(k => v.includes(k));
  const isBusiness = v => ["business", "management", "agent"].some(k => v.includes(k));
  const isCombat   = v => ["security", "field", "operations"].some(k => v.includes(k));

  const service = all.filter(v => v.includes("waiter") || v.includes("employee"));
  const media   = all.filter(v => isBusiness(v) || isCombat(v));
  const corp    = all; // everything is fair game at big corps

  return { corp, service, media, all };
}

// ── Best-fit job scorer ───────────────────────────────────────────────────────

function fieldScore(field, hack, cha, combat, dex, agi) {
  const f = field.toLowerCase();
  if (f.includes("software") && !f.includes("consultant")) return hack * 2.0;
  if (f === "it")                                           return hack * 1.6;
  if (f.includes("security") && f.includes("engineer"))    return hack * 1.4;
  if (f.includes("network"))                               return hack * 1.4;
  if (f === "engineer")                                    return hack * 1.5 + combat * 0.2;
  if (f.includes("research"))                              return hack * 1.5;
  if (f.includes("software") && f.includes("consultant"))  return hack * 1.0;
  if (f === "management")                                  return cha  * 2.0;
  if (f === "business" && !f.includes("consultant"))       return cha  * 1.8;
  if (f.includes("business") && f.includes("consultant"))  return cha  * 1.4;
  if (f === "agent")                                       return cha  * 1.0 + (dex + agi) * 0.4;
  if (f === "operations")                                  return combat * 1.6 + cha * 0.4;
  if (f === "security")                                    return combat * 1.5;
  if (f.includes("field"))                                 return combat * 1.8;
  return (hack + cha + combat) * 0.2; // waiter / employee fallback
}

function bestFitField(ns, availableFields) {
  const s      = ns.getPlayer().skills;
  const hack   = s.hacking;
  const cha    = s.charisma;
  const combat = s.strength + s.defense + s.dexterity + s.agility;
  return [...availableFields]
    .sort((a, b) => fieldScore(b, hack, cha, combat, s.dexterity, s.agility)
                  - fieldScore(a, hack, cha, combat, s.dexterity, s.agility))[0]
    ?? availableFields[0];
}

// ── React micro-helpers ───────────────────────────────────────────────────────

const React = globalThis.React;
const e     = React.createElement;

function btn(label, onClick, extraStyle = {}) {
  return e("button", {
    onClick,
    style: {
      marginLeft: "3px", padding: "1px 6px",
      fontSize: "10px", cursor: "pointer",
      borderRadius: "2px", border: "1px solid #444",
      ...extraStyle,
    },
  }, label);
}

function cell(content, style = {}) {
  return e("td", { style: { padding: "2px 8px", verticalAlign: "middle", ...style } }, content);
}

// ── Row builders ──────────────────────────────────────────────────────────────

function companyRow(ns, { name: company, jobType }, city, jobSets, enqueue) {
  const jobs = jobSets[jobType] ?? jobSets.corp;

  let rep = "?", favor = "?";
  try { rep   = ns.format.number(ns.singularity.getCompanyRep(company), 2); } catch {}
  try { favor = ns.singularity.getCompanyFavor(company).toFixed(0);         } catch {}

  let working = false;
  try {
    const w = ns.singularity.getCurrentWork();
    working = w?.type === "COMPANY" && w?.companyName === company;
  } catch {}

  const bestField = jobs.length ? bestFitField(ns, jobs) : "—";

  function doApply() {
    const ordered = [bestField, ...jobs.filter(f => f !== bestField)];
    for (const field of ordered) {
      if (ns.singularity.applyToCompany(company, field)) {
        ns.tprint(`SUCCESS ${company}: hired as "${field}"`);
        return;
      }
    }
    ns.tprint(`WARN   ${company}: no applicable position — stats too low?`);
  }

  return e("tr", { key: company, style: { borderBottom: "1px solid #1e1e1e" } },
    cell(company,          { color: "#7ec" }),
    cell("Company",        { color: "#666" }),
    cell(rep,              { color: "#fc8", whiteSpace: "nowrap" }),
    cell(`Favor ${favor}`, { color: "#68f", whiteSpace: "nowrap" }),
    cell(e("span", {},
      e("span", { style: { color: working ? "#4d4" : "#555" } }, working ? "▶ working  " : ""),
      e("span", { style: { color: "#aa8", fontSize: "10px" } }, `★ ${bestField}`),
    )),
    cell(e("span", {},
      btn("✈ Go", enqueue(() => {
        ns.singularity.travelToCity(city);
        ns.tprint(`INFO   Traveled to ${city}`);
      }), { background: "#172042" }),
      btn("Apply", enqueue(doApply), { background: "#172a17" }),
      btn("Work", enqueue(() => {
        ns.singularity.travelToCity(city);
        const ok = ns.singularity.workForCompany(company, false);
        ns.tprint(ok ? `INFO   Working at ${company}` : `WARN   Cannot work at ${company} — try Apply first`);
      }), { background: "#2a1717" }),
    )),
  );
}

function gymRow(ns, gym, city, enqueue) {
  return e("tr", { key: gym, style: { borderBottom: "1px solid #1e1e1e" } },
    cell(gym,   { color: "#fa8" }),
    cell("Gym", { color: "#666" }),
    cell("str / def / dex / agi", { color: "#888", colSpan: 2 }),
    cell("—",   { color: "#444" }),
    cell(e("span", {},
      btn("✈ Go", enqueue(() => ns.singularity.travelToCity(city)), { background: "#172042" }),
      ...GYM_STATS.map(stat =>
        btn(GYM_LABELS[stat], enqueue(() => {
          ns.singularity.travelToCity(city);
          ns.singularity.gymWorkout(gym, stat, false);
          ns.tprint(`INFO   Training ${stat.toUpperCase()} at ${gym}`);
        }), { background: "#1e2a10" })
      ),
    )),
  );
}

function universityRow(ns, uni, city, enqueue) {
  return e("tr", { key: uni, style: { borderBottom: "1px solid #1e1e1e" } },
    cell(uni,          { color: "#b8a" }),
    cell("University", { color: "#666" }),
    cell("hack + cha courses", { color: "#888", colSpan: 2 }),
    cell("—",          { color: "#444" }),
    cell(e("span", { style: { display: "flex", flexWrap: "wrap", gap: "2px" } },
      btn("✈ Go", enqueue(() => ns.singularity.travelToCity(city)), { background: "#172042" }),
      ...UNIVERSITY_COURSES.map(course =>
        btn(course, enqueue(() => {
          ns.singularity.travelToCity(city);
          ns.singularity.universityCourse(uni, course, false);
          ns.tprint(`INFO   Studying "${course}" at ${uni}`);
        }), { background: "#1a1030" })
      ),
    )),
  );
}

// ── City section ──────────────────────────────────────────────────────────────

function citySection(ns, city, jobSets, enqueue) {
  const data   = WORLD[city];
  const isHere = ns.getPlayer().city === city;

  const rows = [
    ...data.companies.map(c    => companyRow(ns, c, city, jobSets, enqueue)),
    ...data.gyms.map(g         => gymRow(ns, g, city, enqueue)),
    ...data.universities.map(u => universityRow(ns, u, city, enqueue)),
  ];

  return e("div", { key: city, style: { marginBottom: "10px" } },
    e("div", {
      style: {
        display: "flex", alignItems: "center", gap: "8px",
        background: "#111a28", padding: "4px 10px",
        borderRadius: "3px", marginBottom: "2px",
      },
    },
      e("span", {
        style: { fontWeight: "bold", fontSize: "12px", color: isHere ? "#4d4" : "#ccc" },
      }, (isHere ? "📍 " : "🌐 ") + city),
      btn("✈ Travel", enqueue(() => {
        const ok = ns.singularity.travelToCity(city);
        ns.tprint(ok ? `INFO   Traveled to ${city}` : `WARN   Travel failed — enough money?`);
      }), {
        background: isHere ? "#0d260d" : "#0d0d2a",
        fontWeight: "bold", fontSize: "11px",
      }),
    ),
    e("table", {
      style: { width: "100%", borderCollapse: "collapse", fontSize: "11px", background: "#080808" },
    },
      e("thead", {},
        e("tr", { style: { background: "#141414", color: "#555", fontSize: "10px" } },
          e("th", { style: { padding: "2px 8px", textAlign: "left" } }, "Name"),
          e("th", { style: { padding: "2px 8px", textAlign: "left" } }, "Type"),
          e("th", { style: { padding: "2px 8px", textAlign: "left" } }, "Rep"),
          e("th", { style: { padding: "2px 8px", textAlign: "left" } }, "Favor"),
          e("th", { style: { padding: "2px 8px", textAlign: "left" } }, "Status / Best Fit"),
          e("th", { style: { padding: "2px 8px", textAlign: "left" } }, "Actions"),
        ),
      ),
      e("tbody", {}, ...rows),
    ),
  );
}

// ── Player status bar ─────────────────────────────────────────────────────────

function statusBar(ns, enqueue) {
  const p = ns.getPlayer();
  let action = "idle";
  try {
    const w = ns.singularity.getCurrentWork();
    if (w) action = `${w.type}: ${w.companyName ?? w.factionName ?? w.className ?? ""}`;
  } catch {}

  return e("div", {
    style: {
      display: "flex", gap: "16px", alignItems: "center",
      background: "#0c0c1a", padding: "4px 10px",
      borderRadius: "3px", marginBottom: "10px", fontSize: "11px",
    },
  },
    e("span", { style: { color: "#888" } },
      `📍 ${p.city}  |  💰 ${ns.format.number(p.money, 2)}  |  ⚡ ${action}`),
    btn("Stop Action", enqueue(() => {
      ns.singularity.stopAction();
      ns.tprint("INFO   Action stopped");
    }), { background: "#2a1010" }),
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export async function main(ns) {
  ns.disableLog("ALL");
  ns.ui.openTail();
  try { ns.ui.setTailTitle("🌍 World Map"); } catch {}
  try { ns.ui.resizeTail(960, 680);         } catch {}

  const jobSets = buildJobSets(ns);
  const queue   = [];
  const enqueue = fn => () => queue.push(fn);

  function render() {
    ns.clearLog();
    ns.printRaw(
      e("div", { style: { fontFamily: "monospace", padding: "6px", color: "#ccc" } },
        e("div", {
          style: {
            display: "flex", alignItems: "center", gap: "12px",
            borderBottom: "1px solid #2a2a2a", paddingBottom: "6px", marginBottom: "8px",
          },
        },
          e("span", { style: { color: "#fff", fontWeight: "bold", fontSize: "13px" } }, "🌍 World Map"),
          btn("↺ Refresh", enqueue(() => {}), { background: "#222", fontSize: "11px" }),
          e("span", { style: { color: "#555", fontSize: "10px" } }, "★ = best job fit for your current stats"),
        ),
        statusBar(ns, enqueue),
        ...CITIES.map(city => citySection(ns, city, jobSets, enqueue)),
      )
    );
  }

  render();

  while (true) {
    if (queue.length > 0) {
      queue.shift()();
      render();
    }
    await ns.sleep(50);
  }
}
