import { setTask } from "lib/gang.js";

const TASKS = [
  "Train Combat",
  "Mug People",
  "Armed Robbery",
  "Traffick Illegal Arms",
  "Terrorism",
  "Vigilante Justice",
  "Territory Warfare",
];

/** @param {NS} ns */
export async function main(ns) {
  const members = ns.gang.getMemberNames();

  const task = ns.args[0]
    ?? await ns.prompt("Assign task to all members:", { type: "select", choices: TASKS });

  if (!TASKS.includes(task)) {
    ns.tprint(`ERROR  Unknown task: "${task}"`);
    return;
  }

  for (const name of members) {
    setTask(ns, ns.gang.getMemberInformation(name), task);
  }

  ns.tprint(`ASSIGN   all ${members.length} members → ${task}`);
}

