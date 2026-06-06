// Part of the engine-v2 system — engine-v2-cortex.js: CortexEngine — ordered state machine
import { EngineStoke }                          from "lib/engine-stoke.js";
import { getConfig }                            from "lib/quonfig.js";
import { getServers, serverInstallBackdoor }    from "lib/scout.js";
import { textCyane, textGreen }                 from "lib/ui.js";

// ── Constants ─────────────────────────────────────────────────────────────────

/** All hacking programs — "buy" ones are purchased via TOR darkweb, "create" ones are coded by the player. */
const PROGRAMS = [
  { name: "BruteSSH.exe",           hackReq:   50, cost:       500_000, action: "buy"    },
  { name: "FTPCrack.exe",           hackReq:  100, cost:     1_500_000, action: "buy"    },
  { name: "relaySMTP.exe",          hackReq:  250, cost:     5_000_000, action: "buy"    },
  { name: "HTTPWorm.exe",           hackReq:  500, cost:    30_000_000, action: "buy"    },
  { name: "SQLInject.exe",          hackReq:  750, cost:   250_000_000, action: "buy"    },
  { name: "DarkscapeNavigator.exe", hackReq: null, cost:    50_000_000, action: "buy"    }, 
  { name: "AutoLink.exe",           hackReq:   25, cost:     1_000_000, action: "create" },
  { name: "ServerProfiler.exe",     hackReq:   75, cost:       500_000, action: "create" },
  { name: "DeepscanV1.exe",         hackReq:   75, cost:       500_000, action: "create" },
  // { name: "DeepscanV2.exe",         hackReq:  400, cost:    25_000_000, action: "create" },
  // { name: "Formulas.exe",           hackReq: 1000, cost: 1_000_000_000, action: "create" },
];


const BACKDOOR_TARGETS = [
  "CSEC",
  "avmnite-02h",
  "I.I.I.I",
  "run4theh111z",
  "powerhouse-fitness",
  "fulcrumassets",
  "w0r1d_d43m0n",
];

const CITIES                = ["Sector-12", "Aevum", "Volhaven", "Chongqing", "New Tokyo", "Ishima"];
const TOR_COST              = 200_000;
const DASH_WIDTH            = 80;
const HISTORY_LENGTH        = 60;
const GYM                   = "Powerhouse Gym";
const GYM_CITY              = "Sector-12";
const UNI                   = "ZB Institute of Technology";
const UNI_CITY              = "Volhaven";
const UNI_ALGORITHMS_MONEY  = 1_000_000_000;

const UNIVERSITIES = {
  "Sector-12": "Rothman University",
  "Aevum":     "Summit University",
  "Volhaven":  "ZB Institute of Technology",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Parses "str,def,dex,agi" into { targetStr, targetDef, targetDex, targetAgi }. */
function parseCombatTarget(value) {
  const [str, def, dex, agi] = String(value).split(",").map(Number);
  return { targetStr: str, targetDef: def, targetDex: dex, targetAgi: agi };
}

/** Travels to a city only if the player isn't already there, avoiding the travel cost on idle ticks. */
function travelIfNeeded(ns, city) {
  if (ns.getPlayer().city !== city) ns.singularity.travelToCity(city);
}

/**
 * Starts a university course using the local university if available.
 * Only travels to Volhaven (preferred uni) if no local university exists and travel is affordable.
 * Returns true if a course was started, false if broke and stranded.
 */
function universityTick(ns, course, allowAlgorithmsUpgrade = true) {
  const player  = ns.getPlayer();
  const useZB   = allowAlgorithmsUpgrade && player.money >= UNI_ALGORITHMS_MONEY;
  const target  = useZB ? "Algorithms" : course;

  const work = ns.singularity.getCurrentWork();
  if (work?.type === "CLASS" && work?.className === target) return true;

  if (useZB) {
    travelIfNeeded(ns, UNI_CITY);
    return ns.singularity.universityCourse(UNI, "Algorithms", false);
  }

  const local = UNIVERSITIES[player.city];
  if (local) return ns.singularity.universityCourse(local, course, false);

  // No local university — travel to preferred uni (Volhaven). Travel is cheap so no money gate.
  ns.singularity.travelToCity(UNI_CITY);
  return ns.singularity.universityCourse(UNI, course, false);
}


/** Programs that can be purchased from the TOR darkweb market. */
const buyablePrograms   = () => PROGRAMS.filter(p => p.action === "buy");
/** Programs that must be coded by the player via singularity.createProgram(). */
const creatablePrograms = () => PROGRAMS.filter(p => p.action === "create");

/** Returns true if there is at least one creatable program the player has the hack level to make. */
function stateCreateProgramCondition(ns, player) {
  return creatablePrograms().some(p => p.hackReq <= player.skills.hacking && !ns.fileExists(p.name, "home"));
}


// ── States ────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} CortexState
 * @property {string}                           name       - Display name logged on each tick
 * @property {(context: CortexContext) => boolean}  shouldRun - Returns true if this state should activate
 * @property {(context: CortexContext) => void}     tick      - Executes the state's action
 */

/**
 * @typedef {Object} CortexContext
 * @property {NS}     ns
 * @property {Player} player
 * @property {Object} work
 * @property {Object} config
 */

const stateTrainHackInitial = {
  name: "TRAIN-HACK-INITIAL",
  shouldRun: ({ player, config }) => player.skills.hacking < config.targetHackInitial,
  tick: ({ ns }) => { universityTick(ns, "Computer Science"); },
};

/** Returns true if TOR is not yet owned and affordable, or if any buyable program is unowned and affordable. */
function stateBuyProgramsCondition(ns, player) {
  if (!ns.hasTorRouter() && player.money >= TOR_COST) return true;
  return buyablePrograms().some(p => !ns.fileExists(p.name, "home") && player.money >= p.cost);
}

const stateBuyPrograms = {
  name: "BUY-PROGRAMS",
  shouldRun: ({ ns, player }) => stateBuyProgramsCondition(ns, player),
  tick: ({ ns }) => {
    ns.singularity.purchaseTor();
    for (const p of buyablePrograms()) {
      if (!ns.fileExists(p.name, "home")) {
        const result = ns.singularity.purchaseProgram(p.name);
        if (result) {
          ns.print(`[BUY-PROGRAMS]  purchased ${p.name}`);
        }
      }
    }
  },
};

const stateUpgradeHome = {
  name: "UPGRADE-HOME",
  shouldRun: ({ ns, player }) => ns.singularity.getUpgradeHomeRamCost() <= player.money,
  tick: ({ ns, player }) => {
    const ramCost = ns.singularity.getUpgradeHomeRamCost();
    const ok = ns.singularity.upgradeHomeRam();
    if (ok) ns.print(`[UPGRADE-HOME]  RAM upgraded  (cost: ${ns.format.number(ramCost)})`);
  },
};

const stateTrainCombatCondition = ({ player, config, ns }) => {
  if (ns.heart.break() <= -254_000) {
    return false;
  }
  if (
    player.skills.strength  < config.targetStr ||
    player.skills.defense   < config.targetDef ||
    player.skills.dexterity < config.targetDex ||
    player.skills.agility   < config.targetAgi
  ) {
    return true;
  }
  return false;
};

const stateTrainCombat = {
  name: "TRAIN-COMBAT",
  shouldRun: stateTrainCombatCondition,
  tick: ({ ns, player, config }) => {
    travelIfNeeded(ns, GYM_CITY);
    const { strength: str, defense: def, dexterity: dex, agility: agi } = player.skills;
    if      (str < config.targetStr) ns.singularity.gymWorkout(GYM, "str", false);
    else if (def < config.targetDef) ns.singularity.gymWorkout(GYM, "def", false);
    else if (dex < config.targetDex) ns.singularity.gymWorkout(GYM, "dex", false);
    else                             ns.singularity.gymWorkout(GYM, "agi", false);
  },
};

const stateTrainCha = {
  name: "TRAIN-CHA",
  shouldRun: ({ player, config }) => player.skills.charisma < config.targetCha,
  tick: ({ ns }) => { universityTick(ns, "Leadership", false); },
};

const stateCreateProgram = {
  name: "CREATE-PROG",
  shouldRun: ({ ns, player, work }) => {
    if (work?.type === "CREATE_PROGRAM") return true;
    return stateCreateProgramCondition(ns, player);
  },
  tick: ({ ns, player, work }) => {
    if (work?.type === "CREATE_PROGRAM") return;
    const prog = creatablePrograms().find(p => p.hackReq <= player.skills.hacking && !ns.fileExists(p.name, "home"));
    if (prog) ns.singularity.createProgram(prog.name, true);
  },
};

const stateTrainHack = {
  name: "TRAIN-HACK",
  shouldRun: () => true,
  tick: ({ ns }) => { universityTick(ns, "Computer Science"); },
};

function stateBackdoorCondition(ns, player) {
  const all = getServers(ns);
  return BACKDOOR_TARGETS.some(name => {
    const s = all.find(s => s.name === name);
    return s && !s.backdoored && player.skills.hacking >= s.serverReqLevel;
  });
}

const stateBackdoor = {
  name: "BACKDOOR",
  shouldRun: ({ ns, player }) => stateBackdoorCondition(ns, player),
  tick: async ({ ns, player }) => {
    const all    = getServers(ns);
    const target = BACKDOOR_TARGETS
      .map(name => all.find(s => s.name === name))
      .find(s => s && !s.backdoored && player.skills.hacking >= s.serverReqLevel);
    if (!target) return;
    const intLine = (p) => `int:${p.skills.intelligence}  int-xp:${ns.format.number(p.exp.intelligence)}`;
    ns.print(`[BACKDOOR]  installing on ${target.name} ...  ${intLine(ns.getPlayer())}`);
    await serverInstallBackdoor(ns, target);
    ns.print(`[BACKDOOR]  done → ${target.name}  ${intLine(ns.getPlayer())}`);
  },
};

const stateJoinFaction = {
  name: "JOIN-FACTION",
  shouldRun: ({ ns }) => ns.singularity.checkFactionInvitations().length > 0,
  tick: ({ ns }) => {
    for (const faction of ns.singularity.checkFactionInvitations()) {
      ns.singularity.joinFaction(faction);
      ns.print(`[JOIN-FACTION]  joined ${faction}`);
    }
  },
};

const stateDaedalus = {
  name: "DAEDALUS",
  shouldRun: ({ ns, player, config }) => config.workDaedalus && player.factions.includes("Daedalus") && !ns.singularity.getOwnedAugmentations(true).includes("The Red Pill"),
  tick: ({ ns, work }) => {
    if (work?.type === "FACTION" && work?.factionName === "Daedalus") return;
    ns.singularity.workForFaction("Daedalus", "hacking", false);
  },
};

const stateRandomTravel = {
  name: "RANDOM-TRAVEL",
  shouldRun: ({ player }) => player.money > 10_000_000 && Math.random() < 0.5,
  tick: ({ ns }) => {
    const city = CITIES[Math.floor(Math.random() * CITIES.length)];
    ns.singularity.travelToCity(city);
  },
};


const KARMA_HOMICIDE_TARGET  = -54000;
const HOMICIDE_MIN_KILLS     = 30;

const stateHomicide = {
  name: "HOMICIDE",
  shouldRun: ({ ns, player }) => player.numPeopleKilled < HOMICIDE_MIN_KILLS || ns.heart.break() > KARMA_HOMICIDE_TARGET,
  tick: ({ ns }) => {
    const work = ns.singularity.getCurrentWork();
    if (work?.type === "CRIME" && work?.crimeType === "Homicide") {
      return;
    }
    ns.singularity.commitCrime("Homicide", false);
  },
};

/** Major corporations to climb. Listed highest-priority first. */
const BIG_COMPANIES = [
  { name: "ECorp",                  faction: "ECorp",                  city: "Aevum"      },
  { name: "MegaCorp",               faction: "MegaCorp",               city: "Sector-12"  },
  { name: "Blade Industries",       faction: "Blade Industries",       city: "Sector-12"  },
  { name: "NWO",                    faction: "NWO",                    city: "Volhaven"   },
  { name: "Four Sigma",             faction: "Four Sigma",             city: "Sector-12"  },
  { name: "OmniTek Incorporated",   faction: "OmniTek Incorporated",   city: "Volhaven"   },
  { name: "KuaiGong International", faction: "KuaiGong International", city: "Chongqing"  },
  { name: "Fulcrum Technologies",   faction: "Fulcrum Secret Technologies", city: "Aevum"  },
];

const stateWorkCompany = {
  name: "WORK-COMPANY",
  shouldRun: ({ player, config }) =>
    config.workCompany && BIG_COMPANIES.some(c => !player.factions.includes(c.faction)),
  tick: ({ ns, player, work }) => {
    const businessField = Object.values(ns.enums?.JobField ?? {})
      .find(f => typeof f === "string" && f.toLowerCase() === "business");
    if (!businessField) return;

    // Only consider companies whose faction we haven't joined yet.
    const remaining = BIG_COMPANIES.filter(c => !player.factions.includes(c.faction));

    // Try to promote at every remaining company we already hold a job at.
    for (const c of remaining.filter(c => player.jobs[c.name])) {
      ns.singularity.applyToCompany(c.name, businessField);
    }

    // Already working at a remaining target — no switch needed this tick.
    if (work?.type === "COMPANY" && remaining.some(c => c.name === work.companyName)) return;

    // Pick the remaining company with the highest rep; fall back to first in list if not hired anywhere.
    const hired = remaining.filter(c => player.jobs[c.name]);
    const target = hired.length > 0
      ? hired.reduce((a, b) => ns.singularity.getCompanyRep(b.name) > ns.singularity.getCompanyRep(a.name) ? b : a)
      : remaining[0];

    if (!target) return;

    ns.singularity.applyToCompany(target.name, businessField);
    travelIfNeeded(ns, target.city);
    ns.singularity.workForCompany(target.name, false);
  },
};

/** @type {CortexState[]} */
const STATES_ORDER = [
  stateJoinFaction,
  stateBuyPrograms,
  stateUpgradeHome,
  stateTrainHackInitial,
  stateBackdoor,
  stateTrainCombat,
  stateTrainCha,
  stateRandomTravel,
  // stateCreateProgram,
  stateDaedalus,
  stateHomicide,
  stateWorkCompany,
  stateTrainHack,
];



// ── Dashboard ─────────────────────────────────────────────────────────────────

/**
 * Cyan section header padded with ─ to DASH_WIDTH.
 * visibleLen counts the non-ANSI characters only, so the dash count is right despite
 * the escape bytes that textCyane (\x1b[36m…\x1b[0m) injects into prefix.length.
 */
function sectionTitle(title) {
  const prefix     = `── ${textCyane(title)} `;
  const visibleLen = 3 + title.length + 1; // "── " + title + " "
  return prefix + "─".repeat(Math.max(0, DASH_WIDTH - visibleLen));
}

/**
 * Clears and redraws the cortex tail window each tick.
 * Shows a state-timeline grid: every state on the y-axis, recent tick history on the
 * x-axis. Each tick's active state is highlighted with a green filled block; all others
 * show a dim dot. The footer shows the current state and its consecutive run count.
 */
function printCortexDashboard(ns, engine) {
  const stateNames  = [...STATES_ORDER.map(s => s.name), "IDLE"];
  const labelWidth  = Math.max(...stateNames.map(n => n.length));
  const windowWidth = DASH_WIDTH - 2 - labelWidth - 2; // 2 indent + labelWidth + 2 gap

  const history = engine.history;
  const window  = history.slice(-windowWidth);

  ns.clearLog();
  ns.print(sectionTitle("CORTEX TIMELINE"));

  for (const name of stateNames) {
    const cells = window.map(tick => tick === name ? textGreen("█") : "·").join("");
    ns.print(`  ${name.padEnd(labelWidth)}  ${cells}`);
  }

  const current = engine.currentState?.name ?? "—";
  const counter = engine.stateCounter;
  ns.print("");
  ns.print(`  now: ${textGreen(current)} ×${counter}   (${history.length} ticks shown)`);
}

// ── Engine ────────────────────────────────────────────────────────────────────

/**
 * CortexEngine — manages player actions via an ordered state machine.
 * Each tick it picks the first state whose shouldRun() returns true and executes its tick().
 * Priority order is defined by STATES_ORDER.
 */
class CortexEngine extends EngineStoke {
  #prevState    = null;
  #stateCounter = 0;
  #history      = [];

  constructor(ns) {
    super(ns, "cortex");
  }

  log(action, message) {
    this.ns.print(`${action.padEnd(10)} ${message}`);
  }

  /** Ring buffer of state names (or "IDLE") for the last HISTORY_LENGTH ticks. */
  get history()      { return this.#history; }
  /** The state object that ran on the previous tick, or null. */
  get currentState() { return this.#prevState; }
  /** Number of consecutive ticks the current state has been active. */
  get stateCounter() { return this.#stateCounter; }

  /** Appends a state name to the history ring buffer, evicting the oldest entry when full. */
  #pushHistory(name) {
    this.#history.push(name);
    if (this.#history.length > HISTORY_LENGTH) this.#history.shift();
  }

  get config() {
    const ns = this.ns;
    return {
      ...parseCombatTarget(getConfig(ns, "cortex-target-combat")),
      targetCha:          getConfig(ns, "cortex-target-cha"),
      targetHackInitial:  getConfig(ns, "cortex-target-hack-initial"),
      workCompany:        getConfig(ns, "cortex-work-company"),
      workDaedalus:       getConfig(ns, "cortex-work-daedalus"),
    };
  }

  
  async tick() {
    const ns  = this.ns;
    const context = {
      ns,
      player:    ns.getPlayer(),
      work:      ns.singularity.getCurrentWork(),
      config:    this.config,
      prevState: this.#prevState,
    };

    for (const state of STATES_ORDER) {
      if (state.shouldRun(context)) {
        await state.tick(context);

        if (state !== this.#prevState) {
          this.#stateCounter = 1;
        } else {
          this.#stateCounter++;
        }

        this.#pushHistory(state.name);
        this.#prevState = state;
        printCortexDashboard(this.ns, this);
        return;
      }
    }

    this.#pushHistory("IDLE");
    printCortexDashboard(this.ns, this);
  }
}

export async function main(ns) {
  ns.disableLog("ALL");
  ns.ui.openTail();
  ns.atExit(() => ns.ui.closeTail());
  const engine = new CortexEngine(ns);
  while (true) {
    await engine.tick();
    await ns.sleep(engine.loopDelay);
  }
}
