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

## Milestone 5 — Persistence and replay (`in progress`)

- Implement SQLite migrations and transactional repositories for events, snapshots, decisions,
  mastery, drills, reviews, export/import/reset, replay, and nondestructive branching.
- Acceptance: restart/resume, hash verification, corruption fallback, and export/import round trip.

## Milestone 6 — CLI and JSONL protocol (`pending`)

- Implement all required human commands, ANSI/plain/narrow rendering, schema-versioned JSONL stdio,
  external-process player validation, timeout handling, and deterministic bot fallback.
- Acceptance: scripted JSONL hand, clean stdout, structured rejection, and safe fallback.

## Milestone 7 — Local server and visual table (`pending`)

- Implement the required HTTP/WebSocket API, setup/home/table/result screens, local SVG tile set,
  legal-action controls, save/resume, responsive layout, and keyboard operation.
- Acceptance: seeded hand in browser, observation parity, and keyboard smoke test.

Experimental continuous head-motion prototype evidence recorded 2026-08-09 (does not complete Milestone 7):

- A typed shared controller now covers momentum locomotion, full/fallback jumping, slide, low vault, ledge grab,
  wall contact/climb, traversal cancellation/completion, and landing recovery while physics retains capsule authority.
- The central camera damper consumes resolved velocity and clearance, then drives the camera, held viewmodel, moving
  reticle, aim ray, and focus ray. Full-O₂ stationary presentation is zero, standing/crouching remain free, and local
  action impulses publish one coherent post-action render snapshot.
- The hard-cut schema-v2 simulator contains the required 21 unique-seed scenarios, including successful wall-climb top
  support and separate climb-release cancellation. Each result is serialized twice through the CLI writer and must be
  byte-identical with no failed embedded assertion. The final pre-commit audit candidate passed 42 runs and 310
  assertions with zero byte mismatches.
- Repository formatting, full lint, strict typecheck, the production build, and `git diff --check` pass. Server-owned
  clean test-bus run `1786263732647-95115-730879b5` matched code/test candidate
  `cb89667ba8b2188634cab8e6fe121ec90f10a963` and passed all 639 tests across 136 suites. The external handoff records
  the matching clean receipt for the final documentation commit as well.
  Browser, HMR, Playwright, and computer-use validation are excluded from this implementation run. The user must still
  complete the real one-window browser acceptance, so the visual-table milestone remains pending.

## Milestone 8 — Teacher, learner model, curriculum, and drills (`pending`)

- Implement analysis facts, calibrated templates, modes/hints, post-hand review, mastery/evidence
  queries, adaptive difficulty, spaced repetition, and all 14 required drill types.
- Acceptance: fully offline coaching, persistent evidence, and relevant weak-concept scheduling.

## Milestone 9 — Optional OpenAI narrator (`pending`)

- Implement a server-only Responses API adapter, schema/fact/action validation, bounded request
  behavior, cache/metadata, provider status, and immediate template fallback.
- Acceptance: fake-provider tests, invalid-output fallback, no browser key exposure, no-key usability.

## Milestone 10 — Replay UI, accessibility, documentation, and release gates (`pending`)

- Implement replay timeline/branch comparison, rules/glossary/settings/curriculum screens, WCAG 2.2
  AA behavior, responsive polish, seeded demos, complete docs, screenshots, and data controls.
- Acceptance: critical Playwright flows, 10,000-hand simulation, coverage gates, `pnpm verify`,
  production start, and smoke test.

## Final evidence audit

- Prove every item in spec sections 27 and 28 on the exact canonical state.
- Record test totals, coverage, simulation count, database path, ruleset assumptions, limitations,
  reviewed files, hidden-information result, and exact production proof in `implementation.md`.
