# House-rule profiles

Hong Kong mahjong varies by table. This repository keeps disputed choices in versioned ruleset
data. A persisted game records the complete resolved definition and its SHA-256 hash, so replay
does not drift when a later profile changes.

| Profile               | Minimum | Tiles | Intended use                          |
| --------------------- | ------: | ----: | ------------------------------------- |
| `hk_nyc_social_v1`    |  3 faan |   144 | Default social-table teaching profile |
| `training_relaxed_v1` |  0 faan |   144 | Shape and turn-flow practice          |
| `hk_modern_13f_v1`    |  3 faan |   144 | Alternate modern scoring assumptions  |

Variation points include minimum and cap, bonus-tile enablement, special-form values, stacking and
suppression, multiple winners, passed-win restrictions, kong robbery, dealer multipliers, and
exhaustive-draw progression. Edit a copied JSON profile, validate it with the generated schema,
then register it in the ruleset registry; do not add scoring constants to React or server code.
