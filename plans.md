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
- Focused M5/M3/protocol tests pass (181 tests); the full suite passes 21 files and 328 tests.
  Coverage passes the configured gates: core/hk-rules/protocol 95% statements and branches,
  analysis/bots/coach/persistence at least 85% statements (persistence 87.97%, coach 95.30%).
- Serialized `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`,
  `pnpm test:coverage`, `pnpm test:sim:fast` (500 hands), `pnpm build`, and `pnpm smoke` pass on
  the exact dirty takeover SHA.

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

## FPS Slayer readiness handoff addendum — 2026-08-07

This lane is additive to the local mahjong implementation plan and follows
`docs/multiplayer-fps-slayer-readiness-handoff.md`.

- Local authority, avatar visibility, two-client browser lifecycle, deterministic reconciliation,
  replay/checkpoint persistence, local load, and artifact manifest evidence are complete on the
  intentionally dirty `multiplayer-spec-g1aba1b1f8d` worktree.
- The local abuse/network-boundary gate is now complete with `pnpm test:fps:abuse`; it covers flood,
  ticket, frame, clock, rate, duplicate-socket, and full-resync behavior.
- The deterministic local network-fault gate is complete with `pnpm test:fps:network`; privacy-safe
  operational diagnostics now include phase, persistence, and combat-event counters.
- Named Cloudflare Tunnel/public-edge acceptance, production anti-cheat/privacy operations, packet
  loss and clock skew through the public edge, and an external rollback drill remain pending. Do not
  mark the FPS prototype competitive-ready until those gates pass on one frozen build.
- Solo AI competitor slice: a room may request up to seven deterministic server-owned rivals. Each
  rival is a normal `FpsMatch` player with shared movement, weapon, vitals, damage, death, respawn,
  score, and replay behavior. The browser exposes a `Play against AI rival` entry point.
- Acceptance: focused FPS unit/protocol/service tests, production build, and the rendered solo-AI
  Playwright flow pass on the real HTTP/WebSocket path. The complete four-test `pnpm test:e2e`
  suite and the current post-AI eight-client browser soak also pass; named-edge, public-edge,
  production anti-cheat/privacy, and rollback gates remain pending.

### FPS local load-budget repair — 2026-08-07

- The fixed-step scheduler now avoids a per-tick public-state allocation, and persistence checks
  thresholds before exporting a checkpoint. This closes the isolated local simulation-overrun gate
  without changing the public FPS protocol or replay contract.
- The rebuilt authority, abuse, deterministic-network, load, and four-scenario browser gates pass.
- The fresh eight-client soak held for `602.116 s` with maximum tick `9.367 ms`, zero overruns,
  zero resync/snapshot/persistence/replay failures, and receipt SHA-256
  `2793c3e5ae811bf3ef4f3e9f24bb2c9afe82caec6bd4bcc820552a587af7468a`.
- The full unit suite passes 559 tests across 46 files. Full repository lint remains blocked by
  unrelated rebased visual-table/movement diagnostics (86 errors reproduced against the current
  base). Named-edge, production anti-cheat/privacy, and rollback gates remain open; readiness stays
  “not ready for competitive play”.

### FPS avatar presentation and current validation — 2026-08-07

- Added the explicit local world-avatar/first-person-viewmodel split, seven-mesh fallback mannequin,
  named sockets, first-person body-layer policy, world-space authoritative weapon, fire/death pose,
  and local/remote canvas diagnostics.
- Focused avatar tests pass 4/4; the full unit suite passes 561 tests across 46 files. Typecheck and
  format-check pass. Focused avatar lint passes; full repository lint still reports 86 unrelated
  visual-table/movement diagnostics.
- The complete four-scenario Playwright suite passes on the built HTTP/WebSocket path. Current
  rendered evidence includes first-person, third-person, reload, death, respawn, and solo-AI
  screenshots in `test-results/`; the current sample is 77 frames with 30 draw calls and 4,806
  triangles.
- The current 29-output build manifest aggregate is
  `sha256:1e1096a4ed418c0ad7c94b0292f580aa9934ebcae6f9344f91d7bc1170eb2340`.
- Named Cloudflare Tunnel/public-edge acceptance, public-edge packet loss and clock skew,
  production anti-cheat/privacy operations, and external rollback remain pending. Keep readiness
  **not ready for competitive play**.

### FPS map diagnostic and current validation — 2026-08-07

- Added the deterministic public-state-only `buildFpsMapDiagnostic` and browser canvas attributes
  for map/collision identity, player capsules, spawn rays, and spawn-to-player visibility. The
  rendered two-client assertion covers three obstacles, two capsules, eight rays, and 16 visibility
  tests while keeping private vitals, ammunition, seeds, tickets, and sessions redacted.
- Focused map/avatar tests pass 6/6. The full unit suite passes 563 tests across 47 files;
  `pnpm typecheck` and `pnpm format:check` pass. Focused FPS/map lint passes, while full lint still
  reports 86 unrelated visual-table/movement diagnostics.
- All four `pnpm test:e2e` scenarios pass. The current FPS sample is 76 frames, 30 draw calls, and
  4,806 triangles. The 29-output build manifest aggregate is
  `sha256:8ab4ed57fa3f04021f71a1f17ee43affb565f32934d716a3bd8cf26fd75aa6ea`.
- This closes only the local map-diagnostic evidence. Named-edge/public-edge acceptance, public-edge
  packet-loss and clock-skew tests, production anti-cheat/privacy operations, and external rollback
  remain pending; readiness stays **not ready for competitive play**.

### FPS competitive HUD and viewmodel lifecycle — 2026-08-07

- Publish `durationTicks` and `scoreTarget` in the strict FPS snapshot contract. Render the match
  timer, target, reticle state, RTT, and prediction/resync status from authoritative browser state.
- Keep the first-person viewmodel separate from the world avatar while applying authoritative weapon,
  reload, fire, crouch, death, disconnect, and spectator state. Publish diagnostics and cover the
  lifecycle in focused and rendered tests.
- The map/avatar set passes 7 tests; the full suite passes 564 tests across 47 files. The FPS browser
  spec passes all three scenarios with 76 frames, 30 draw calls, and 4,806 triangles. The current
  29-output build manifest aggregate is
  `sha256:ff890c87711017f7bc89abebae8ce0e62ad3ecb05650c3489fe099c588f52ce3`.
- This closes only the local HUD/viewmodel evidence. Named-edge/public-edge acceptance, public-edge
  packet-loss and clock-skew tests, production anti-cheat/privacy operations, and external rollback
  remain pending; readiness stays **not ready for competitive play**.

### FPS spawn safety and final local validation — 2026-08-07

- Added deterministic minimum-distance spawn selection and respawn line-of-sight occlusion using
  authored arena collision geometry. A valid deterministic fallback remains available when every
  point is occupied, with spawn protection preserved.
- The spawn/arena/terminal regression set passes 15 tests, including deterministic winner
  tie-breaking; the full unit suite passes 567 tests across 47 files. Typecheck, formatting,
  whitespace checks, and focused FPS lint pass.
- All four `pnpm test:e2e` scenarios pass on the real HTTP/WebSocket path. The latest FPS sample is
  77 frames, 30 draw calls, and 4,806 triangles.
- `pnpm build` emits 29 artifacts with manifest aggregate
  `sha256:4f46bb22076630263d20fa6f52248f92861585eb222b840705b26ec141ea5da6`.
- Full lint remains blocked by exactly 86 unrelated visual-table/movement diagnostics. Named
  Cloudflare Tunnel/public-edge acceptance, public-edge packet-loss and clock-skew testing,
  production anti-cheat/privacy operations, and external rollback remain pending; readiness stays
  **not ready for competitive play**.

### FPS snapshot baseline and identity recovery — 2026-08-07

- Require a full snapshot baseline and bind all later frames to the match, room, rules, map,
  weapon-set, and RNG identity. Reject foreign frames with `identity_mismatch` and request full
  recovery while preserving same-tick duplicate idempotency.
- The focused network/authority/arena set passes 17 tests; the full suite passes 567 tests across
  47 files. Typecheck, formatting, whitespace checks, and focused FPS lint pass.
- All four browser scenarios pass. The latest FPS sample is 74 frames, 30 draw calls, and 4,806
  triangles. The final 29-artifact build manifest is
  `sha256:4f46bb22076630263d20fa6f52248f92861585eb222b840705b26ec141ea5da6`.
- Full lint remains blocked by exactly 86 unrelated visual-table/movement diagnostics. Named
  Cloudflare Tunnel/public-edge, production anti-cheat/privacy, deployment, and rollback gates
  remain pending; readiness stays **not ready for competitive play**.

### FPS terminal result browser acceptance — 2026-08-07

- Add a bounded score-target control (default 25) to the existing FPS room-create flow and render
  the authoritative `match_ended` reason and public-scoreboard winner in a terminal result panel.
- The target-1 two-client Playwright flow passes after one kill and verifies both rendered panels,
  the ended snapshot, the score-target reason, the winner ID, and the terminal screenshot.
- The full suite passes 567 tests across 47 files; all five browser scenarios pass. The latest FPS
  sample is 75 frames, 30 draw calls, and 4,806 triangles. Build manifest aggregate:
  `sha256:17276d7d5d27110c65bb252289b0cfaa637824bac652659fd1be8d4fa2f58ef6`.
- Typecheck, formatting, whitespace, and focused FPS lint pass. Full lint remains blocked by the
  same 86 unrelated visual-table/movement diagnostics; named-edge, public-edge, production
  anti-cheat/privacy, and rollback gates remain pending, so readiness stays **not ready for
  competitive play**.

### FPS checkpoint integrity and local rollback drill — 2026-08-07

- Verify durable FPS checkpoints before restore: event-chain hashes, event count, monotonic event
  ticks, and non-negative restore counters. Reject tampered state with
  `fps_checkpoint_event_chain_mismatch`.
- The focused FPS/service regression set passes 24 tests. `pnpm test:fps:rollback` reopens a
  temporary SQLite journal through a fresh service handle, matches the persisted public replay and
  snapshot state, accepts a post-restore input, removes the temporary directory, and writes a
  receipt with digest `sha256:2b8559b29e959dd69536534165fa4720aceddd3849d0247eb02a91ae4fab4b3`.
- This closes local checkpoint-integrity and replay-continuity evidence only. Named-edge/public-edge,
  production anti-cheat/privacy, and retained-artifact external rollback remain pending; readiness
  stays **not ready for competitive play**.

- Post-integrity validation passes 569 unit tests, all five Playwright scenarios, strict typecheck,
  formatting, and focused FPS lint. The 29-artifact build manifest aggregate is
  `sha256:7f2147a8d4d48c724b297f3f88d62e0cafbaa27d0f3b80c8a3d9fe0220bdc24f`; full lint still has
  the known 86 unrelated visual-table/movement diagnostics.
- The HTTP FPS input route now shares the WebSocket `maxInputsPerSecond` policy, keyed by request IP,
  match, and player. The Fastify regression passes 13 tests; `pnpm test:fps:abuse` records HTTP
  statuses `[200, 200, 429]` with receipt digest
  `sha256:3111a7991cbeee28c53189696db57df6c2770e3639c5c15a0c091117ca06c500`. Production
  anti-cheat/privacy operations remain pending.

### FPS final post-rate-limit validation refresh — 2026-08-07

- The exact dirty source at `12f358d3e67a72944af4701c0c2c52508d28f76d` passes `pnpm test` (569 tests
  across 47 files), all five real `pnpm test:e2e` scenarios, strict typecheck, formatting, and
  focused FPS ESLint.
- `pnpm build` emits 29 artifacts. The current sorted, newline-terminated relative-path manifest
  aggregate is `sha256:587b4b62208127f9e4ee9de275c9c7ecd3f2ece06783e988098a3041050791a2`.
- `pnpm test:fps:abuse` remains green with HTTP statuses `[200, 200, 429]` and receipt digest
  `sha256:3111a7991cbeee28c53189696db57df6c2770e3639c5c15a0c091117ca06c500`.
- `pnpm test:fps:rollback` remains green with receipt digest
  `sha256:2b8559b29e959dd69536534165fa4720aceddd3849d0247eb02a91ae4fab4b3a`.
- Full repository lint still reports exactly 86 unrelated visual-table/movement diagnostics.

These are local source/build/abuse/replay/rendered receipts only. Named Cloudflare Tunnel/public-edge,
public-edge packet-loss and clock-skew, production anti-cheat/privacy, and retained-artifact external
rollback gates remain pending; readiness stays **not ready for competitive play**.

### FPS lifecycle and replay verification refresh — 2026-08-07

- Make disconnect, spectator, reconnect, countdown-cancellation, and shutdown persistence explicit
  authority transitions. Apply reconnect-storm limiting only after ticket authentication, require
  allowed origins and Bearer authentication on FPS HTTP routes, and reject query-string tickets.
- Include a public replay roster and terminal scoreboard. Verify score progression and the deterministic
  terminal winner from the chained public events; reject tampered terminal scoreboard data.
- Focused authority/protocol/service/network coverage passes 42 tests in 8 files. The full suite passes
  574 tests in 47 files; all five real browser scenarios, typecheck, formatting, and focused FPS lint
  pass. Full repository lint remains blocked by 86 unrelated visual-table/movement diagnostics.
- Local abuse, network, and rollback receipts pass with digests
  `sha256:3111a7991cbeee28c53189696db57df6c2770e3639c5c15a0c091117ca06c500`,
  `sha256:d6d711644678a498d0ea5815e0ae835564f9a3717e76c915c35992841d40bcdd`, and
  `sha256:3e209c08e2cc0851a694808b548f320a11060c91ca9bce2e38c2946b23814b7e`.
- The eight-client gate passes 4,800 inputs, 200 snapshots, and 523 events with receipt
  `sha256:5e6a6d5eb457e9565d9e51953a753382672ddcd93cfef613af93d8cf6854d482`; the 36,000-tick load
  gate passes 288,000 inputs, 96,000 snapshots, 56,591 events, and 605,907,058 snapshot bytes with
  receipt `sha256:cf8634b84192bec6889f4c14716f99c48c742cb07796ea30cc68687673681653`.
- The rebuilt 29-artifact manifest aggregate is
  `sha256:2109966de0997a1d495c392ca52de56e03622951a1fd14b31c309c44b022e447`.
- Named Cloudflare Tunnel/public-edge acceptance, public-edge fault testing, production anti-cheat/
  privacy operations, deployment evidence, and retained-artifact external rollback remain pending;
  readiness stays **not ready for competitive play**.

### FPS retained-artifact rollback rehearsal — 2026-08-07

- Added `scripts/fps-retained-rollback-drill.ts` and `pnpm test:fps:retained-rollback`. The drill
  copies a closed SQLite journal into an independent temporary artifact directory, verifies a
  manifest of file sizes and SHA-256 hashes, rejects a deliberate byte tamper, restores the
  artifact, verifies public replay/checkpoint and snapshot identity, and accepts continued input.
- Receipt digest: `sha256:70903cf237d7d7edd8d174b982cb5592cd00cf9a3d36222e96b4fc3691f7e811`.
- Isolated test-bus run `1786117592983-95318-312b0bb3` passes 574 tests across 47 files; strict
  typecheck, formatting, and focused lint pass.
- This closes a local artifact-integrity rehearsal only. External immutable retention, release
  provenance, operator rollback, named-edge/public-edge acceptance, and production anti-cheat/
  privacy gates remain pending. Keep readiness “not ready for competitive play”.

### FPS kicked-player abuse handling — 2026-08-07

- Add the owner-only `POST /api/fps/matches/:matchId/kick` route. The authoritative match records a
  chained `player_kicked` event, transitions the target to permanent spectator state, revokes the
  target ticket, closes its socket with `4003`, and exposes a privacy-safe kick metric.
- Repeated kicks are idempotent and self-kicks are rejected. The abuse receipt now covers this path;
  digest `sha256:b729f425e76533951c6493aa9b71f1740bee65642b2e811d0d12571b4222c607`.
- The isolated test bus passes 577 tests across 47 files; typecheck, formatting, focused lint, and
  package builds pass.
- This closes only local kick/abuse handling. Named-edge/public-edge, production anti-cheat/privacy,
  deployment, and external rollback gates remain pending. Keep readiness “not ready for competitive
  play”.

### FPS accessibility controls — 2026-08-07

- Add validated, device-local FPS accessibility preferences for reduced motion, high-contrast HUD,
  color-safe reticle cues, interface scale, event captions, and remappable movement keys.
- Apply reduced motion to remote-avatar interpolation and camera smoothing; keep the server
  simulation and authoritative inputs unchanged.
- Add focused normalization coverage for malformed storage, supported settings, and readable key
  labels. The full test-bus, typecheck, formatting, focused lint, and production build must pass.
- This closes a local accessibility surface only. Named-edge/public-edge acceptance, production
  anti-cheat/privacy operations, deployment, and external retained-artifact rollback remain pending;
  readiness stays **not ready for competitive play**.

### FPS local observability diagnostics — 2026-08-07

- Add privacy-safe server-boundary input transit age, input-transit jitter, and monotonic input
  sequence-gap counters to the existing FPS diagnostics. These are explicitly not reported as RTT or
  authoritative packet-loss truth.
- Add a pure render-side telemetry collector for RTT, jitter, observed server-envelope sequence gaps,
  resync requests, and prediction-correction distance. Show the values in browser data attributes and
  the HUD without sending them into authoritative simulation or replay state.
- Ensure the reduced-motion preference reaches the remote-avatar renderer so interpolation is disabled
  in the real scene path, not only in the helper test.
- Focused observability, service, accessibility, and reduced-motion tests pass. The full local unit
  suite and production build pass. Browser re-acceptance was not rerun in this continuation because
  this worktree prohibits opening another browser without explicit authorization.
- This closes only local observability evidence. Named-edge/public-edge acceptance, public-edge fault
  testing, production anti-cheat/privacy operations, deployment, and external retained-artifact
  rollback remain pending; readiness stays **not ready for competitive play**.

### FPS diagnostics protocol boundary and browser-gate preparation — 2026-08-07

- Enforce a strict redacted `fpsDiagnosticsSchema` at the server/protocol boundary. The regression
  rejects tickets and non-finite transit ages while allowing a finite negative age for clock skew.
- Add future browser assertions for RTT/jitter/loss/correction attributes and the accessibility
  controls. They are not run here because another browser is not authorized in this worktree.
- The exact post-change test-bus snapshot passes 585 tests across 50 files. The final 29-file build
  manifest aggregate is `sha256:65760e9a97af6f8d4c71bd9d216bc487419b287d4586d2ca3b4c40da02620868`;
  named-edge, public-edge faults, production anti-cheat/privacy, deployment, and external rollback
  remain pending.

### FPS authority-level rules validation — 2026-08-07

- Validate score target, duration, and snapshot rate inside `FpsMatch` construction so persisted and
  internal matches cannot bypass the versioned rules contract.
- Require snapshot rates to be positive divisors of the fixed 60 Hz simulation; keep score targets
  bounded to 1–100 and durations positive and safe.
- Centralized test-bus run `1786122728149-20120-1d38962b` passes 586 tests across 50 files;
  typecheck, formatting, focused FPS lint, diff checks, and build pass.
- Current 29-file artifact manifest aggregate:
  `sha256:3452938f102b217702684fa69e0c06d8e49bc3f9cef79b25154a6d49494ab9a6`.
- Browser re-acceptance, named-edge/public-edge testing, production anti-cheat/privacy operations,
  deployment evidence, and external rollback remain pending; readiness stays not ready.

### FPS WebSocket credential transport — 2026-08-07

- FPS browser tickets now travel as the second offered subprotocol beside `fps.v1`; the URL keeps
  only `playerId`.
- The Fastify adapter rejects FPS query-string tickets, extracts one credential token, and selects
  only `fps.v1` so the credential is not echoed.
- The Playwright two-client flow asserts that the observed FPS WebSocket URL contains only `playerId`;
  the new browser assertion remains unexecuted until browser authorization is available.
- Centralized test-bus run `1786124498081-17627-cb90e422` passes 587 tests across 50 files; strict
  typecheck and targeted formatting pass.
- `pnpm build` passes with 29 output files; artifact manifest aggregate:
  `sha256:9bbf0f92c1241102e0df46b531ced28213012b768eaf8287981f45c8d1efe093`.
- Edge/proxy redaction of `Sec-WebSocket-Protocol` remains a named public-edge privacy gate. FPS
  readiness remains not ready for competitive play.

### FPS lifecycle cancellation idempotency — 2026-08-07

- Make repeated authoritative cancellation calls no-ops after the first terminal transition.
- Add a regression proving the event chain and single `match_ended` record remain unchanged.
- The local test-bus validation passes; browser authorization and named-edge/public-edge,
  production, deployment, and external rollback gates remain pending.

### FPS authoritative input audit receipts — 2026-08-07

- Persist controller provenance and the last fixed-step application result for each bounded input
  receipt: applied tick, position, and velocity.
- Keep these fields checkpoint-only; public snapshots, diagnostics, and browser telemetry must not
  expose private input history.
- The focused regression, FPS package build, and centralized test bus pass. Browser/public-edge,
  production, deployment, and external rollback gates remain pending.

### FPS monotonic fixed-step scheduler — 2026-08-07

- Replace one-timer-callback/one-tick service scheduling with a server-owned monotonic elapsed-time
  accumulator. Bound delayed callbacks to eight catch-up ticks and discard negative/non-finite
  samples; never consume client elapsed time.
- Add a focused fake-clock regression for elapsed catch-up and impossible-delta clamping.
- Validation: the refreshed server-owned bus passes 597 tests across 50 files and 146 suites;
  typecheck, focused FPS lint, targeted formatting, diff checks, and the 29-file build pass. The
  artifact manifest aggregate is `sha256:6e411bd79c59856f945918e646f2c1925a1d0b23b74e3b077b351311412ed1c9`.
- Browser/public-edge, production anti-cheat/privacy, deployment, and external rollback remain
  pending; readiness stays **not ready for competitive play**.
