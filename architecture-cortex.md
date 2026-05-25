# CortexEngine — State Machine

Each tick the engine walks `STATES_ORDER` top-to-bottom and runs the **first** state whose condition is true. Only one state executes per tick.

```mermaid
flowchart TD
    TICK(["⟳ Each tick (loop-delay-cortex seconds)"])

    TICK --> J{"Pending faction\ninvitations?"}
    J -->|yes| JOIN["**JOIN-FACTION**\nJoin all pending factions"]
    J -->|no| B{"TOR not owned + affordable\nOR any buyable program\nunowned + affordable?"}

    B -->|yes| BUY["**BUY-PROGRAMS**\nPurchase TOR router\n+ darkweb programs"]
    B -->|no| H1{"hack < targetHackInitial\n(default 100)?"}

    H1 -->|yes| TH1["**TRAIN-HACK-INITIAL**\nStudy Computer Science\nat local/Volhaven uni"]
    H1 -->|no| BD{"Un-backdoored target exists\nAND hack ≥ server req?\n(CSEC, avmnite-02h, I.I.I.I,\nrun4theh111z, powerhouse-fitness,\nw0r1d_d43m0n)"}

    BD -->|yes| BACK["**BACKDOOR**\nConnect + install backdoor\non next eligible server"]
    BD -->|no| TC{"Any of str / def / dex / agi\n< target (default 165 each)?"}

    TC -->|yes| TCOM["**TRAIN-COMBAT**\nGym workout at Powerhouse Gym\n(travels to Sector-12 if needed)\nTrains lowest stat first"]
    TC -->|no| CHA{"cha < targetCha\n(default 100)?"}

    CHA -->|yes| TCHA["**TRAIN-CHA**\nStudy Leadership\nat local/Volhaven uni"]
    CHA -->|no| RT{"money > $10M\nAND random 50% chance?"}

    RT -->|yes| TRAVEL["**RANDOM-TRAVEL**\nTravel to a random city\n(prevents city-lock side effects)"]
    RT -->|no| CP{"Currently creating a program\nOR creatable program exists\nwith hack req met?"}

    CP -->|yes| CREATE["**CREATE-PROG**\nCreate next eligible program\n(AutoLink, ServerProfiler, DeepscanV1)"]
    CP -->|no| HOM{"karma > −54 000?"}

    HOM -->|yes| HOMICIDE["**HOMICIDE**\nCommit homicide\n(builds karma toward gang unlock)"]
    HOM -->|no| HACK["**TRAIN-HACK** ← fallback (always runs)\nStudy Computer Science\nat local/Volhaven uni"]
```

## State reference

| Priority | State | Condition | Action |
|---|---|---|---|
| 1 | JOIN-FACTION | Faction invitations pending | Join all factions |
| 2 | BUY-PROGRAMS | TOR affordable OR buyable program affordable | Buy TOR + programs via darkweb |
| 3 | TRAIN-HACK-INITIAL | `hack < targetHackInitial` (100) | Study Computer Science |
| 4 | BACKDOOR | Un-backdoored target reachable at current hack | Install backdoor on target |
| 5 | TRAIN-COMBAT | Any of str/def/dex/agi below target (165 each) | Gym — trains lowest stat first |
| 6 | TRAIN-CHA | `cha < targetCha` (100) | Study Leadership |
| 7 | RANDOM-TRAVEL | money > $10M AND 50% random roll | Travel to a random city |
| 8 | CREATE-PROG | Creatable program exists at current hack level | Create program (AutoLink, ServerProfiler, DeepscanV1) |
| 9 | HOMICIDE | `karma > −54 000` | Commit homicide to build karma |
| 10 | TRAIN-HACK | Always true (fallback) | Study Computer Science |

## Config keys

| Key | Default | Used by |
|---|---|---|
| `cortex-target-hack-initial` | 100 | TRAIN-HACK-INITIAL |
| `cortex-target-combat` | `"165,165,165,165"` | TRAIN-COMBAT (str,def,dex,agi) |
| `cortex-target-cha` | 100 | TRAIN-CHA |
| `loop-delay-cortex` | 10s | Main loop sleep between ticks |
