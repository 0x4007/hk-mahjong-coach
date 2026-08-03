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

## 2026-08-03 — Procedural Three.js visual table base

- The isolated `visual-table-gb9d082b587` worktree adds the first visible browser slice for the future
  table milestone. `apps/web/src/scene/mahjong-table.ts` owns the scene graph, camera presets, lights,
  tile meshes, local canvas textures, public discard rivers, and the Midtown window backdrop; the React
  wrapper only mounts and disposes it.
- The scene uses Three.js `0.185.1` directly with Vite. `RoundedBoxGeometry`, `OrbitControls`, and
  local `CanvasTexture` generation are the only rendering helpers. No downloaded model, HDRI, or tile
  art is bundled. Poly Haven and ambientCG remain possible future sources for clearly licensed wood,
  felt, or window materials, but they are not part of this prototype.
- The static composition follows the supplied visual contract: a bright, double-height penthouse shell
  with broad architectural whites, charcoal recesses, a restrained red floor direction line, pale cyan
  system seams, floor-to-ceiling glazing, and depth-compressed Midtown geometry. Camera buttons switch
  between the composed seat and overhead views; only the overhead view remains orbit-controlled.
- Tile bodies are warm ivory with crisp local face artwork; backs use an original charcoal, red, and cyan
  line treatment. Playing-field, shell, center, and seam surfaces are offset by explicit depth layers so
  they do not flicker from coplanar WebGL faces.
- The visual direction is original architectural futurism informed by the supplied Mirror's Edge-style
  principles: pale monolithic planes, dark voids, hard white daylight, and sparse red/cyan signals. No
  game assets, logos, or textures are copied from that title.
- The WebGL mount coalesces resize observations and ignores unchanged canvas dimensions, which avoids
  a resize-notification loop while the view is mounted. Shadows use the current `PCFShadowMap` API.
- The seat camera intentionally borrows familiar first-person game conventions: click-to-capture pointer
  lock, unrestricted vertical mouse look, WASD/arrow movement through the penthouse within room bounds,
  an Escape unlock, and an alternate orbit-controlled overhead lens.
- The seat lens uses a 90° standing FOV and transitions to 68° when Shift toggles a seated 1.45 eye height.
  Seated movement is half speed with slight momentum; Space makes a short jump. Directional sprites hide
  when seated, the centered reticule remains visible, and adaptive Bokeh focuses on the nearest non-overlay
  object under the aim ray.
- Pointer-lock state fades the instructional overlays while the scene is under direct control.
- The browser shell is a viewport-owned scene rather than a document card. It uses `100dvh` with
  minimal overlay controls so the table remains the primary surface on desktop and mobile.
- This is a rendering base, not Milestone 7 completion. It has no live WebSocket/game observation,
  legal-action controls, replay state, or persistence yet. The browser must continue to consume public
  observations when those surfaces are wired in; opponent hands must remain face-down until an engine
  event makes a tile public.

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

- Milestones 0–4 are complete. Milestone 5 is in progress; Milestones 6–10 remain pending.
- Persistence, protocol, coach, and tile UI package slices exist but have not yet been accepted as
  complete milestones or wired through the placeholder CLI, server, and browser clients.
- The persistence slice still needs deletion/privacy, recovery/export, migration, restart/resume,
  and coverage repairs before Milestone 5 can close.
