// Part of the engine-v2 system — engine-v2-cortex.js: CortexEngine — intelligence XP farming
import { EngineStoke } from "lib/engine-stoke.js";
import { getConfig }   from "lib/config.js";

// Programs sorted by hack requirement; higher req = more INT XP per completion
const PROGRAMS = [
  { name: "AutoLink.exe",       hackReq:   25 },
  { name: "BruteSSH.exe",       hackReq:   50 },
  { name: "ServerProfiler.exe", hackReq:   75 },
  { name: "DeepscanV1.exe",     hackReq:   75 },
  { name: "FTPCrack.exe",       hackReq:  100 },
  { name: "relaySMTP.exe",      hackReq:  250 },
  { name: "DeepscanV2.exe",     hackReq:  400 },
  { name: "HTTPWorm.exe",       hackReq:  500 },
  { name: "SQLInject.exe",      hackReq:  750 },
  { name: "Formulas.exe",       hackReq: 1000 },
];

class CortexEngine extends EngineStoke {
  constructor(ns) {
    super(ns, "cortex");
  }

  get config() {
    return {
      fallbackStudy: getConfig(this.ns, "cortex-fallback-study"),
    };
  }

  #bestProgram(hackLevel) {
    return PROGRAMS
      .filter(p => p.hackReq <= hackLevel && !this.ns.fileExists(p.name, "home"))
      .sort((a, b) => b.hackReq - a.hackReq)[0] ?? null;
  }

  async tick() {
    const ns     = this.ns;
    const player = ns.getPlayer();
    const intel  = player.skills.intelligence;
    const work   = ns.singularity.getCurrentWork();

    if (work?.type === "CREATE_PROGRAM") {
      this.log("WORKING", `${work.programName.padEnd(20)}  int: ${intel}`);
      return;
    }

    if (work?.type === "CLASS") {
      this.log("STUDY", `CS fallback active  int: ${intel}`);
      return;
    }

    if (work != null) {
      this.log("BUSY", `${work.type} in progress — skipping  int: ${intel}`);
      return;
    }

    const prog = this.#bestProgram(player.skills.hacking);
    if (prog) {
      ns.singularity.createProgram(prog.name, true);
      this.log("START", `${prog.name.padEnd(20)}  hack: ${player.skills.hacking}  int: ${intel}`);
      return;
    }

    if (this.config.fallbackStudy) {
      ns.singularity.universityCourse("Rothman University", "Computer Science", true);
      this.log("STUDY", `no programs available — studying CS  int: ${intel}`);
    } else {
      const allOwned = PROGRAMS.every(p => this.ns.fileExists(p.name, "home"));
      this.log("IDLE", allOwned
        ? `all programs owned  int: ${intel}`
        : `hack ${player.skills.hacking} too low for next program  int: ${intel}`
      );
    }
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
