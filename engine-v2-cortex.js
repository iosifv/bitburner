// Part of the engine-v2 system — engine-v2-cortex.js: CortexEngine — ordered state machine
import { EngineStoke }                          from "lib/engine-stoke.js";
import { getConfig }                            from "lib/quonfig.js";
import { getServers, serverInstallBackdoor }    from "lib/scout.js";

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
  "w0r1d_d43m0n",
];

const CITIES                = ["Sector-12", "Aevum", "Volhaven", "Chongqing", "New Tokyo", "Ishima"];
const TOR_COST              = 200_000;
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
function universityTick(ns, course) {
  const player  = ns.getPlayer();
  const useZB   = player.money >= UNI_ALGORITHMS_MONEY;
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

const stateRandomTravel = {
  name: "RANDOM-TRAVEL",
  shouldRun: ({ player }) => player.money > 10_000_000 && Math.random() < 0.5,
  tick: ({ ns }) => {
    const city = CITIES[Math.floor(Math.random() * CITIES.length)];
    ns.singularity.travelToCity(city);
  },
};


const KARMA_HOMICIDE_TARGET = -54000;

const stateHomicide = {
  name: "HOMICIDE",
  shouldRun: ({ ns }) => ns.heart.break() > KARMA_HOMICIDE_TARGET,
  tick: ({ ns }) => {
    const work = ns.singularity.getCurrentWork();
    if (work?.type === "CRIME" && work?.crimeType === "Homicide") {
      return;
    }
    ns.singularity.commitCrime("Homicide", false);
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
  stateCreateProgram,
  stateHomicide,
  stateTrainHack,
];



// ── Engine ────────────────────────────────────────────────────────────────────

/**
 * CortexEngine — manages player actions via an ordered state machine.
 * Each tick it picks the first state whose shouldRun() returns true and executes its tick().
 * Priority order is defined by STATES_ORDER.
 */
class CortexEngine extends EngineStoke {
  #prevState = null;
  #stateCounter = 0;

  constructor(ns) {
    super(ns, "cortex");
  }

  log(action, message) {
    this.ns.print(`${action.padEnd(10)} ${message}`);
  }

  get config() {
    const ns = this.ns;
    return {
      ...parseCombatTarget(getConfig(ns, "cortex-target-combat")),
      targetCha:          getConfig(ns, "cortex-target-cha"),
      targetHackInitial:  getConfig(ns, "cortex-target-hack-initial"),
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
      player:    ns.getPlayer(),
      work:      ns.singularity.getCurrentWork(),
      config:    this.config,
      prevState: this.#prevState,
    };

    for (const state of STATES_ORDER) {
      if (state.shouldRun(context)) {
        await state.tick(context);

        if (state !== this.#prevState) {
          if (this.#prevState) {
            this.ns.print(`[${this.#prevState.name}] - ${this.#stateCounter}`);
          }
          this.#stateCounter = 1;
        } else {
          this.#stateCounter++;
        }

        this.log(state.name, this.#statusLine(context));

        this.#prevState = state;
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
