# FPS Slayer rules (experimental v1)

This document describes the first browser prototype described by
`docs/multiplayer-fps-slayer-readiness-handoff.md`. It is a free-for-all Slayer match, not a
production competitive service. The server is authoritative for every gameplay result.

## Match contract

- Mode: `slayer_ffa`.
- Map: `slayer-arena-v1`, one bounded authored arena with three deterministic cover pieces and
  eight validated spawn points (enough for the eight-player cap).
- Population: 2–8 connected players.
- Target: first player to 25 kills, or the highest score after 10 minutes.
- Tick: 60 Hz authoritative simulation; snapshots are emitted at the browser transport rate.
- Respawn: 120 ticks (2 seconds) after death, with 120 ticks of visible spawn protection.
- Spawn safety: initial spawns prefer at least 6 m from an alive enemy; respawns additionally
  prefer points hidden by authored cover, with deterministic valid-point fallback when saturated.
- Reconnect reservation: 30 seconds. Reconnect uses the original room ticket and player ID.
- O₂/breathing: disabled for this competitive slice. It remains a visual-table sandbox feature.
- Team rules, friendly fire, accounts, ranking, wagering, and public matchmaking are not included.

## Weapons

| ID       | Weapon       | Damage | Head multiplier | Magazine | Reserve |  Cadence |    Reload |
| -------- | ------------ | -----: | --------------: | -------: | ------: | -------: | --------: |
| `pistol` | Pulse Pistol |     34 |            1.75 |       12 |      72 | 12 ticks |  72 ticks |
| `rifle`  | Arc Rifle    |     14 |            1.35 |       30 |     120 |  5 ticks | 105 ticks |

The browser requests a fire action. The server checks alive state, spawn protection, reload state,
magazine, cadence, weapon selection, and a validated aim ray. The browser never sends position,
health, ammo, damage, hit, kill, or score claims.
Rejected cadence and duplicate edge actions are recorded as public `shot_rejected` events so the
kill feed and replay explain why a client click did not create a shot.

## Scoring and replay

A confirmed kill awards one point and one kill to the killer. Assists are recorded for other players
who damaged the victim within the bounded assist window. Death, respawn, score, and match-end events
are committed to the server event chain. The checkpoint and event chain are stored by the FPS
SQLite journal so a fresh server process can reconstruct the authoritative match state and ticket
bindings.

At match end, the server selects one deterministic winner using the scoreboard order: highest score,
then most kills, then fewest deaths, then lexical player ID. This tie-break applies both when the
score target is reached and when the time limit expires; insertion order never decides the winner.

The rules, map, weapon set, seed, accepted inputs, public combat events, and terminal scoreboard are
versioned or hashed. A replay is accepted only when every event hash and chain link recomputes to the
stored terminal hash.

## Client presentation policy

The fallback mannequin is deterministic and has named `head`, `chest`, `weapon`, `muzzle`,
`leftHand`, `rightHand`, and `feet` sockets. The local camera-relative hands and weapon are a
separate viewmodel. The world avatar remains a separate scene entity for third-person verification,
shadows, spectators, and remote clients. Remote snapshots are interpolated from a short bounded
buffer; local movement is predicted and corrected to server snapshots.

Use `/?fps=1` for the local browser prototype. The “Third-person verification” control is a local
diagnostic view and does not change server authority.
