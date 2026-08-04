# Rules guide

The shipped default is `hk_nyc_social_v1` v1.0.0. It uses 144 tiles (four copies of the 34
standard tiles plus one each of four flowers and four seasons), a three-faan minimum, a ten-faan
cap, East → South → West → North turn order, and explicit flower replacement. Set
`training_relaxed_v1` when practicing complete shapes without the three-faan gate; use
`hk_modern_13f_v1` for the alternate modern scoring profile.

## Turn flow

East starts with fourteen tiles and discards. Other players draw, replace any bonus tile from the
replacement end, then discard. A discard opens a claim window. A win has priority over a kong,
pung, or chow; a pung/kong has priority over a chow, and only the next player may chow. A claimant
discards without drawing. A kong receives a replacement draw. An exhausted live wall is an
exhaustive draw.

## Winning and payment

A standard win is four groups and a pair, or one of the bundled special forms (Seven Pairs,
Thirteen Orphans, or Nine Gates). A shape-complete hand below the active minimum is rejected with
its current and missing faan. Scoring is ruleset data, not UI logic. Every public hand result lists
the winning form, applied rules, suppressed rules, raw/capped faan, and zero-sum payments.

## Kongs and bonus tiles

Concealed, exposed, and added kongs are distinct. Robbing an added or concealed kong is resolved in
its own claim window. Flowers and seasons are exposed immediately and replaced; their identity is
public. The default seat bonus mapping is East/Plum, South/Orchid, West/Chrysanthemum,
North/Bamboo, with the corresponding season mapping.

For the complete pattern list and house-rule variation points, inspect the resolved JSON files in
`rulesets/` and [HOUSE_RULES.md](HOUSE_RULES.md).
