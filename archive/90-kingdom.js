/**
 * 90-kingdom.js
 * Displays a visual overview of the network from servers.json.
 * Run 01-scout.js first to generate the data.
 */
export async function main(ns) {

  // ── Load servers.json ────────────────────────────────────────────────────
  const raw = ns.read("servers.json");
  if (!raw || raw === "NULL PORT DATA") {
    ns.tprint("ERROR  servers.json not found — run 01-scout.js first");
    return;
  }

  const servers = JSON.parse(raw);
  const myLevel = ns.getHackingLevel();

  // Best victim by score — gets a ★ marker
  const victims = servers.filter(s => s.victim);
  const bestTarget = victims.sort((a, b) => b.score - a.score)[0]?.name;

  // ── Header ───────────────────────────────────────────────────────────────
  ns.tprint(
    `${"SERVER".padEnd(52)}` +
    `${"LVL".padStart(8)} | ` +
    `${"RAM".padStart(8)} | ` +
    `${"MAX $".padStart(10)} | ` +
    `${"AVAIL $".padStart(10)} | ` +
    `${"SEC".padStart(9)} | ` +
    `${"CHANCE".padStart(8)} | ` +
    `${"HACK".padStart(8)} | ` +
    `${"GROW".padStart(8)} | ` +
    `${"WEAKEN".padStart(8)} | ` +
    `${"SCORE".padStart(10)} | ` +
    `FLAGS`
  );
  ns.tprint("─".repeat(167));

  // ── Rows — DFS order preserved ───────────────────────────────────────────
  for (const s of servers) {
    const depth    = s.path.length - 1;
    const hackable = s.serverReqLevel <= myLevel;
    const isBest   = s.name === bestTarget;

    // Name column with tree indent + best target marker
    const prefix     = isBest ? "★ " : "  ";
    const indentName = prefix + (depth > 8 ? String(depth) : "") + "  ".repeat(depth) + "└─" + s.name;

    // Level column
    const st = (hackable ? "-" : String(s.serverReqLevel - myLevel)) + " " + (hackable ? "🍏" : "🍎");

    // RAM
    const ramStr = ns.formatRam(s.serverMaxRam);

    // Money
    const maxMoneyStr   = ns.formatNumber(s.serverMaxMoney, 2)      + "$";
    const availMoneyStr = ns.formatNumber(s.serverMoneyAvailable, 2) + "$";

    // Security: current / min
    const secStr = `${s.serverSecurity.toFixed(1)}/${s.serverMinSecurity.toFixed(1)}`;

    // Hack chance
    const chanceStr = `${(s.hackChance * 100).toFixed(1)}%`;

    // Timings — convert ms to seconds
    const hackTimeStr   = `${(s.hackTime   / 1000).toFixed(1)}s`;
    const growTimeStr   = `${(s.growTime   / 1000).toFixed(1)}s`;
    const weakenTimeStr = `${(s.weakenTime / 1000).toFixed(1)}s`;

    // Score — only show for victims
    const scoreStr = s.victim ? s.score.toFixed(2) : "-";

    // Flags — removed owned flag
    const zombieFlag   = s.zombie     ? "🧟" : "  ";
    const victimFlag   = s.victim     ? "🐑" : "  ";
    const backdoorFlag = s.backdoored ? "🚪" : "  ";

    ns.tprint(
      `${indentName.padEnd(52, "·")}` +
      `${st.padStart(8)} | ` +
      `${ramStr.padStart(8)} | ` +
      `${maxMoneyStr.padStart(10)} | ` +
      `${availMoneyStr.padStart(10)} | ` +
      `${secStr.padStart(9)} | ` +
      `${chanceStr.padStart(8)} | ` +
      `${hackTimeStr.padStart(8)} | ` +
      `${growTimeStr.padStart(8)} | ` +
      `${weakenTimeStr.padStart(8)} | ` +
      `${scoreStr.padStart(10)} | ` +
      `${zombieFlag}${victimFlag}${backdoorFlag}`
    );
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  ns.tprint("─".repeat(167));
  const zombies = servers.filter(s => s.zombie);

  ns.tprint(`${servers.length} servers  —  Zombies: ${zombies.length}  Victims: ${victims.length}`);
  ns.tprint(`Total RAM: ${servers.reduce((sum, s) => sum + s.serverMaxRam, 0)} GB`);
  ns.tprint(`Best target: ${bestTarget ?? "none"}  (score: ${victims[0]?.score.toFixed(2) ?? "-"})`);
  ns.tprint(`Legend:  🧟 zombie (worker)  🐑 victim (target)  🚪 backdoored  🍏 hackable  🍎 locked  ★ best target`);
}