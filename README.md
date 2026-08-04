# Hong Kong Mahjong Coach

Hong Kong Mahjong Coach is a local-first four-player learning game. The same deterministic
TypeScript engine powers the human CLI, JSONL agent host, Fastify API, WebSocket session, and the
first-person Three.js table. The browser scene is presentation-only; legal moves, scoring, replay,
and hidden-information boundaries remain in the engine and session controller.

## Quick start

```bash
corepack enable
pnpm install
pnpm verify
pnpm build
pnpm start
```

Open <http://127.0.0.1:4173>. The server stores local data in
`~/.hk-mahjong-coach/coach.sqlite`. `POST /api/profile/reset` or `mahjong profile reset` clears
learner progress while leaving the application schema intact.

## CLI

```bash
pnpm --filter @hk-mahjong/cli dev -- play --mode learn --rules training_relaxed_v1 --seed demo-001
pnpm --filter @hk-mahjong/cli dev -- serve --stdio --seat player-0
pnpm --filter @hk-mahjong/cli dev -- replay <game-id>
pnpm --filter @hk-mahjong/cli dev -- analyze --hand "1m 2m 3m 4p 5p 6p 7s 8s 9s E E E R R"
pnpm --filter @hk-mahjong/cli dev -- rules list
pnpm --filter @hk-mahjong/cli dev demos
pnpm --filter @hk-mahjong/cli dev -- drill tiles
```

JSONL stdout contains protocol envelopes only. The host advertises a one-second action deadline,
retries malformed or timed-out input three times, then takes the first emitted legal action as a
deterministic fallback. Diagnostics go to stderr.

## Rules and privacy

The default is `hk_nyc_social_v1`, a clearly labeled Hong Kong Old Style / NYC Social Teaching
Profile with a three-faan minimum. `training_relaxed_v1` and `hk_modern_13f_v1` are bundled
alternatives. During live play, opponent concealed tiles, wall order, and authoritative `GameState`
never cross the observation, bot, coach, protocol, or browser boundary. A separate, explicitly
labeled post-hand/sandbox replay view may reveal completed concealed hands for review.

The optional narrator is server-only and receives redacted observations plus structured analysis.
Templates are always available offline; provider errors, invalid output, and timeouts immediately
fall back to templates.

The browser home screen also lists ten deterministic teaching rooms (`demo_tile_basics` through
`demo_scoring_limit`). They are named seeds with a teaching focus; exact claim, kong, robbery, and
scoring fixtures remain available in the engine test-fixture package.

## Development checks

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm test:sim:fast
pnpm test:e2e
pnpm build
pnpm smoke
pnpm verify
```

See [documentation.md](documentation.md), [implementation.md](implementation.md), and the focused
guides under `docs/` for architecture, rules, protocol, coaching, curriculum, and accessibility.
