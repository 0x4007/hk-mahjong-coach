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
  manual `workflow_dispatch`. It validates the requested corpus once, partitions it across exactly
  128 deterministic shards while limiting concurrency to 20 free runners, runs unchanged normal
  policies with `natural_shuffle` walls and distinct shard seed namespaces, serializes overlapping
  manual runs, uploads redacted shard
  receipts (including the hidden `.ci` artifact paths), and verifies contiguous global hand coverage
  plus one aggregate digest. The shard
  artifact boundary is an explicit allowlist: raw events, physical tile IDs, and decision traces are
  excluded; the aggregator recomputes each deterministic run digest and rejects extra fields,
  malformed, duplicate, missing, or failed receipts. `tests/simulation-ci.test.ts` locks the 128-entry
  matrix, 20-runner cap, seed/offset partitioning, aggregate reproducibility, and tamper rejection.
  The interrupted local natural run is not acceptance evidence; the first accepted 500-hand receipt
  must come from the remote workflow after the implementation commit is pushed.

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

None.

## Known limitations

- Milestones 0–4 are complete. Milestones 5–10 remain pending.
- Persistence, protocol, coach, and tile UI package slices exist but have not yet been accepted as
  complete milestones or wired through the placeholder CLI, server, and browser clients.
