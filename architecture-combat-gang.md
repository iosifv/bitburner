# CombatGangEngine — State Machine

Gang-tick-synced engine. Each cycle consists of a **processing phase** (compute → recruit → clashes → per-member) followed by a **flash-mob phase** (sleep → warfare burst → sync next tick).

---

## Main tick cycle

```mermaid
flowchart TD
    TICK(["⟳ Gang tick resolves\n(ns.gang.nextUpdate)"])

    TICK --> CTX["#computeContext\nRead gangInfo, members, infoMap\nRun vigilante controller → build vigilanteSquad\nBuild bottomCombat (lowest-N combat)\nRead win chances"]

    CTX --> REC{"Can recruit\na new member?"}
    REC -->|yes| RECRUIT["recruit()\nAdd member from NAMES roster"]
    REC -->|no| CLASH
    RECRUIT --> CLASH

    CLASH{"minWin vs clash thresholds?"}
    CLASH -->|"OFF + minWin ≥ 0.55"| CON["Enable territory clashes"]
    CLASH -->|"ON + minWin < 0.50"| COFF["Disable territory clashes"]
    CLASH -->|no change| MEMBERS
    CON --> MEMBERS
    COFF --> MEMBERS

    MEMBERS["For each member → #process\n(see per-member pipeline)"]
    MEMBERS --> STATUS["#printStatus\nLog STATUS / TASKS / WANTED / BOTTOM / TICK"]
    STATUS --> FLASH

    FLASH["#flashMob\nsleep(tickDurationMs − margin − elapsed)"]
    FLASH --> WAR["Assign Territory Warfare\nto all non-squad, non-underdefended members"]
    WAR --> SYNC["await ns.gang.nextUpdate()\nRecord tickStartTime"]
    SYNC --> TICK
```

---

## Per-member pipeline (`#process`)

Runs for every member each tick. Ascension short-circuits the rest.

```mermaid
flowchart TD
    M(["Member"])

    M --> ASC{"getAscensionResult ≥\nascensionThreshold (1.4)\non any stat?"}
    ASC -->|yes| ASCEND["ASCEND\nns.gang.ascendMember\n(skip equip + task this tick — info is stale)"]
    ASC -->|no| EQ

    EQ{"buyEquipment = true\nAND next ascension result\n< threshold − margin (1.25)?"}
    EQ -->|yes| EQUIP["Buy all affordable\nWeapon / Armor / Vehicle / Augmentation\nnot yet owned"]
    EQ -->|no| V
    EQUIP --> V

    V{"vigilanteSquad.has(member)?\n(highest-combat members,\nsized by adaptive controller)"}
    V -->|yes| VIG["**VIGILANTE**\nVigilante Justice\n(reduce wanted level)"]
    V -->|no| TB

    TB{"bottomCombat.has(member)?\n(lowest trainBottomN members\nby combat score)"}
    TB -->|yes| TRAIN["**TRAIN-BOTTOM**\nTrain Combat"]
    TB -->|no| RS

    RS{"!wantMoney\nAND score ≥ 200\nAND respect < terrorismRespectFloor?"}
    RS -->|yes| HT["**RESPECT**\nHuman Trafficking\n(build respect toward terrorism floor)"]
    RS -->|no| ML

    ML["**MONEY** ← fallback (always runs)\nScore-based task ladder\n(see below)"]
```

---

## MONEY task ladder

```mermaid
flowchart TD
    SCORE(["combatScore = str + def + dex + agi"])

    SCORE --> S1{"score < 600?"}
    S1 -->|yes| MUG["Mug People"]
    S1 -->|no| S2{"score < 1500?"}
    S2 -->|yes| ROB["Armed Robbery"]
    S2 -->|no| S3{"score < 3000?"}
    S3 -->|yes| ARMS["Traffick Illegal Arms"]
    S3 -->|no| S4{"!wantMoney\nAND respect ≥\nterrorismRespectFloor?"}
    S4 -->|yes| TER["Terrorism"]
    S4 -->|no| ARMS2["Traffick Illegal Arms"]
```

---

## Vigilante controller (`#updateVigilanteSize`)

Runs every tick inside `#computeContext`. Sizes the suppression squad by feedback — no config needed beyond `gang-wanted-penalty-threshold`.

```mermaid
flowchart TD
    C(["gangInfo.wantedLevel\ngangInfo.wantedPenalty"])

    C --> FL{"wantedLevel ≤ 1.01\n(structural floor)\nOR penalty ≥ 0.99?"}
    FL -->|yes| DEC["vigilanteSize − 1\n(wind down toward 0)"]
    FL -->|no| TR{"penalty < triggerEff\n(1 − wantedPenaltyThreshold)\ndefault < 0.90?"}

    TR -->|no| HOLD["Hold current size\n(hysteresis band 0.90–0.99)"]
    TR -->|yes| Z{"vigilanteSize == 0?"}
    Z -->|yes| KICK["vigilanteSize = 1\n(kickstart)"]
    Z -->|no| RISE{"wantedLevel rising\nvs previous tick?"}
    RISE -->|yes| GROW["vigilanteSize + 1\n(up to memberCount)"]
    RISE -->|no| HOLD2["Hold current size\n(wanted falling or steady)"]

    DEC --> SAVE["prevWanted = wantedLevel"]
    HOLD --> SAVE
    KICK --> SAVE
    GROW --> SAVE
    HOLD2 --> SAVE

    SAVE --> SQUAD["Build vigilanteSquad\n= top-vigilanteSize members\nby combat score (highest first)"]
```

---

## Flash-mob timing

The flash-mob fires members into Territory Warfare for the final `margin` ms of each gang tick, maximising the territory-gain window without disrupting the steady-state task assignment.

```
Gang tick boundary ────────────────────────────────────────┤
                    │← tickDurationMs − margin − elapsed →│← margin →│
                    [  processing: computeContext + process + status  ][warfare burst][next tick]
                              elapsed                         sleep
```

Members skipped from warfare burst:
- In `vigilanteSquad` (keep suppressing wanted)
- Clashes are ON **and** `def < clashMinDefense` (300) — too weak to survive a clash

---

## State reference

### Per-member task states (priority order)

| Priority | State | Condition | Task assigned |
|---|---|---|---|
| 1 | VIGILANTE | Member in `vigilanteSquad` (adaptive controller) | Vigilante Justice |
| 2 | TRAIN-BOTTOM | Member in `bottomCombat` (lowest `trainBottomN` by score) | Train Combat |
| 3 | RESPECT | `!wantMoney` AND `score ≥ 200` AND `respect < terrorismRespectFloor` | Human Trafficking |
| 4 | MONEY | Always (fallback) | Score ladder → Mug / Armed Robbery / Traffick / Terrorism |

### Global decisions (once per tick)

| Decision | Condition | Action |
|---|---|---|
| Recruit | `canRecruitMember()` | Add next name from NAMES roster |
| Clash ON | Clashes OFF AND `minWin ≥ clashEnableWinChance` | `setTerritoryWarfare(true)` |
| Clash OFF | Clashes ON AND `minWin < clashDisableWinChance` | `setTerritoryWarfare(false)` |
| Ascend | Any `getAscensionResult` stat ≥ `ascensionThreshold` | Ascend member (skips equip+task) |
| Equip | `buyEquipment` AND next asc result `< threshold − margin` | Buy all affordable gear |
| Flash-mob | Every tick, end of cycle | Territory Warfare burst for non-squad members |

## Config keys

| Key | Default | Used by |
|---|---|---|
| `gang-respect-threshold` | 2000 (×1000) | `wantMoney` flag — switches goal from respect to money |
| `gang-ascension-threshold` | 1.4 | Ascend trigger + equip stop threshold |
| `gang-ascension-equip-margin` | 0.15 | Stop equipping when next asc result ≥ 1.25 |
| `gang-buy-equipment` | true | Gate on all equipment purchases |
| `gang-wanted-penalty-threshold` | 0.1 | Vigilante controller trigger (penalty < 0.90) |
| `gang-respect-floor-terrorism` | 100 (×1000) | Minimum respect before Terrorism is used |
| `gang-train-bottom-n` | 3 | How many weakest members train instead of earn |
| `gang-clash-enable-winchance` | 0.55 | Min win chance to turn clashes ON |
| `gang-clash-disable-winchance` | 0.50 | Win chance below which clashes turn OFF |
| `gang-clash-min-defense` | 300 | Min DEF to participate in warfare burst |
| `gang-flash-mob-margin-ms` | 250 | Lead time before tick to assign Territory Warfare |
