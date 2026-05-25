# Batcher Engine v2 — Architecture

Replaces the old RAM-saturation bacteria dispatch with a centralized HWGW shotgun batcher.
One brain computes exact thread counts + finish-order timing; single-shot workers do one op and exit.

## Phase machine

```
propulsion-engine.js  (spawns/kills by enable-batching config)
        │
engine-v2-batching.js  — BatcherEngine extends EngineStoke
        │   tick():  sweep → scp → pickTarget → snapshot → scheduler.tick
        ▼
lib/batcher-scheduler.js  — BatchScheduler
        │   phases (first-match-wins, cortex idiom):
        │     1. PREP-WEAKEN  sec > min + tolerance
        │     2. PREP-GROW    money < max * tolerance
        │     3. BATCH        always (prepped)
        │
        ├── lib/batcher-math.js       BatchMath   — thread counts + offsets (ns.formulas.hacking.*)
        ├── lib/batcher-allocator.js  RamAllocator — FFD snapshot placement, transactional batch fit
        ├── lib/batcher-strategies.js ShotgunStrategy  (JitStrategy stub)
        └── lib/batcher-targeting.js  pickTarget  — hysteresis lock via batcher.json
        │
        ▼  ns.exec
spores/leech-hack.js    args: [target, additionalMsec]  → await ns.hack(target, {additionalMsec})
spores/enzyme-grow.js   args: [target, additionalMsec]  → await ns.grow(target, {additionalMsec})
spores/mycelium-weaken.js args: [target, additionalMsec] → await ns.weaken(target, {additionalMsec})
```

## Batch timing

For a prepped target, one HWGW batch has finish order H < W1 < G < W2 with `stepGapMs` gaps.
All four ops are `exec`'d at the same instant; `additionalMsec` controls finish time:

```
              ht + offsets.hack      ─→ finishes at T          (T = wt - stepGapMs)
wt + offsets.weaken1 (= 0)         ─→ finishes at T + 1*gap
              gt + offsets.grow     ─→ finishes at T + 2*gap
wt + offsets.weaken2 (= 2*gap)     ─→ finishes at T + 3*gap
```

## Spore mapping

| Spore | Op | RAM/thread |
|---|---|---|
| `leech-hack.js` | `ns.hack` | 1.70 GB |
| `enzyme-grow.js` | `ns.grow` | 1.75 GB |
| `mycelium-weaken.js` | `ns.weaken` | 1.75 GB |

(Old `mycelium-grow.js` was a duplicate of `enzyme-grow.js` — repurposed as weaken.)

## State files

| File | Writer | Content |
|---|---|---|
| `servers.json` | lib/scout.js | zombie/victim fleet snapshot (read by allocator snapshot) |
| `batcher.json` | lib/batcher-targeting.js | locked target + timestamp |

## Config keys

| Key | Default | Description |
|---|---|---|
| `enable-batching` | true | engine on/off |
| `loop-delay-batching` | 10 | tick interval (seconds) |
| `batching-forced-target` | `" "` | override auto target (blank = auto) |
| `batching-steal-fraction` | 0.10 | money to steal per batch (0–1) |
| `batching-step-gap-ms` | 20 | ms between HWGW finish times |
| `batching-grow-margin` | 1.05 | grow thread safety buffer |
| `batching-prep-sec-tolerance` | 0.5 | max sec above min to call "prepped" |
| `batching-prep-money-tolerance` | 0.99 | min money fraction to call "prepped" |
| `batching-switch-margin` | 1.25 | new target must be 1.25× better to switch |
| `engine-free-home-ram` | 70 | GB reserved on home |

## Adding JIT

Implement `JitStrategy.schedule(ctx)` in `lib/batcher-strategies.js`.
Pass `new JitStrategy()` instead of `new ShotgunStrategy()` in the engine constructor.
Everything else (BatchMath, RamAllocator, BatchScheduler, spores) stays identical.
Workers' commented-out `tryWritePort(101, ...)` can be uncommented for completion signals.
