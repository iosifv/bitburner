/** @param {NS} ns */
export function ExecDodgeNSProxy(ns) {
  ns.ramOverride(2.95);
  function RecursiveProxy(val, path) {
    const memo = new Map();
    const handler = {
      get(target, prop) {
        if (memo.has(prop)) return memo.get(prop);
        let val = target[prop];
        if (typeof val == 'object') {
          val = RecursiveProxy(val, path + (path ? '.' : '') + prop);
        }
        if (typeof val == 'function') {
          let fpath = path + (path ? '.' : '') + prop;
          let ramCost = ns.getFunctionRamCost(fpath);
          if (ramCost != 0 && prop != 'exec') {
            val = async (...args) => {
              let pid = ns.exec(
                'exec.js',
                ns.self().server,
                {temporary: true, ramOverride: 1.6 + ramCost},
                `ns.${fpath}(${args.map(JSON.stringify).join()})`);
              if (pid == 0) throw 'Failed to exec script';
              await ns.nextPortWrite(pid);
              return ns.readPort(pid);
            };
          }
        }
        memo.set(prop, val);
        return val;
      }
    };
    return new Proxy(val, handler)
  }
  return RecursiveProxy(ns, '');
}

/** @param {NS} ns */
export async function main(ns) {
  ns = ExecDodgeNSProxy(ns);
  ns.print(await Array.fromAsync(await ns.scan(), ns.getServer))
}