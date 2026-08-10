# HK Mahjong Coach

## Deno Deploy game preview and account portal

The repository includes a composite Deno deployment surface. The local game continues to use the
Node/Fastify server and SQLite persistence; the Deno Deploy runtime serves the built Vite game at
`/` and a stateless hosted account portal at `/portal`. Accounts, sessions, roles, referrals, and
agent tokens use Deno KV and never expose password or token hashes.

Run the Deno surface locally with:

```bash
deno task check
deno task dev
```

The `main` branch workflow at `.github/workflows/deno-deploy.yml` validates this runtime, builds
the mobile game, assigns the `<app>-kv` database, uploads a prepared deploy root, and waits for
`/api/health`. Configure the repository or organization secret `DENO_DEPLOY_TOKEN_0X4007` before
enabling the workflow.

## First-person presentation stack

Use **first-person presentation stack** as shorthand for the centralized player-perspective system in
`apps/web/src/scene/camera-motion.ts`. It covers the camera, movement and traversal response, weapon hand/viewmodel,
reticle/aim feedback, and related perspective animation.

When requesting a behavior change, route it through the first-person presentation stack so every attached system
inherits the change and its second-order effects. Do not make a reticle-only, weapon-only, or other subsystem-only
adjustment that bypasses the shared damper.
