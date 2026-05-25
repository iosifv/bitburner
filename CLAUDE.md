# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Context

This is a **Bitburner game automation suite** — JavaScript scripts that run inside the Bitburner incremental hacking game. There is no build system, no npm, and no tests. Scripts are edited locally and synced to the game client in real time via the `bitburner-go-filesync` binary.

## Setup & Sync

1. Run `./bitburner-go-filesync` — this watches for file changes and pushes them to the game over WebSocket (port 52525, configured in `config.toml`)
2. In the Bitburner game settings, connect to the sync server
3. Run scripts from the Bitburner in-game terminal: `run lib/lib.js`, `run viruses/bacteria.js <target>`, etc.

`config.toml` controls which files are synced: `*.js`, `viruses/*.js`, `lib/*.js`, `archive/*.js`.

## Architecture

### Active Scripts

| File | Role |
|---|---|
| `lib/logger.js` | Unified `log()` function |
| `lib/scout.js` | Discovery: network scan, server lists, diffs |
| `lib/batch.js` | `dispatch()` — spreads virus workers across zombies |
| `viruses/bacteria.js` | Worker virus: weaken/grow/hack loop against a single target (arg[0]) |

### `lib/logger.js` Exports

```js
import { log } from "lib/logger.js";
```

- **`log(ns, mode, source, action, message)`** — unified logger (`mode`: `"print"` | `"tprint"`)

### `lib/scout.js` Exports

```js
import { reloadServers, getServers, getServersDiff, printDiff } from "lib/scout.js";
```

- **`reloadServers(ns, mode?)`** — DFS network traversal: roots all servers, copies scripts, writes `servers.json`; also writes `servers.backup.json` before overwriting
- **`getServers(ns, filter?)`** — reads `servers.json`; filter: `"all"` | `"zombies"` | `"victims"` (victims sorted by score desc)
- **`getServersDiff(ns)`** — diffs `servers.json` vs `servers.backup.json`; returns `{ added, removed, upgraded, newVictims, lostVictims }`
- **`printDiff(ns, mode?)`** — pretty-prints the diff

### `lib/batch.js` Exports

```js
import { dispatch } from "lib/batch.js";
```

- **`dispatch(ns, mode?)`** — distributes `00-virus.js` workers across all zombies targeting the top-scored victim; kills wrong-target workers and tops up free RAM

### Key Concepts

- **Zombie**: Any server with ≥4 GB RAM that can host worker processes
- **Victim**: Any server with `maxMoney > 0` hackable at the player's current hack level
- **Score**: `(maxMoney × hackChance) / weakenTime` — used to rank victims; `dispatch()` always targets the highest-scored victim
- **Home**: The player's primary server — RAM cost for scripts is always measured here (`ns.getScriptRam(script, "home")`)

### Data Flow

```
reloadServers()  →  servers.json  →  dispatch()  →  bacteria.js (per zombie)
```

`servers.json` is produced by `reloadServers()` and consumed by `getServers()` / `dispatch()`. It contains per-server metadata: path (for `ns.connect()` chains), RAM, security levels, hack times, money, score, and zombie/victim flags.

### Archive

`archive/` contains older scripts (numbered `00–99`) kept for historical reference. They are synced to the game but not the primary workflow. The numbering convention used there:
- `00–01`: Init and network scanning
- `02`: Main farm orchestrator
- `20–22`: RAM sharing / faction rep farming
- `30`: Gang management
- `40`: Hacknet node purchasing
- `80–84`: Server purchasing and upgrades
- `90–92`: Visualization and dashboards

## Deprecated API / Migration Notes

Paste error messages here as they appear in-game. Format: `old → new`.

| Removed function | Replacement |
|---|---|
| `ns.getPurchasedServerMaxRam()` | `ns.cloud.getRamLimit()` |
| `ns.getPurchasedServerCost(ram)` | `ns.cloud.getServerCost(ram)` |
| `ns.purchaseServer(name, ram)` | `ns.cloud.purchaseServer(name, ram)` |
| `ns.formatRam(v)` | `ns.format.ram(v)` |
| `ns.formatNumber(v)` | `ns.format.number(v)` |
| `ns.tail()` | `ns.ui.openTail()` |
| `ns.gang.getOtherGangInformation()` | `ns.gang.getAllGangInformation()` |
| `ns.singularity.getUpgradeHomeCoreCost()` | does not exist — function not in API |
| `ns.singularity.upgradeHomeCores()` | does not exist — function not in API |

## Bitburner API Notes

Scripts receive an `NS` object as their sole argument. Key namespaces:
- `ns.hack/grow/weaken()` — core attack ops (all async, time their own delays)
- `ns.exec/ps/kill/scp()` — remote process management and file copying
- `ns.scan/getServer/hasRootAccess()` — network recon
- `ns.gang.*` / `ns.hacknet.*` — specialized game modules
- `ns.tprint()` — logs to terminal; `ns.print()` — logs to script window

**RAM cost discipline**: Script RAM cost is determined by which `ns.*` functions are called. Minimizing API calls in worker scripts lowers RAM cost per instance, allowing more threads across the zombie fleet. The `lib/lib.js` library trades higher RAM for richer functionality — it's only used by orchestrators, not workers.
