// Part of the engine-v2 system — engine-v2-cortex.js: CortexEngine — ordered state machine
import { EngineStoke }                          from "lib/engine-stoke.js";
import { getConfig }                            from "lib/config.js";
import { getServers, serverInstallBackdoor }    from "lib/scout.js";

// ── Constants ─────────────────────────────────────────────────────────────────

/** All hacking programs — "buy" ones are purchased via TOR darkweb, "create" ones are coded by the player. */
const PROGRAMS = [
  { name: "BruteSSH.exe",       hackReq:   50, cost:           500_000, action: "buy"    },
  { name: "FTPCrack.exe",       hackReq:  100, cost:         1_500_000, action: "buy"    },
  { name: "relaySMTP.exe",      hackReq:  250, cost:         5_000_000, action: "buy"    },
  { name: "HTTPWorm.exe",       hackReq:  500, cost:        30_000_000, action: "buy"    },
  { name: "SQLInject.exe",      hackReq:  750, cost:       250_000_000, action: "buy"    },
  { name: "AutoLink.exe",       hackReq:   25, cost:         1_000_000, action: "create" },
  { name: "ServerProfiler.exe", hackReq:   75, cost:           500_000, action: "create" },
  { name: "DeepscanV1.exe",     hackReq:   75, cost:           500_000, action: "create" },
  { name: "DeepscanV2.exe",     hackReq:  400, cost:        25_000_000, action: "create" },
  { name: "Formulas.exe",       hackReq: 1000, cost:     1_000_000_000, action: "create" },
];

/** Maps company name to the city where it's located, used to travel before applying/working. */
const COMPANY_CITY = {
  "MegaCorp":               "Sector-12",
  "Blade Industries":       "Sector-12",
  "Four Sigma":             "Sector-12",
  "Icarus Microsystems":    "Sector-12",
  "OmniTek Incorporated":   "Sector-12",
  "NWO":                    "Sector-12",
  "ECorp":                  "Aevum",
  "AeroCorp":               "Aevum",
  "Fulcrum Technologies":   "Aevum",
  "Galactic Cybersystems":  "Aevum",
  "CompuTek":               "Volhaven",
  "HeliosLabs":             "Volhaven",
  "KuaiGong International": "Chongqing",
  "Global Pharmaceuticals": "New Tokyo",
  "Storm Technologies":     "Ishima",
};

const BACKDOOR_TARGETS = [
  "CSEC",
  "avmnite-02h",
  "I.I.I.I",
  "run4theh111z",
  "powerhouse-fitness",
  "w0r1d_d43m0n",
];

const CITIES   = ["Sector-12", "Aevum", "Volhaven", "Chongqing", "New Tokyo", "Ishima"];
const TOR_COST = 200_000;
const GYM      = "Powerhouse Gym";
const GYM_CITY = "Sector-12";
const UNI      = "ZB Institute of Technology";
const UNI_CITY = "Volhaven";

const UNIVERSITIES = {
  "Sector-12": "Rothman University",
  "Aevum":     "Summit University",
  "Volhaven":  "ZB Institute of Technology",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Travels to a city only if the player isn't already there, avoiding the travel cost on idle ticks. */
function travelIfNeeded(ns, city) {
  if (ns.getPlayer().city !== city) ns.singularity.travelToCity(city);
}

/**
 * Starts a university course using the local university if available.
 * Only travels to Volhaven (preferred uni) if no local university exists and travel is affordable.
 * Returns true if a course was started, false if broke and stranded.
 */
function universityTick(ns, course) {
  const player = ns.getPlayer();
  const local  = UNIVERSITIES[player.city];
  if (local) {
    ns.singularity.universityCourse(local, course, false);
    return true;
  }
  if (player.money >= TOR_COST) {
    ns.singularity.travelToCity(UNI_CITY);
    ns.singularity.universityCourse(UNI, course, false);
    return true;
  }
  return false;
}

/**
 * Scores a job field based on the player's skill distribution.
 * Higher score = better fit. Weights are approximations of in-game XP formulas.
 * 
 * @param {string} field - Job field name (e.g. "software", "management")
 * @param {number} hack - Hacking skill level
 * @param {number} cha - Charisma skill level
 * @param {number} combat - Sum of str + def + dex + agi
 * @param {number} dex - Dexterity skill level
 * @param {number} agi - Agility skill level
 * @returns {number} Score — higher is better
 */
function fieldScore(field, hack, cha, combat, dex, agi) {
  const f = field.toLowerCase();
  if (f.includes("software") && !f.includes("consultant")) return hack   * 2.0;
  if (f === "it")                                          return hack   * 1.6;
  if (f.includes("network"))                               return hack   * 1.4;
  if (f === "engineer")                                    return hack   * 1.5 + combat * 0.2;
  if (f.includes("research"))                              return hack   * 1.5;
  if (f.includes("software") && f.includes("consultant"))  return hack   * 1.0;
  if (f === "management")                                  return cha    * 2.0;
  if (f.includes("business") && !f.includes("consultant")) return cha    * 1.8;
  if (f.includes("business") && f.includes("consultant"))  return cha    * 1.4;
  if (f === "agent")                                       return cha    * 1.0 + (dex + agi) * 0.4;
  if (f === "operations")                                  return combat * 1.6 + cha * 0.4;
  if (f === "security")                                    return combat * 1.5;
  if (f.includes("field"))                                 return combat * 1.8;
  return (hack + cha + combat) * 0.2;
}

/**
 * Returns the job field that best matches the player's current skills.
 * Falls back to "software" if the fields list is empty.
 * 
 * @param {object} player - NS player object
 * @param {string[]} fields - Available job fields to rank
 * @returns {string} The highest-scoring field name
 */
function bestFitField(player, fields) {
  const s      = player.skills;
  const hack   = s.hacking;
  const cha    = s.charisma;
  const combat = s.strength + s.defense + s.dexterity + s.agility;
  return [...fields]
    .sort((a, b) => fieldScore(b, hack, cha, combat, s.dexterity, s.agility)
                  - fieldScore(a, hack, cha, combat, s.dexterity, s.agility))[0]
    ?? "software";
}

/**
 * Returns all available job field names from ns.enums, falling back to a hardcoded list.
 * ns.enums is unavailable at module level so this must be called at runtime.
 */
function ns_getJobFields(ns) {
  const fromEnums = ns?.enums?.JobField
    ? Object.values(ns.enums.JobField).filter(v => typeof v === "string")
    : [];
  return fromEnums.length ? fromEnums : [
    "software", "software consultant", "it", "security engineer",
    "network engineer", "business", "business consultant",
    "research & development", "management", "security",
    "agent", "employee", "part-time employee",
  ];
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
        ns.singularity.purchaseProgram(p.name);
        ns.print(`[BUY-PROGRAMS]  purchased ${p.name}`);
      }
    }
  },
};

const stateTrainCombat = {
  name: "TRAIN-COMBAT",
  shouldRun: ({ player, config }) =>
    player.skills.strength  < config.targetStr ||
    player.skills.defense   < config.targetDef ||
    player.skills.dexterity < config.targetDex ||
    player.skills.agility   < config.targetAgi,
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
  tick: ({ ns }) => { universityTick(ns, "Leadership"); },
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
  shouldRun: ({ config }) => config.fallbackStudy,
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

const stateRandomTravel = {
  name: "RANDOM-TRAVEL",
  shouldRun: ({ player }) => player.money > 10_000_000 && Math.random() < 0.5,
  tick: ({ ns }) => {
    const city = CITIES[Math.floor(Math.random() * CITIES.length)];
    ns.singularity.travelToCity(city);
  },
};

const stateWorkCompany = {
  name: "WORK-COMPANY",
  shouldRun: () => true,
  tick: ({ ns, player, work, config }) => {
    const company = config.company;
    if (work?.type === "COMPA. NY" && work?.companyName === company) return;
    const city = COMPANY_CITY[company];
    if (city) travelIfNeeded(ns, city);
    const field = bestFitField(player, ns_getJobFields(ns));
    ns.singularity.applyToCompany(company, field);
    ns.singularity.workForCompany(company, false);
  },
};

/** @type {CortexState[]} */
const STATES_ORDER = [
  stateJoinFaction,
  stateBuyPrograms,
  stateTrainHackInitial,
  stateBackdoor,
  stateTrainCombat,
  stateTrainCha,
  stateRandomTravel,
  stateCreateProgram,
  stateTrainHack,
  stateWorkCompany,
];

// ── Engine ────────────────────────────────────────────────────────────────────

/**
 * CortexEngine — manages player actions via an ordered state machine.
 * Each tick it picks the first state whose shouldRun() returns true and executes its tick().
 * Priority order is defined by STATES_ORDER.
 */
class CortexEngine extends EngineStoke {
  constructor(ns) {
    super(ns, "cortex");
  }

  get config() {
    const ns = this.ns;
    return {
      fallbackStudy:      getConfig(ns, "cortex-fallback-study"),
      targetStr:          getConfig(ns, "cortex-target-str"),
      targetDef:          getConfig(ns, "cortex-target-def"),
      targetDex:          getConfig(ns, "cortex-target-dex"),
      targetAgi:          getConfig(ns, "cortex-target-agi"),
      targetCha:          getConfig(ns, "cortex-target-cha"),
      targetHackInitial:  getConfig(ns, "cortex-target-hack-initial"),
      company:            getConfig(ns, "cortex-fallback-work"),
    };
  }

  #statusLine({ player: { skills: s } }) {
    return (
      `int:${s.intelligence}  hack:${s.hacking}  ` +
      `str:${s.strength}  def:${s.defense}  dex:${s.dexterity}  agi:${s.agility}  cha:${s.charisma}`
    );
  }

  
  async tick() {
    const ns  = this.ns;
    const context = {
      ns,
      player: ns.getPlayer(),
      work:   ns.singularity.getCurrentWork(),
      config: this.config,
    };

    for (const state of STATES_ORDER) {
      if (state.shouldRun(context)) {
        await state.tick(context);
        this.log(state.name, this.#statusLine(context));
        this.ns.print(`[${state.name}]`);
        return;
      }
    }

    this.log("IDLE", "no applicable state");
  }
}

export async function main(ns) {
  ns.disableLog("ALL");
  ns.ui.openTail();
  const engine = new CortexEngine(ns);
  while (true) {
    await engine.tick();
    await ns.sleep(engine.loopDelay);
  }
}
