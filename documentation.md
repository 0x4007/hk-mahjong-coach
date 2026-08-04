# Architecture and implementation log

## 2026-08-02 — Repository initialization

- The repository was empty, so the existing `main` checkout is the canonical implementation lane.
- The runtime baseline is Node 24 LTS and pnpm 11.
- TypeScript 6.0 is pinned because the current `typescript-eslint` peer range excludes TypeScript 7.
- `better-sqlite3` is selected for stable synchronous transactions and mature Node 24 support.
- Workspace packages follow the dependency direction in `spec.md`; the root TypeScript path map is
  for development and tests, while package production exports point to built ESM artifacts.
- The server binds to `127.0.0.1`; the browser and API share one production origin.
- Compact tile codes are explicit, case-sensitive project display aliases; semantic IDs remain
  authoritative because MPS notation is not universal across mahjong variants.
- The canonical hash format is `sha256:<lowercase hex>`. Ruleset hashes cover validated,
  bonus-resolved, deeply frozen data and include `scoringEvaluatorVersion`.
- `rulesets/ruleset.schema.json` is generated from the runtime Zod schema by
  `pnpm rulesets:generate`; the generator materializes complete alternate profiles and applies the
  repository's formatting rules.

## 2026-08-02 — Versioned Hong Kong rules assumptions

- Seat bonus mapping is East/South/West/North → Plum/Orchid/Chrysanthemum/Bamboo and
  Spring/Summer/Autumn/Winter.
- The Hong Kong mahjong reading for 筒 is stored as Jyutping `tung4`.
- Four Concealed Pungs requires four concealed pungs, no declared kong, and self-draw.
- Nine Gates uses the strict pure nine-sided predecessor and permits no declared meld or kong.
- Thirteen Orphans does not require a thirteen-sided wait.
- Jade/Ruby/Pearl Dragon require three matching-suit pungs or kongs, the matching Dragon pung or
  kong, and a matching-suit pair; chows do not qualify.
- Heavenly Hand permits initial bonus replacements but no opening kong.
- Earthly Hand means a non-dealer win on East's first discard after initial replacements and before
  any kong or other call.
- Limit aggregation caps once while listing all matched limit features and suppresses lower-value
  composition rules.
- In `hk_modern_13f_v1`, unlisted former limit patterns are explicitly stored as 10 faan; only the
  four patterns named as 13/limit in `spec.md` use the 13-faan cap. There is no runtime inheritance.

## 2026-08-02 — Event, scoring, and payment boundaries

- Commands emit immutable authoritative events; reducers validate persisted facts and never invoke
  the scorer or payment settlement during replay.
- Claim windows persist each eligible player's complete scoring assessment. This preserves
  first-discard, last-tile, kong-robbery, bonus-replacement, and opening-kong provenance even after
  later state fields change.
- Legal actions contain only scoring previews. Terminal authoritative events contain full scoring
  and payments; public projection uses an explicit allowlist, converts the winning physical ID to a
  tile type, and removes evaluator evidence.
- Every scoring decomposition is evaluated. Selection prefers legal over illegal, then capped faan,
  raw faan, and canonical decomposition order.
- `stackingGroup` is metadata unless a rule explicitly references it. True limits are only rules
  whose configured value is `limit`; multiple true limits are listed while the cap is aggregated
  once.
- Dealer multipliers are applied once. Co-winners are excluded from payer sets, arithmetic is
  checked as safe integers, and every persisted settlement is exactly zero-sum.

## 2026-08-03 — Observation-only analysis and bot simulation

- The public analysis package exposes observation-derived analyzers and result types, not raw
  physical-tile entry points. Low-level distance, path, and visibility helpers remain package
  internals for focused tests and composition inside the official analyzer.
- Bot construction accepts a resolved ruleset rather than an injected analyzer. The bot package
  creates the official analyzer itself, preventing a composition root from supplying an analyzer
  that closes over authoritative state. Static import restrictions and type tests keep normal
  analysis/bot sources on `@hk-mahjong/core/public`.
- Relative-risk language remains comparative. The heuristic combines visible copies, exposed suit
  and honor direction, publicly established faan, the order of recent public discards, fresh late
  honors/middle tiles, and wall count; prior discards never become a guaranteed-safety claim.
- Adaptive difficulty chooses a fixed ordinary strength from evidence and locks that choice to one
  hand. Only a `hand_ended` or `match_ended` observation may release the lock. Product persistence
  and mode wiring remain part of Milestone 8.
- Basic bot discard ordering keeps distance primary, then uses the already computed
  personality-weighted candidate score. This preserves the basic difficulty boundary while allowing
  fast, value, and balanced policies to diverge deterministically on equal-distance decisions.
- The fast simulation uses normal `BotPolicy` decisions throughout. To remain a practical 500-hand
  gate, it mixes three full seeded shuffled-wall hands (one for each bundled ruleset) with a seeded
  terminal regression wall where South has a thirteen-sided Thirteen Orphans wait and East has no
  initial win. The terminal wall never selects a bot action; it shuffles its unused tail with the
  injected RNG, and every policy must still rank an emitted action. The receipt identifies the wall
  profiles separately so the short corpus cannot be mistaken for 500 natural-length hands.
- Each simulated one-wind match is capped at 32 hands, each hand at 1,024 accepted commands, and the
  runner fails on rejection, conservation error, crash, bound excess, or replay mismatch. The full
  10,000-hand and broader release evidence remain Milestone 10 gates.
- The extended natural-wall gate is prepared in `.github/workflows/natural-simulation.yml` as a
  manual `workflow_dispatch`. It partitions the requested corpus across up to 20 deterministic
  shards, runs unchanged normal policies with `natural_shuffle` walls, uploads redacted shard
  receipts, and verifies one aggregate digest. A one-hand local shard/aggregate smoke passed with
  aggregate digest
  `sha256:fbb7aa9f24c57aa9143a783ef731352df382db7610386c59b7589bd3ae30ad8c`.
  The interrupted local natural run is not 500-hand acceptance evidence; the first accepted
  500-hand receipt must come from the remote workflow after the implementation commit is pushed.

## 2026-08-03 — Canonical takeover and Milestone 4 reconciliation

- The canonical continuation lane is
  `.codex-worktrees/implementation-takeover-019fc5b7-g06506cba54` on branch
  `implementation-takeover-019fc5b7-g06506cba54`, based at
  `b3d5946ce9d69efebd361433f00b988ea658a600`.
- The pre-existing dirty `main` checkout and `natural-simulation-ci-g6bdbe4486d` worktree remain
  preserved. Canonical integrated the natural lane's workflow plus its shard/common/aggregate
  helpers. It rejected two unrelated `matchIndexOffset` runner variants because that workflow does
  not consume them and no focused test covers them.
- On the corrected canonical candidate, `pnpm test` passes 274 tests. `pnpm test:sim:fast` completes
  500 hands with zero illegal actions, invariant failures, crashes, command-bound failures, or
  replay mismatches. Its receipt digest is
  `sha256:1073e8769314772f57d8880e11fa710d2889730d7f1eff8db0fedebc79533352`,
  and its hand digest root is
  `sha256:219b345c5c8795d1668f7dc975e03cb26c1cc1e7674c7d9fa67bf188eaa7b284`.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm smoke` also pass.

## 2026-08-03 — Milestone 5 persistence and replay checkpoint

- The scoring corpus is now a literal 75-row fixture table: 34 bundled rules each have a positive
  and near-miss row, plus seven interaction rows with static expected decompositions, breakdowns,
  minimum-faan results, and payments.
- Persistence schema version 4 validates a contiguous migration ledger and stores the exact resolved
  ruleset definition plus immutable session bot/coach configuration hashes. Snapshots are verified
  against replayed event-chain and state hashes.
- Fresh-process restart/resume and abrupt process termination tests restore the exact state. A bad
  latest snapshot is skipped in favor of replay, and the recovered game can continue and export.
  Practice branches are immutable and duplicate branch requests remain idempotent after later child
  activity.
- Learner-owned decisions and reviews are bound to the owning game. When a request ID is supplied,
  decision evidence must match the accepted player/action/revision event batch; unrelated legal
  actions are rejected. Persisted imports apply the same ownership and completed-hand checks.
- Validation on the exact dirty SHA: 21 test files/328 tests, fresh coverage gates (persistence
  87.97% statements; coach 95.30%; protocol 100% statements/96.96% branches), 500-hand fast
  simulation with zero failures, production build, and smoke.

## 2026-08-04 — CLI, local web composition, and observation-driven 3D table

- The CLI now owns human rendering and a schema-versioned JSONL stdio host. Agent messages are
  sequence-checked and restricted to emitted legal action IDs; malformed/rejected input is reported
  as structured protocol errors and reaches a bounded deterministic fallback.
- The local Fastify server composes game, WebSocket, replay, hint, profile, curriculum, drill, and
  import/export routes. Playwright now starts the existing temporary-database fixture instead of the
  user database, so seeded E2E runs are isolated and repeatable.
- The browser uses the existing first-person Three.js penthouse scene for setup and active hands.
  `MahjongTableGameState` is derived from the redacted observation: the learner's face-up hand and
  drawn-tile spacing are exact; opponent hands expose only concealed counts and backs; public melds,
  discards, active-seat labels, and relative seat placement synchronize on every accepted action.
- The scene remains presentation-only for movement/camera; legal actions and game truth stay in the
  DOM observation overlay and authoritative session engine. WebGL is intentionally skipped in
  automation browsers whose SwiftShader renderer stalls; headed browsers mount the full scene.
- Validation on this dirty state: 338 unit/integration tests, 336 coverage tests, isolated seeded
  Playwright acceptance, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`,
  `pnpm smoke`, and `pnpm verify` pass.

## 2026-08-04 — Release simulation and local acceptance receipt

- The isolated CLI JSONL subprocess fixture proves schema-valid stdout, sequence monotonicity, the
  one-second action deadline, structured `external_agent_timeout`, and deterministic fallback after
  three timeouts.
- The release simulation completes 10,000 hands and 2,500 matches with zero illegal actions,
  invariant violations, crashes, command-bound failures, or replay mismatches. Run digest:
  `sha256:6ffd08d1a4fb79c97e08c1abee1a6d75ec33ce9d01ee728b2e5cecbd2daea19e`.
- Replay scrubbing, decision summaries, practice branch comparison, accessibility preferences, and
  local export/reset controls are wired into the browser. The first-person Three.js penthouse scene
  remains the presentation layer; the redacted observation and session controller remain
  authoritative.

## 2026-08-04 — Seeded rooms, rules glossary, and post-hand reveal

- `GET /api/demos` and `mahjong demos` expose the same ten deterministic teaching-room seeds. The
  home screen enters each room through the existing first-person Three.js table, so demos do not
  create a parallel game loop.
- `GET /api/rulesets/:id/details` supplies the active assumptions, kong/win switches, and every
  named scoring rule. The Rules view also renders all 42 local tile definitions with compact code,
  English, Traditional/Simplified Chinese, Jyutping, and pinyin labels.
- Replay accepts `omniscient=true` only through the session controller's terminal/sandbox gate.
  The response contains a separate, schema-validated view of concealed hands and wall positions;
  ordinary live replay remains redacted and returns `omniscient: null`.
- The isolated Playwright suite now covers the first-person setup, all ten seeded rooms, rules
  glossary, profile accessibility toggle, and drill answer flow in addition to the seeded action
  smoke.

## Commands

```bash
corepack enable
pnpm install
pnpm verify
pnpm dev
pnpm build
pnpm start
```

## Material deviations

- The scene uses procedural Three.js geometry and canvas tile textures rather than external SVG or
  photorealistic assets; this matches the local-first, non-photorealistic product boundary.
- The default browser automation path omits WebGL mounting when `navigator.webdriver` is true because
  the available SwiftShader renderer can stall. Semantic controls remain fully testable there.
- Seeded rooms are named deterministic seeds with teaching focus metadata, not bespoke scripted wall
  fixtures for every exact claim/kong/scoring scenario. The authoritative engine and test fixtures
  still cover those edge cases.

## Known limitations

- Milestones 0–10 are locally validated as a working prototype. The remote natural-wall receipt and
  live production provider/no-key attestation remain outside this checkout; screenshots and headed
  WebGL capture are optional visual evidence rather than correctness gates.
