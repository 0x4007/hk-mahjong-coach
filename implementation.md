# Implementation status

## Canonical state

- Repository: `/Users/nv/repos/0x4007/hk-mahjong-coach`
- Branch: `main`
- Initial base: unborn branch; the remote has no refs.
- Implementation lane: the existing checkout, with one writer and no task worktrees.

## Current milestone

Milestone 2 — Core hand state machine.

## Completed

- Read the complete implementation contract in `spec.md`.
- Reconciled the local branch, worktree list, remote refs, and absence of prior implementation.
- Selected a Node 24 LTS, pnpm 11, strict TypeScript 6, React 19, Vite 8, Fastify 5 stack.
- Created workspace/package boundaries, executable root scripts, validation configuration, and CI.
- Installed the pinned dependency graph and generated `pnpm-lock.yaml`.
- Passed `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and the
  production server smoke check.
- Implemented all 42 immutable tile definitions, exact 136/144 physical inventories, compact
  notation, canonical ordering, explicit seat order, seeded xoshiro RNG, deterministic shuffle,
  canonical JSON, and platform-neutral SHA-256.
- Implemented the strict ruleset schema, generated JSON Schema, full bundled profile data, explicit
  ambiguous-pattern semantics, bonus-off resolution, readable validation, eager registry checks,
  deep freezing, and versioned SHA-256 identities.
- Locked exact RNG output, shuffled-wall, and profile hashes in tests.
- Passed the Milestone 1 coverage gate with 31 tests, 99.09% statements, and 97.02% branches.

## Blockers

None.

## Next action

Implement event-sourced game creation, dealing and chained bonus replacements, the authoritative
state/reducer, legal discard/draw/claim/kong/win actions, hidden claim collection, observations,
revisions, invariants, and deterministic replay hashes.
