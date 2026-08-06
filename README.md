# HK Mahjong Coach

## First-person presentation stack

Use **first-person presentation stack** as shorthand for the centralized player-perspective system in
`apps/web/src/scene/camera-motion.ts`. It covers the camera, movement and traversal response, weapon hand/viewmodel,
reticle/aim feedback, and related perspective animation.

When requesting a behavior change, route it through the first-person presentation stack so every attached system
inherits the change and its second-order effects. Do not make a reticle-only, weapon-only, or other subsystem-only
adjustment that bypasses the shared damper.
