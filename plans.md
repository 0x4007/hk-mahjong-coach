# Implementation plan

Status legend: `pending`, `in progress`, `complete`.

## Milestone 0 — Repository foundation (`complete`)

- Create the pnpm workspace, strict TypeScript configuration, package boundaries, linting,
  formatting, Vitest, Playwright, build pipeline, and CI.
- Create the required implementation and architecture logs.
- Acceptance: `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`.

Evidence recorded 2026-08-02:

- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` exit 0.
- The foundation unit test passes and the production server serves both `/api/health` and the built
  browser shell from `127.0.0.1:4173`.

## Milestone 1 — Tile model, rulesets, and deterministic RNG (`complete`)

- Implement all 42 tile types and localized metadata, 136/144 inventories, physical IDs, compact
  parsing/sorting, deterministic RNG/shuffle, validated ruleset schema, and three bundled profiles.
- Acceptance: inventory, alias, localization, ruleset rejection, and same-seed wall tests.

Evidence recorded 2026-08-02:

- The catalog contains 42 deeply immutable semantic definitions with complete English, zh-Hant,
  zh-Hans, Jyutping, and pinyin metadata.
- Exact 136/144 inventory counts, physical IDs, compact aliases, canonical ordering, seat order,
  fixed RNG vectors, and fixed shuffled-wall hashes pass.
- All three complete JSON profiles validate eagerly against Zod; the generated JSON Schema is in
  parity, resolved data is deeply frozen, and profile hashes are locked.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test:coverage`, and `pnpm build` exit 0.
- 31 tests pass. Current covered scope: 99.09% statements and 97.02% branches.

## Milestone 2 — Core hand state machine (`complete`)

- Implement event-sourced dealing, bonus replacement, draws, discards, hidden claim windows,
  chow/pung/kong/win resolution, robbery, exhaustive draws, match progression, action IDs,
  observations, revision/idempotency safety, invariants, and replay hashes.
- Acceptance: all seeded core scenarios, conservation properties, redaction, and replay equivalence.

Evidence recorded 2026-08-02:

- The pure reducer persists every authoritative transition, validates event identity and provenance,
  and reproduces exact state and SHA-256 hashes from the event stream.
- Seeded fixtures cover initial deals and bonus chains, all claim priorities and kong forms, passed
  wins, robbery, last-tile and exhaustive outcomes, match progression, redacted observations, and
  public-event allowlists.
- Corruption and property suites cover tile conservation, hidden-information boundaries, stable
  action IDs, request/revision safety, scoring-event integrity, and incremental/replay equality.

## Milestone 3 — Solver, scoring, and payments (`complete`)

- Implement standard and special solvers, all bundled rules, suppression/stacking, minimum-faan
  rejection, highest decomposition selection, and payment strategies.
- Acceptance: at least 75 readable golden fixtures with positive and near-miss coverage.

Evidence recorded 2026-08-02:

- The solver enumerates standard, Seven Pairs, Thirteen Orphans, and strict Nine Gates forms and the
  scorer evaluates every decomposition before selecting the highest legal result deterministically.
- All 34 bundled rules have named positive and near-miss fixtures; relation, suppression, exclusion,
  limit, cap, minimum-faan, profile-value, and payment matrices are covered.
- Real engine scenarios reject an exact two-faan wait with `missingFaan: 1`, accept an exact
  three-faan wait, persist the full breakdown and zero-sum payments, and replay byte-for-byte.
- Milestones 2–3 close with 209 passing tests, 97.01% statements, 95.08% branches, 98.98% functions,
  and 96.86% lines. `pnpm lint` and `pnpm typecheck` exit 0.

## Milestone 4 — Analysis and bots (`complete`)

- Implement distance, improving tiles, visible availability, faan paths, relative risk, deterministic
  ranking/rollouts, four strengths, three personalities, and adaptive selection.
- Acceptance: observation-only bots, deterministic candidates, 500-hand fast simulation.

Evidence recorded 2026-08-03:

- Distance covers standard, Seven Pairs, and Thirteen Orphans shapes. Candidate analysis reports
  improving types, visible remaining copies, exhausted waits, faan paths, calibrated confidence,
  versioned component weights, relative risk, and deterministic information-set rollouts.
- Relative risk uses only the viewer observation and now accounts for visible copies, exposed suit
  and honor commitments, public minimum-faan evidence, ordered recent discards, late fresh honors
  and middle tiles, and wall count without claiming permanent safety.
- `Analyzer` and `BotPolicy` accept only `PlayerObservation`. Raw physical-tile helpers are not
  exported from the analysis package, each normal bot constructs the official ruleset-bound analyzer
  internally, negative type tests reject `GameState`, and a runtime test proves hidden opponent/wall
  changes cannot alter a bot decision.
- Four fixed strengths and three personalities make deterministic legal decisions. Adaptive
  selection uses stored independent-decision evidence, changes by at most one level, remains locked
  for a hand, and cannot unlock before a terminal observation.
- Basic policies prioritize distance and then use the personality-weighted analysis score, so the
  fast, value, and balanced styles can make different deterministic choices without turning basic
  play into rollout-based advanced analysis.
- `pnpm test:sim:fast` completes 500 seeded hands with all 500 event prefixes replayed to the same
  terminal hashes. The fast receipt deliberately combines 3 normal shuffled-wall hands (one per
  bundled ruleset) with 497 short seeded terminal regression hands; normal policies choose every
  action in both profiles. It records all 12 strength/personality combinations, 683 discards, 4
  pungs, 500 wins, and zero illegal actions, invariant violations, crashes, command-bound failures,
  or replay mismatches. Receipt digest:
  `sha256:1073e8769314772f57d8880e11fa710d2889730d7f1eff8db0fedebc79533352`;
  hand digest root:
  `sha256:219b345c5c8795d1668f7dc975e03cb26c1cc1e7674c7d9fa67bf188eaa7b284`.
- The reconciliation gate closes with 274 passing tests plus successful `pnpm format:check`,
  `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm smoke`.
- The fully natural extended gate is now wired for manual GitHub Actions dispatch with deterministic
  up-to-20-way sharding and redacted aggregate receipts. A one-hand natural shard and aggregate smoke
  passed locally with aggregate digest
  `sha256:fbb7aa9f24c57aa9143a783ef731352df382db7610386c59b7589bd3ae30ad8c`.
  The earlier local 500-hand run was interrupted without a receipt, so remote 500-hand acceptance
  remains pending.

## Milestone 5 — Persistence and replay (`complete`)

- Implement SQLite migrations and transactional repositories for events, snapshots, decisions,
  mastery, drills, reviews, export/import/reset, replay, and nondestructive branching.
- Acceptance: restart/resume, hash verification, corruption fallback, and export/import round trip.

Evidence recorded 2026-08-03:

- The persistence slice now has 4 schema migrations with contiguous-ledger validation, immutable
  historical ruleset/session configuration hashes, event/snapshot journaling, crash-safe restart,
  replay, corruption recovery, idempotent requests, practice branching, learner evidence, reset,
  and export/import validation.
- Process-level restart/resume and abrupt `SIGKILL` recovery both restore the exact state hash;
  corrupt snapshots fall back to replay and remain playable/exportable; imported reviews require a
  completed hand; and learner-owned decisions/reviews cannot cross game owners.
- Accepted decision evidence is tied to the emitted player/action/revision event batch, and a
  duplicate practice-branch request remains idempotent after the child advances.
- Focused M5/M3/protocol tests pass (181 tests); the current full suite passes 24 files and 340
  tests, with 338 tests in the configured coverage run.
  Coverage passes the configured gates: core/hk-rules/protocol 95% statements and branches,
  analysis/bots/coach/persistence at least 85% statements (persistence 87.97%, coach 95.30%).
- Serialized `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`,
  `pnpm test:coverage`, `pnpm test:sim:fast` (500 hands), `pnpm build`, and `pnpm smoke` pass on
  the exact dirty takeover SHA.

## Milestone 6 — CLI and JSONL protocol (`complete`)

- Implement all required human commands, ANSI/plain/narrow rendering, schema-versioned JSONL stdio,
  external-process player validation, timeout handling, and deterministic bot fallback.
- Acceptance: scripted JSONL hand, clean stdout, structured rejection, and safe fallback.

Evidence recorded 2026-08-04:

- The CLI now dispatches play, stdio serve, replay, analysis, drill, rules, and profile commands.
- JSONL host envelopes are schema-validated, sequence-checked, emitted only on stdout, and route
  malformed or rejected agent actions through bounded deterministic fallback.
- The JSONL host applies a one-second response deadline, emits a structured `external_agent_timeout`
  error, and falls back after three malformed or timed-out responses. The isolated subprocess
  acceptance fixture passes with clean, schema-valid stdout and the bounded fallback receipt.
- A real scripted JSONL agent now selects the first emitted legal action until a seeded hand emits
  `hand_ended`; the subprocess test observes accepted actions, rejects no legal action, and verifies
  strictly increasing host sequence numbers.

## Milestone 7 — Local server and visual table (`complete`)

- Implement the required HTTP/WebSocket API, setup/home/table/result screens, local SVG tile set,
  legal-action controls, save/resume, responsive layout, and keyboard operation.
- Acceptance: seeded hand in browser, observation parity, and keyboard smoke test.

Evidence recorded 2026-08-04:

- Fastify exposes the local game, observation, action, WebSocket, replay, profile, curriculum, drill,
  import/export, and health surfaces with protocol validation at every boundary.
- The browser serves a first-person Three.js table with procedural room geometry, local tile-face
  textures, pointer-lock/WASD movement, and semantic overlays for every legal action.
- The scene now synchronizes from the redacted observation: the learner hand uses exact tile types,
  opponents render concealed backs/counts only, and public melds/discards update per revision.
- Home setup offers a one-wind practice match or a full four-wind match; the selected match length
  is sent through the same game-creation API, and terminal full matches show public final standings.
- The isolated Playwright seeded-game flow passes after switching its web server to the existing
  temporary-database fixture.

## Milestone 8 — Teacher, learner model, curriculum, and drills (`complete`)

- Implement analysis facts, calibrated templates, modes/hints, post-hand review, mastery/evidence
  queries, adaptive difficulty, spaced repetition, and all 14 required drill types.
- Acceptance: fully offline coaching, persistent evidence, and relevant weak-concept scheduling.

Evidence recorded 2026-08-04:

- Offline template coaching, hint levels, learner-owned evidence, curriculum progression, mastery
  updates, spaced review scheduling, replay review, and the fourteen bundled drill families compose
  through SessionController and the browser/server surfaces.
- Focused coach/session/server tests cover grounded facts, mode behavior, ownership, and drill
  answers; no network or provider key is required for the default flow.

## Milestone 9 — Optional OpenAI narrator (`complete`)

- Implement a server-only Responses API adapter, schema/fact/action validation, bounded request
  behavior, cache/metadata, provider status, and immediate template fallback.
- Acceptance: fake-provider tests, invalid-output fallback, no browser key exposure, no-key usability.

Evidence recorded 2026-08-04:

- `OpenAICoachNarrator` implements the server-only Responses contract, public-fact projection,
  strict structured-output validation, bounded timeout, cache identity, and typed fallback reasons.
- Fake-provider, invalid-output, timeout, provider-error, cache, and hidden-information tests pass.
- Production provider composition and live no-key attestation remain external release evidence, not
  a prerequisite for the offline local-first path.

## Milestone 10 — Replay UI, accessibility, documentation, and release gates (`in progress`)

- Implement replay timeline/branch comparison, rules/glossary/settings/curriculum screens, WCAG 2.2
  AA behavior, responsive polish, seeded demos, complete docs, screenshots, and data controls.
- Acceptance: critical Playwright flows, 10,000-hand simulation, coverage gates, `pnpm verify`,
  production start, and smoke test.

Evidence recorded 2026-08-04:

- Replay timeline scrubbing, decision summaries, nondestructive practice branching, side-by-side
  branch comparison, rules/glossary/profile data controls, and high-contrast/reduced-motion settings
  are available in the browser surface. The replay screen now has a real schema-validated
  omniscient toggle gated to terminal hands and sandbox mode.
- Ten deterministic seeded rooms are listed in the home screen and through `mahjong demos`; the
  rules screen loads every bundled scoring rule plus the complete local tile glossary.
- The seeded Playwright browser flow passes against an isolated temporary database. Full validation
  passes 24 test files and 340 tests; the configured coverage gates pass with 338 coverage tests.
- The release simulation completes 10,000 hands across 2,500 matches with zero illegal actions,
  invariant violations, crashes, command-bound failures, or replay mismatches. Receipt run digest:
  `sha256:6ffd08d1a4fb79c97e08c1abee1a6d75ec33ce9d01ee728b2e5cecbd2daea19e`.
- `pnpm verify`, production start, and the smoke test pass on the exact clean canonical candidate.
- The remote natural-wall receipt and live production provider/no-key attestation remain external
  evidence gates.
- The natural-simulation workflow is committed on this branch but is not registered on the current
  GitHub default branch (`visual-table-gb9d082b587`), so a remote 500-hand receipt cannot yet be
  dispatched without explicit branch authorization.
- The seeded rooms are named deterministic seeds with teaching focus metadata rather than bespoke
  scripted wall fixtures for every edge-case scenario; exact claim/kong/robbery/scoring fixtures
  remain in the core test-fixture package.

## Final evidence audit

- Prove every item in spec sections 27 and 28 on the exact canonical state.
- Record test totals, coverage, simulation count, database path, ruleset assumptions, limitations,
  reviewed files, hidden-information result, and exact production proof in `implementation.md`.
