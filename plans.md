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

## Milestone 2 — Core hand state machine (`in progress`)

- Implement event-sourced dealing, bonus replacement, draws, discards, hidden claim windows,
  chow/pung/kong/win resolution, robbery, exhaustive draws, match progression, action IDs,
  observations, revision/idempotency safety, invariants, and replay hashes.
- Acceptance: all seeded core scenarios, conservation properties, redaction, and replay equivalence.

## Milestone 3 — Solver, scoring, and payments (`pending`)

- Implement standard and special solvers, all bundled rules, suppression/stacking, minimum-faan
  rejection, highest decomposition selection, and payment strategies.
- Acceptance: at least 75 readable golden fixtures with positive and near-miss coverage.

## Milestone 4 — Analysis and bots (`pending`)

- Implement distance, improving tiles, visible availability, faan paths, relative risk, deterministic
  ranking/rollouts, four strengths, three personalities, and adaptive selection.
- Acceptance: observation-only bots, deterministic candidates, 500-hand fast simulation.

## Milestone 5 — Persistence and replay (`pending`)

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
