# The Boys Engine — Implementation Report

## Files Modified

- `lib/gang.js` — added `getMaxRivalPower` and `class WarfareTicker`
- `engine-v2-the-boys.js` — full conversion from monitor to controller

---

## lib/gang.js additions

### `getMaxRivalPower(ns)`
Reads `getAllGangInformation()`, returns the highest power across all rival gangs (our own excluded). Rival power ticks up on every global territory tick regardless of what our members are doing — used as the cadence signal with no earnings warm-up.

### `class WarfareTicker`
Stateful period/phase detector. Call `observe(rivalPower)` once per gang tick. After 2 rival-power changes it knows the period; `isNextTickWarfare()` returns a plain `boolean` predicting whether the upcoming `nextUpdate()` will resolve a warfare tick.

- Uses mode of the last 5 observed gaps for noise resilience
- `ready` is false until calibrated → safe fallback (flash every tick)
- `period` — inferred territory-tick period in gang-ticks
- `countdown` — gang-ticks until the next warfare tick (1 = next tick IS warfare)
- `lastTickWasWarfare` — true if the most recent `observe()` detected a rival-power change

---

## engine-v2-the-boys.js

### State machine (cortex pattern)
| State | Condition | Task |
|---|---|---|
| `STATE_VIGILANTE` | member in vigilanteSquad | Vigilante Justice |
| `STATE_TRAIN_BOTTOM` | score < 600 OR weakest-N at full capacity | Train Combat |
| `STATE_RECRUIT_PUSH` | not full capacity AND score >= 200 | score ladder (Mug → HT) |
| `STATE_EARN` | always (fallback) | Human Trafficking |

### `#computeContext()`
Calls `ticker.observe(getMaxRivalPower(ns))` each tick to track the cadence. Pushes a history snapshot with corrected `isWarfareTick` (rival-power change, not just "clashes engaged").

### `#advance(ctx)` — warfare-aware flashMob
Fires **only** when:
- Gang is at full capacity, AND
- `ticker.isNextTickWarfare()` is true OR `!ticker.ready` (safe degrade during warm-up)

Members assigned to `"Territory Warfare"` revert automatically on the next tick via `#process()` — no explicit revert needed.

### Dashboard — new "Warfare" line
```
Warfare   P=10  in  3  waiting
Warfare   P=10  in  1  FLASH NEXT      ← green highlight
Warfare   learning (4 ticks)...        ← during warm-up
```
Also adds a `STATE` column to the per-member table, and the `warfare` sparkline now shows the true global cadence (not just "clashes on").

### Supporting machinery (ported from combat-gang)
- Vigilante hysteresis controller (`#updateVigilanteSize`)
- Clash toggle with hysteresis: ON ≥ 55% min win, OFF < 50%
- Ascend/equip pipeline per member
- `recruit()` loop, `renameMembers()` on start

---

## Verification (in-game)

1. Start `./bitburner-go-filesync`, connect the game
2. Stop `engine-v2-combat-gang.js` first (only one gang exists)
3. `run engine-v2-the-boys.js`
4. Watch the `warfare` sparkline + "Warfare" line: `period` should stabilize and `countdown` should hit 0 exactly when the sparkline marks a `█` (rival power jumped)
5. Once `ready`: confirm flashMob fires only on predicted warfare ticks (members flip to Territory Warfare for that tick, back to HT next tick)
6. Before `ready`: confirm it flash-mobs every tick at full capacity (safe fallback)
