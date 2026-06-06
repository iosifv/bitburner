# Darknet Architecture

```mermaid
flowchart TD
    Engine["engine-v2-darknet.js\n(home)"]
    Tendril["dark-tendril.js\n(each node)"]
    Stasis["dark-stasis.js\n(storm-seed nodes only)"]
    Sniffer["engine-v2-sniffer.js\n(home, read-only UI)"]
    Ledger["darknet.json"]

    Engine -->|"scp + exec (spread / floodStale)"| Tendril
    Tendril -->|"scp + exec (propagate action)"| Tendril
    Tendril -->|"scp + exec (stasisLink action)"| Stasis

    Tendril -->|"port 666 — auth results, loot, heartbeats"| Engine
    Stasis  -->|"port 666 — stasisLinked result"| Engine

    Engine -->|"port 1666 — known secrets snapshot"| Tendril
    Engine -->|"port 667 — raw 666 tap"| Sniffer

    Engine -->|"writeLedger() every tick"| Ledger
```

## Key constraints

- **Port 666** is a drain-queue (consumed by the engine). Port **1666** and **667** are peek-able snapshots (never consumed by readers).
- **dark-stasis.js exists as a separate worker** because `ns.dnet.setStasisLink` costs ~12 GB RAM. Bitburner measures RAM statically from all `ns.*` references in a file — putting it inside the tendril would inflate every tendril's RAM and break propagation on small nodes.
- **darknet.json is wiped on engine start** — it is a persisted projection of the in-memory `nodeMap`, not a warm-start source. The `nodeMap` is always the live source of truth.
- **Secrets are brokered by the engine** — a tendril cracks a node cold and reports the secret on port 666; the engine republishes all known secrets on port 1666 every tick so other tendrils can authenticate without re-cracking.
