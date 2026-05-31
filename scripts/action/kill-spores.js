export async function main(ns) {
  const procs = ns.ps("home").filter(p => p.filename.startsWith("spores/"));
  if (!procs.length) { 
    ns.tprint("no spores running on home"); 
    return; 
  }
  for (const proc of procs) {
    ns.kill(proc.pid);
    ns.tprint(`killed  ${proc.filename}  pid:${proc.pid}`);
  }
  ns.tprint(`done — killed ${procs.length} spore(s)`);
}
