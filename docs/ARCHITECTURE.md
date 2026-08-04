# Architecture

The dependency direction is:

```text
core → hk-rules → analysis → bots
core + hk-rules → persistence
core + hk-rules + analysis + bots + coach + persistence → session
session + protocol → CLI/server → web
```

`@hk-mahjong/core` is pure and authoritative. Commands produce immutable events; reducers and
replay validate event identity, conservation, state hashes, and ruleset provenance. The persistence
repository journals events, snapshots, command receipts, learner evidence, reviews, drills, and
versioned migrations in SQLite.

`SessionController` is the one composition boundary that owns authoritative state. CLI, HTTP,
WebSocket, and browser calls all submit the same protocol action IDs and receive the same redacted
observation. Analysis and bots accept observations and construct their own ruleset-bound analyzers.

The Three.js scene receives only `MahjongTableGameState`: the learner hand, public melds/discards,
seat labels, and concealed counts. It never receives wall order or an opponent tile identity. The
DOM overlay remains the keyboard and screen-reader action surface; movement and camera are
presentation concerns.
