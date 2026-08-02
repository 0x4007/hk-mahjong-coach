Codex Handoff: Hong Kong Mahjong Learning Game

Document status: implementation contract
Primary implementation language: TypeScript
Target: a complete, local-first learning game that is usable from both a machine-readable text interface and a visual web interface
Primary user: an English-speaking beginner learning Hong Kong-style mahjong for real-world social play
Default rules profile: hk_nyc_social_v1, a clearly labeled and configurable Hong Kong Old Style teaching profile with a 3-faan minimum

────────

0. Copy-paste task for Codex

> Read this entire document before changing code. Implement the complete repository described here, not merely a prototype or scaffold. Treat this file as the product and engineering source of truth. Work milestone by milestone, continuously run validation, and repair failures before moving on. When a rule is genuinely ambiguous, implement it as a versioned ruleset option rather than hard-coding an undocumented assumption. Keep the deterministic game engine authoritative; neither the web UI nor an LLM may invent legal moves, scoring, hidden information, or game state. Finish with a runnable application, a passing `pnpm verify`, complete documentation, sample data, and an implementation report listing anything that remains incomplete.

Codex overnight execution protocol

1. Inspect the repository. If it is empty, initialize it exactly as described below.
2. Create and maintain these files from the beginning of the run:
   • AGENTS.md: repository-wide implementation rules.
   • plans.md: milestone plan, acceptance criteria, and validation commands.
   • implementation.md: current milestone, completed work, blockers, and next action.
   • documentation.md: architecture decisions, commands, demos, and known limitations.
3. Implement milestones in dependency order. Do not jump to visual polish before the engine and rules are verified.
4. After every milestone, run the milestone validation commands. Stop and fix failures immediately.
5. Prefer a small, correct, well-tested implementation over a broad but fake implementation.
6. Do not leave TODO, placeholder data, mocked core behavior, disabled tests, or empty screens on the critical path.
7. If an optional integration is unavailable, implement and test the documented fallback so the product remains fully usable.
8. Record every material deviation from this specification in documentation.md, including the reason and impact.
9. Before finishing, run pnpm verify, start the production build, complete the smoke-test script, and write a concise final implementation report.

────────

1. Executive summary

Build a four-player Hong Kong-style mahjong application in which one local human plays against three computer opponents. The application has one authoritative deterministic game engine and several clients:

• A human-readable command-line client.
• A stable JSON Lines protocol that an external LLM or other agent can consume and control.
• A visual browser client that displays recognizable tiles and teaches the player to read them.
• An adaptive teacher that explains decisions, assigns drills, remembers prior performance, and becomes less intrusive as the player improves.

The visual and text clients must never maintain separate game logic. Both must consume the same schemas, legal actions, scoring results, analysis results, replay events, and learner profile.

The product is local-first. A complete game, deterministic bots, analysis, coaching templates, memory, drills, replays, and the web UI must work without an API key or internet connection. An optional LLM adapter may improve natural-language coaching or control a player seat, but it is never required for correctness.

Hong Kong mahjong has substantial table-to-table variation. Therefore, all disputed rules—including minimum faan, hand values, bonus tiles, payment formulas, multiple winners, passed-win restrictions, and dealer multipliers—must live in versioned data-driven rulesets. The UI must always show the active ruleset and a readable summary before a match begins.

────────

2. Product goals

2.1 Primary goals

1. Teach a beginner to recognize every tile quickly and confidently.
2. Teach the actual flow of a four-player Hong Kong-style game.
3. Teach the player to build legal hands that satisfy a 3-faan minimum.
4. Teach tile efficiency, waits, hand direction, call discipline, value planning, and basic defense.
5. Support repeated play against bots whose strength can increase with the learner.
6. Provide accurate explanations tied to deterministic analysis rather than invented LLM claims.
7. Preserve a learner model across sessions and use it to select hints, drills, and review topics.
8. Expose a clean text protocol so an LLM can observe and play without interpreting pixels.
9. Render a clear visual table so the human learns real tile faces rather than abstract labels alone.
10. Make every game replayable, inspectable, and reproducible from a seed and event log.

2.2 Secondary goals

• Teach common English, Traditional Chinese, Simplified Chinese, Cantonese Jyutping, and Mandarin pinyin labels for tiles and actions.
• Include a concise “social table readiness” curriculum covering calls, turn rhythm, physical tile organization, and common etiquette.
• Allow custom house rules without forking the engine.
• Make it straightforward to add another regional ruleset later.

2.3 Explicit non-goals for this implementation

• Online multiplayer, matchmaking, accounts, cloud sync, or payments.
• Real-money gambling features, wagering, or cash-value recommendations.
• Native iOS or Android applications.
• Photorealistic 3D tiles, physics, elaborate animations, or a casino aesthetic.
• Japanese riichi rules such as riichi declarations, dora, furiten, ippatsu, red fives, or Japanese yaku.
• Chinese Official/MCR scoring.
• Voice recognition or speech synthesis.
• A model that is trusted to determine legal moves or scoring.

────────

3. Product principles and non-negotiable constraints

3.1 One authoritative engine

The core engine is a pure TypeScript package. It must not import React, a database, a web server, environment variables, clocks, network clients, or terminal libraries. Given the same initial state, seed, and commands, it must emit the same events and final state on every platform.

3.2 Text and visual parity

Every visible state in the browser must have a canonical text/JSON representation. Every legal browser action must correspond to a legal action ID emitted by the engine. A screenshot must never be required for an LLM to understand the game.

3.3 Hidden-information integrity

A player, bot, coach during live play, and external LLM player may only receive:

• Their own concealed hand.
• Public melds and bonus tiles.
• Public discards and claim history.
• Round, seat, scores, wall count, and other public metadata.
• Legal actions available to that player.

They may not receive opponents’ concealed tiles, wall order, replacement tiles, or analyses derived from hidden information. Omniscient analysis is allowed only after a hand ends or in an explicitly labeled debug/sandbox mode.

3.4 Rules are versioned data

Do not scatter scoring constants and house rules through code. A saved game must store both rulesetId and rulesetVersion, plus a deterministic hash of the resolved ruleset. Replays must continue to use the historical ruleset even after a later rules update.

3.5 Deterministic facts before prose

The analysis package produces structured facts. Coaching templates or an optional LLM turn those facts into explanations. The prose layer may not create a recommendation that is absent from the structured analysis.

3.6 Local-first memory

Learner history is stored locally in SQLite. Longitudinal claims such as “you often call too early” must be traceable to stored decision events and computed metrics. The app must never fabricate memories.

3.7 Progressive disclosure

A beginner should not face an analysis dashboard full of jargon. The default teacher presents one useful idea at a time. Advanced metrics remain available through an expandable panel.

3.8 No false certainty

When two choices are close, say so. Recommendations must include confidence and a score gap. The UI should use language such as “slightly preferred” rather than pretending every position has one objectively correct move.

────────

4. User experience modes

| Mode          | Purpose                                         |                Live help | Post-decision feedback |               Post-hand review |
| ------------- | ----------------------------------------------- | -----------------------: | ---------------------: | -----------------------------: |
| `learn`       | First games and tile learning                   |          Full, proactive |              Immediate |                       Detailed |
| `guided`      | Practice with controlled hints                  | On request, three levels |                  Brief |                       Detailed |
| `socratic`    | Make the learner articulate a plan              |  Questions before advice |                  Brief |                       Detailed |
| `competitive` | Normal play against matched bots                |                     None |                   None |                        Concise |
| `exam`        | Measure independent skill                       |            None; no undo |                   None | Scored report after completion |
| `sandbox`     | Set up hands, inspect rules, and branch replays |                Unlimited |              Unlimited |                       Optional |

4.1 Hint levels

1. Nudge: identify the relevant concept without naming the move.
2. Compare: show two or three candidate actions and the main tradeoff.
3. Reveal: show the ranked recommendation, metrics, and a concise explanation.

Every hint request is recorded. Hint usage affects mastery confidence but must not be treated as a failure.

4.2 Adaptive competitor

The default opponent group contains three distinct styles:

• fast: favors speed and flexible low-commitment hands.
• value: pursues higher-faan directions when justified.
• balanced: trades off speed, value, and public risk.

Bot difficulty is independently configurable. In adaptive mode, the application selects a level that keeps the learner challenged without silently giving bots hidden information.

────────

5. Hong Kong rules model

5.1 Important product stance

There is no single universally followed Hong Kong ruleset. The application must present a useful default while making its assumptions visible and editable. Never label the default as “the official Hong Kong rules.” Label it as Hong Kong Old Style — NYC Social Teaching Profile v1.

5.2 Tile inventory

The engine supports both 136-tile and 144-tile play.

Standard tiles: 136

• 9 Characters tiles × 4 copies = 36.
• 9 Dots tiles × 4 copies = 36.
• 9 Bamboo tiles × 4 copies = 36.
• 4 Winds × 4 copies = 16.
• 3 Dragons × 4 copies = 12.

Bonus tiles: 8

• 4 Flowers, one copy each.
• 4 Seasons, one copy each.

The default profile enables all 144 tiles. A bonusTilesEnabled: false setting creates a 136-tile game and automatically disables bonus-tile scoring rules.

No jokers, red fives, dora indicators, or duplicate bonus tiles are used.

5.3 Canonical tile identity

Use explicit semantic IDs in persisted data and APIs. Compact notation is display-only shorthand.

| Category   | Semantic IDs                                          | Compact aliases                   | English                             | Traditional Chinese | Simplified Chinese |
| ---------- | ----------------------------------------------------- | --------------------------------- | ----------------------------------- | ------------------- | ------------------ |
| Characters | `characters.1` … `characters.9`                       | `1m` … `9m`                       | One–Nine Characters                 | 一萬 … 九萬         | 一万 … 九万        |
| Dots       | `dots.1` … `dots.9`                                   | `1p` … `9p`                       | One–Nine Dots                       | 一筒 … 九筒         | 一筒 … 九筒        |
| Bamboo     | `bamboo.1` … `bamboo.9`                               | `1s` … `9s`                       | One–Nine Bamboo                     | 一索 … 九索         | 一索 … 九索        |
| Winds      | `wind.east`, `.south`, `.west`, `.north`              | `E S W N`                         | East, South, West, North            | 東 南 西 北         | 东 南 西 北        |
| Dragons    | `dragon.red`, `.green`, `.white`                      | `R G Wh`                          | Red, Green, White Dragon            | 中 發 白            | 中 发 白           |
| Flowers    | `flower.plum`, `.orchid`, `.chrysanthemum`, `.bamboo` | `F1` … `F4`                       | Plum, Orchid, Chrysanthemum, Bamboo | 梅 蘭 菊 竹         | 梅 兰 菊 竹        |
| Seasons    | `season.spring`, `.summer`, `.autumn`, `.winter`      | `S1` … `S4` only in bonus context | Spring, Summer, Autumn, Winter      | 春 夏 秋 冬         | 春 夏 秋 冬        |

Each physical tile has a stable instance ID, for example characters.5#3. Game logic compares tile types; event sourcing tracks physical instance IDs so conservation can be tested exactly.

Tile metadata must include:

```ts
interface TileDefinition {
  id: TileTypeId;
  compactCode: string;
  category: "characters" | "dots" | "bamboo" | "wind" | "dragon" | "flower" | "season";
  rank?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  terminal: boolean;
  honor: boolean;
  bonus: boolean;
  names: {
    en: string;
    zhHant: string;
    zhHans: string;
    jyutping: string;
    pinyin: string;
  };
}
```

5.4 Seats and direction

• Four seats: East, South, West, North.
• Seat order and turn order: East → South → West → North → East.
• The engine must use explicit seat IDs and a nextSeat function. UI layout must never be used to infer turn order.
• A new match randomizes initial seats unless the user specifies them or supplies a deterministic seed.

5.5 Wall, dealing, and initial replacement

1. Create the resolved tile inventory.
2. Shuffle through the injected seeded random source.
3. Deal 13 non-bonus tiles to each player; East receives one additional tile and begins with 14.
4. Whenever a bonus tile is encountered during the deal, expose it and draw a replacement from the replacement end of the wall.
5. Continue until hand sizes are correct and all initial bonus replacements are complete.
6. East begins by discarding; East does not draw again before the first discard.

The engine may abstract the physical dice and wall-breaking ceremony, but the curriculum must include a static lesson describing real table setup. The actual shuffled order, live-wall boundary, replacement boundary, and draw direction must remain deterministic and replayable.

5.6 Standard turn

Unless a player has just claimed a discard:

1. Draw one tile from the live wall.
2. Immediately expose and replace any drawn bonus tile, repeating as necessary.
3. Offer legal self-draw win and kong actions.
4. Require one discard.
5. Open a claim window for eligible opponents.
6. Resolve claims or advance to the next player.

After a chow or pung claim, the claimant discards without drawing. After a kong, the claimant draws a replacement tile before discarding.

5.7 Chows, pungs, and kongs

Chow

• Three consecutive suited tiles of the same suit.
• Honors cannot form a chow.
• Only the next player in turn order may chow the immediately preceding discard.
• If more than one chow composition is possible, each exact composition is a separate legal action.

Pung

• Three identical standard tiles.
• Any opponent may claim the immediately preceding discard when holding two matching concealed tiles.

Kong

Support all three forms:

1. Exposed kong from discard: claim a discard while holding three matching concealed tiles.
2. Concealed kong: expose or mark four matching concealed tiles according to the UI convention; it remains concealed for scoring.
3. Added kong: add the fourth tile to the player’s own previously exposed pung.

After any resolved kong, draw a replacement from the replacement end. Before an added kong resolves, open a robbing-the-kong win window. Concealed-kong robbery is disabled in the default profile and represented as a configurable house rule.

5.8 Claim priority and conflicts

Default priority:

1. Legal win.
2. Kong or pung.
3. Chow.

For equal-priority claims, the nearest eligible player after the discarder in turn order wins the claim. multipleWinners is configurable; the default profile uses a single winner. If multiple winners are enabled, all legal win claims resolve and payment follows the selected payment policy.

The engine must not leak other players’ pending choices. A claim window remains internal until every required player has responded or an explicit timer expires. Local games have no timer by default.

5.9 Passed-win restriction

Some tables restrict a player who passes a legal discarded win from claiming the same tile type again before that player’s next draw. Implement this as sameTileWinLockUntilNextDraw. It is disabled in the default teaching profile but available in custom rulesets. Do not call it “furiten” in the user interface.

5.10 Winning hand forms

The engine must support:

• Standard hand: four melds plus one pair.
• Seven Pairs, when enabled.
• Thirteen Orphans, when enabled.
• Nine Gates and other limit patterns defined by the active scoring profile.

A kong counts as one meld even though it contains four physical tiles. The winning-hand solver must enumerate all legal decompositions because the same tiles can sometimes produce multiple scoring interpretations. The scoring engine must select the highest legal result and retain alternate decompositions for review.

5.11 Hand and match end

A hand ends when:

• One or more players win under the active multiple-winner setting.
• The live wall is exhausted and no win has occurred.
• A debug or sandbox command explicitly ends it.

Default match progression:

• Prevailing winds: East, South, West, North.
• Each prevailing wind contains enough hands for every seat to become East.
• East repeats after an East win.
• East repeats after an exhaustive draw.
• Both repeat rules are configurable.
• A shorter one-wind match is available for practice.

The UI must explain that real social groups often use shorter sessions or different dealer-repeat rules.

────────

6. Default scoring profiles

6.1 General scoring architecture

A scoring profile is data plus registered evaluator functions. Each rule declares:

• Stable ID and localized name.
• Faan value or limit.
• Eligibility predicate.
• Enabled flag.
• Stacking group.
• Rules it implies, suppresses, or excludes.
• Whether it is a hand-composition rule, bonus rule, wind/dragon rule, or winning-condition rule.
• Explanation template and examples.

The scoring result must include every applied rule, every suppressed rule with a reason, the uncapped total, capped total, legal-win determination, payment breakdown, chosen decomposition, and alternate decompositions.

```ts
interface ScoringResult {
  rulesetId: string;
  rulesetVersion: string;
  winnerId: PlayerId;
  winningTileId: TileInstanceId;
  winSource: "self_draw" | "discard" | "robbing_kong" | "replacement";
  decomposition: WinningDecomposition;
  alternatives: WinningDecompositionSummary[];
  applied: AppliedScoringRule[];
  suppressed: SuppressedScoringRule[];
  rawFaan: number;
  cappedFaan: number;
  minimumRequired: number;
  legalWin: boolean;
  basePoints: number;
  payments: PlayerPayment[];
}
```

6.2 hk_nyc_social_v1 default profile

This is a practical teaching profile, not a claim about every New York table. Show that disclaimer in the rule picker.

Core settings

| Setting                           |                                                   Default |
| --------------------------------- | --------------------------------------------------------: |
| Bonus tiles                       |                                  Enabled; 144 tiles total |
| Minimum to declare a win          |                                                    3 faan |
| Faan cap                          |                                           10 faan / limit |
| Multiple winners                  |                                                  Disabled |
| Same-tile passed-win lock         |                                                  Disabled |
| Dealer repeats on dealer win      |                                                   Enabled |
| Dealer repeats on exhaustive draw |                                                   Enabled |
| Dealer payment multiplier         |                         Disabled by default; configurable |
| Concealed-kong robbery            |                                                  Disabled |
| Seven Pairs                       | Enabled, clearly marked as a house-rule-sensitive pattern |
| Concealed Hand bonus              |           Enabled, clearly marked as house-rule-sensitive |

One-faan rules

| Rule ID             | Name                      | Requirement                                               | Stacking notes                                             |
| ------------------- | ------------------------- | --------------------------------------------------------- | ---------------------------------------------------------- |
| `no_bonus_tiles`    | No Flowers or Seasons     | Winner has no bonus tiles while bonus tiles are enabled   | Exclusive with every bonus-tile rule                       |
| `seat_flower`       | Seat Flower               | Winner has the flower numbered for the winner’s seat      | Suppressed by `all_flowers`                                |
| `seat_season`       | Seat Season               | Winner has the season numbered for the winner’s seat      | Suppressed by `all_seasons`                                |
| `all_chows`         | All Chows / Ping Wu       | Four chows and a non-scoring suited pair; no pung or kong | Mutually exclusive with pung-based hands                   |
| `concealed_hand`    | Concealed Hand            | No chow, pung, or exposed kong claimed from a discard     | Suppressed for special hands when configured               |
| `dragon_pung`       | Dragon Pung/Kong          | One faan for each distinct dragon pung or kong            | Suppressed by Little/Big Three Dragons as configured       |
| `seat_wind`         | Seat Wind Pung/Kong       | Pung or kong of the winner’s seat wind                    | Can stack with prevailing wind when both are the same wind |
| `prevailing_wind`   | Prevailing Wind Pung/Kong | Pung or kong of the prevailing wind                       | Can stack with seat wind                                   |
| `self_draw`         | Self-Drawn Win            | Final tile drawn from wall or replacement end             | May stack with replacement win                             |
| `last_tile_draw`    | Last Tile Draw            | Self-draw on final live-wall tile                         | Stacks with self-draw                                      |
| `last_tile_discard` | Last Tile Discard         | Win on discard following the final live-wall draw         | Does not also receive self-draw                            |
| `robbing_kong`      | Robbing the Kong          | Win on a tile added to an exposed pung                    | Win-source rule                                            |
| `replacement_win`   | Win on Replacement Tile   | Win on a replacement draw after kong or bonus tile        | Counts separately and also qualifies for self-draw         |

Two-faan bonus rules

| Rule ID       | Name        | Requirement           | Stacking notes         |
| ------------- | ----------- | --------------------- | ---------------------- |
| `all_flowers` | All Flowers | All four flower tiles | Suppresses seat flower |
| `all_seasons` | All Seasons | All four season tiles | Suppresses seat season |

Three- to six-faan rules

| Faan | Rule ID                | Name                 | Requirement                                                              | Stacking notes                                                                             |
| ---: | ---------------------- | -------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
|    3 | `all_pungs`            | All Pungs            | Four pungs/kongs plus a pair                                             | May stack with suit patterns                                                               |
|    3 | `half_flush`           | Half Flush           | One suit plus honors only                                                | Exclusive with full flush                                                                  |
|    4 | `little_three_dragons` | Little Three Dragons | Two dragon pungs/kongs and a pair of the third                           | Suppresses individual dragon-pung faan by default                                          |
|    4 | `seven_pairs`          | Seven Pairs          | Seven distinct pairs unless ruleset allows a four-of-a-kind as two pairs | Cannot combine with standard-decomposition rules; may combine with suit pattern per config |
|    6 | `full_flush`           | Full Flush           | One suit only; no honors                                                 | Exclusive with half flush                                                                  |

Limit rules, scored at the 10-faan cap

Implement at minimum:

• Four Concealed Pungs.
• Big Three Dragons.
• Little Four Winds.
• Big Four Winds.
• All Honors.
• All Terminals.
• Nine Gates.
• Thirteen Orphans.
• All Kongs.
• Jade Dragon.
• Ruby Dragon.
• Pearl Dragon.
• Heavenly Hand.
• Earthly Hand.

Limit rules suppress lower-value hand-composition rules by default. The breakdown should still list recognizable implied features as informational but not additive.

6.3 hk_modern_13f_v1 alternate profile

Provide a second bundled profile demonstrating that values can differ. It uses:

• 3-faan minimum.
• 13-faan cap.
• Full Flush: 7.
• Little Three Dragons: 5.
• Big Three Dragons: 8.
• Little Four Winds: 8.
• All Honors and Big Four Winds: 10.
• Thirteen Orphans, All Kongs, Heavenly Hand, and Earthly Hand: 13/limit.

Store the entire profile in data, not conditionals. The application need not claim that this profile is more correct; it exists to make variation explicit and to test extensibility.

6.4 training_relaxed_v1 profile

Same hand-evaluation rules as the default profile, but:

• Minimum faan is 0.
• Illegal low-value wins become legal for early lessons.
• The result screen still shows what the hand would have scored under the standard 3-faan profile.
• After the learner completes the game-flow curriculum, default new games should move to the 3-faan profile.

6.5 Payment model

The default fan-laak table is:

| Faan | Base points |
| ---: | ----------: |
|    0 |           1 |
|    1 |           2 |
|    2 |           4 |
|    3 |           8 |
|  4–6 |          16 |
|  7–9 |          32 |
|  10+ |          64 |

Default payment formula:

• Win by discard: discarder pays 2 × base; each other loser pays 1 × base.
• Win by self-draw: each loser pays 2 × base.
• Score changes must sum to zero.

Implement alternate payment policies as data-driven strategies:

• Discarder pays all; other players pay zero.
• Dealer doubles payments when winning or losing.
• Custom base-point buckets.

The product uses abstract points only. Do not include currency conversion.

6.6 Scoring correctness requirements

• The evaluator must not depend on tile display order.
• Kongs count as a single meld.
• Seat wind and prevailing wind may both apply to the same pung when the winds coincide.
• The highest-scoring legal decomposition must be selected.
• The engine must reject a declared win below the minimum and explain exactly which faan were present and how many were missing.
• A score breakdown must be reproducible from saved state without calling an LLM.
• Golden fixtures must cover every bundled scoring rule and every exclusion/stacking interaction.

────────

7. System architecture

7.1 Monorepo

Use a pnpm workspace with strict TypeScript and ECMAScript modules.

```text
apps/
  cli/                  Human CLI and JSONL stdio host
  server/               Local HTTP/WebSocket server and composition root
  web/                  React visual application
packages/
  core/                 Pure tiles, commands, events, reducer, legal actions
  hk-rules/             Bundled HK rulesets, win solver, scoring, payments
  analysis/             Hand distance, waits, availability, discard analysis
  bots/                 Legal-information-only computer players
  coach/                Curriculum, deterministic facts, templates, LLM adapter
  protocol/             Versioned schemas and JSONL/HTTP contracts
  persistence/          SQLite repositories and migrations
  tile-ui/              Shared visual tile components and tile metadata
  test-fixtures/        Golden hands, replay logs, seeded scenarios
docs/
  RULES.md
  ARCHITECTURE.md
  PROTOCOL.md
  COACHING.md
  CURRICULUM.md
  HOUSE_RULES.md
  ACCESSIBILITY.md
  TROUBLESHOOTING.md
rulesets/
  hk_nyc_social_v1.json
  hk_modern_13f_v1.json
  training_relaxed_v1.json
AGENTS.md
plans.md
implementation.md
documentation.md
README.md
```

7.2 Dependency direction

```text
core <- hk-rules <- analysis <- bots
  ^         ^          ^        ^
  |         |          |        |
protocol    +----------+--------+
  ^                    |
  |                    v
persistence          coach
  ^                    ^
  |                    |
cli / server <------ composition ------> web
```

Rules:

• core imports no other workspace package.
• hk-rules imports only core.
• analysis imports core and hk-rules.
• bots imports core, hk-rules, and analysis.
• coach consumes structured outputs from the lower layers; lower layers never import it.
• web does not import server-only persistence or secrets.
• Shared schemas live in protocol, generated or validated once.

7.3 Technology choices

• TypeScript with strict: true, noUncheckedIndexedAccess: true, and exactOptionalPropertyTypes: true.
• pnpm workspace.
• React and Vite for the browser client.
• A small local Node server, preferably Fastify, serving the built web app plus JSON API and WebSocket updates.
• SQLite through a maintained Node binding, with migrations and transactions.
• Zod or an equivalent runtime schema validator for external boundaries.
• Vitest for unit/integration tests.
• fast-check for property tests.
• Playwright for browser end-to-end tests.
• ESLint and Prettier.
• No CSS framework requirement; prefer CSS variables and component-scoped styles over a large design dependency.

Avoid adding state-management frameworks until ordinary React state and a small typed client store are demonstrably insufficient.

7.4 Core command/event model

Use event sourcing at the game level.

```ts
interface GameEngine {
  create(command: CreateGameCommand): EngineResult;
  decide(state: GameState, command: GameCommand): EngineResult;
  reduce(state: GameState, event: GameEvent): GameState;
  legalActions(state: GameState, playerId: PlayerId): LegalAction[];
  observation(state: GameState, playerId: PlayerId): PlayerObservation;
}

interface EngineResult {
  accepted: boolean;
  events: GameEvent[];
  error?: EngineError;
}
```

The command handler validates intent and emits events. The reducer applies events. Persistence stores the ordered event stream and periodic snapshots. Replaying the stream must recreate the same state hash.

7.5 Randomness

• Inject a deterministic pseudo-random generator.
• Persist the original seed and algorithm version.
• Never call Math.random() in game, bot, analysis, drill, or replay logic.
• Derive bot-analysis sub-seeds from stable identifiers such as gameSeed + decisionId + botId.
• A replay must not need to reshuffle; the shuffled order or sufficient shuffle events must be persisted.

7.6 State views

Expose three explicitly different views:

1. GameState: authoritative internal state.
2. PlayerObservation: redacted view for a player, bot, live coach, or external agent.
3. OmniscientReplayView: complete state available only after hand end, sandbox, tests, or explicit debug mode.

Never reuse GameState as an API response and then attempt ad hoc field deletion.

────────

8. Domain model

8.1 Core state

```ts
interface GameState {
  schemaVersion: 1;
  gameId: string;
  revision: number;
  ruleset: {
    id: string;
    version: string;
    hash: string;
  };
  seed: string;
  rngVersion: string;
  phase:
    | "setup"
    | "initial_replacements"
    | "awaiting_discard"
    | "awaiting_claims"
    | "awaiting_kong_robbery"
    | "drawing_replacement"
    | "hand_ended"
    | "match_ended";
  match: MatchState;
  hand: HandState;
  players: Record<PlayerId, PlayerState>;
  wall: WallState;
  pending?: PendingDecision;
  lastEventId?: string;
  stateHash: string;
}
```

8.2 Player state

```ts
interface PlayerState {
  id: PlayerId;
  displayName: string;
  controller: "human" | "bot" | "external_llm";
  seat: Wind;
  score: number;
  concealed: TileInstanceId[];
  melds: Meld[];
  bonusTiles: TileInstanceId[];
  discards: DiscardRecord[];
  temporaryRestrictions: TemporaryRestriction[];
}
```

8.3 Meld

```ts
interface Meld {
  id: string;
  kind: "chow" | "pung" | "kong";
  kongKind?: "exposed" | "concealed" | "added";
  tileIds: TileInstanceId[];
  exposed: boolean;
  claimedFrom?: PlayerId;
  claimedTileId?: TileInstanceId;
  createdEventId: string;
}
```

8.4 Legal actions

Every action shown to any client is emitted by the engine with a stable action ID and complete parameters. Clients submit the ID, not an inferred natural-language move.

```ts
type LegalAction =
  | { id: string; type: "discard"; tileId: TileInstanceId }
  | { id: string; type: "declare_win"; source: WinSource; preview: ScoringPreview }
  | { id: string; type: "declare_concealed_kong"; tileIds: TileInstanceId[] }
  | { id: string; type: "declare_added_kong"; meldId: string; tileId: TileInstanceId }
  | { id: string; type: "claim_chow"; discardId: string; tileIdsFromHand: TileInstanceId[] }
  | { id: string; type: "claim_pung"; discardId: string; tileIdsFromHand: TileInstanceId[] }
  | { id: string; type: "claim_kong"; discardId: string; tileIdsFromHand: TileInstanceId[] }
  | { id: string; type: "claim_win"; discardId: string; preview: ScoringPreview }
  | { id: string; type: "pass"; windowId: string };
```

8.5 Revision safety

All action submissions include expectedRevision and requestId. Reject stale or duplicated submissions with a structured error. The local UI should recover by refreshing the observation, not by guessing.

8.6 State invariants

Validate these in development and tests:

• Every physical tile exists in exactly one authoritative zone, except a claimed discard represented by a reference rather than a duplicate tile.
• No standard tile type has more than four physical copies.
• Concealed hand counts are valid for the current phase and number of melds.
• A player cannot act outside the emitted legal-action set.
• Wall boundaries cannot cross.
• Scores sum to the match’s initial total.
• Every event increments revision exactly once.
• Public observations never include hidden tile IDs.
• The state hash is stable across serialization round trips.

────────

9. State machine and edge cases

9.1 Core phases

setup

Resolve rules, seats, controllers, seed, and match options. Build and shuffle tiles.

initial_replacements

Deal, expose initial bonus tiles, and draw replacements until all players hold the proper number of non-bonus tiles.

awaiting_discard

The active player has a legal post-draw or post-claim hand and must choose among emitted actions.

awaiting_claims

The most recent discard may be claimed. Gather hidden responses, then resolve priority.

awaiting_kong_robbery

An added kong has been proposed but not finalized. Eligible opponents may win or pass.

drawing_replacement

Draw from the replacement end after a kong or bonus tile. Repeated bonus replacements are supported.

hand_ended

Freeze live decisions, calculate result, persist review facts, and allow replay or next hand.

match_ended

Show standings, curriculum update, and export options.

9.2 Exhaustive draw

When the live wall is empty:

• Do not draw from the replacement reserve as an ordinary draw.
• End the hand if no pending legal claim resolves.
• Record visible waits for each player in post-hand omniscient review, but do not expose concealed hands during live play.
• Apply configured dealer-repeat behavior.

9.3 Bonus tiles

A bonus tile is never part of the concealed hand, a meld, a pair, a discard, or a winning decomposition. It is exposed immediately and replaced. A chain of bonus replacements is legal.

9.4 Illegal win

The engine must never accept an illegal win. In learning modes, return a helpful structured explanation:

• Hand shape incomplete.
• Hand shape complete but below minimum faan.
• Claimed tile does not complete the hand.
• Player is under an active passed-win restriction.
• Win claim is stale or lower priority after resolution.

Do not simulate punitive “false mahjong” payments in the default product.

9.5 Undo and branching

• Normal competitive and exam games have no destructive undo.
• Learn, guided, socratic, and sandbox modes may branch from a prior decision.
• Branching creates a new branch ID and event stream; it never rewrites history.
• A branched game is clearly labeled as practice and excluded from competitive statistics.

────────

10. Hand solver and analysis engine

10.1 Winning-hand solver

Implement a complete solver for:

• Standard four-meld-plus-pair hands, accounting for already declared melds.
• Seven Pairs.
• Thirteen Orphans.
• Nine Gates and other profile-defined special shapes.

Use tile-count representations for calculation and physical IDs for actions. Memoize subproblems. Return all materially distinct decompositions needed for scoring.

10.2 Distance to ready

For every hand, compute:

• Distance to a standard winning hand.
• Distance to Seven Pairs when enabled.
• Distance to Thirteen Orphans when enabled.
• Minimum overall distance.

The UI term is tiles from ready. The internal implementation may use shanten, but the beginner-facing UI should not require Japanese vocabulary.

10.3 Improving tiles and availability

For each candidate discard:

• List tile types that improve the hand.
• Compute theoretical copies and visible remaining copies.
• Do not subtract opponents’ concealed tiles because they are unknown.
• Report both unique improving tile types and total visible-remaining copies.
• Explain when a nominal improving tile is exhausted.

10.4 Hand direction and value

Evaluate potential paths such as:

• Fast mixed hand.
• All Chows.
• All Pungs.
• Half Flush.
• Full Flush.
• Dragon or wind value.
• Seven Pairs.
• Special-hand pursuit only when sufficiently plausible.

A path estimate must state whether it is already secured, likely, speculative, or impossible under visible information.

10.5 Discard candidate analysis

Each candidate must have normalized components:

```ts
interface DiscardCandidateAnalysis {
  actionId: string;
  tileId: TileInstanceId;
  rank: number;
  totalScore: number;
  confidence: number;
  components: {
    speed: number;
    visibleAvailability: number;
    handValue: number;
    flexibility: number;
    callCompatibility: number;
    relativeSafety: number;
  };
  distanceAfterDiscard: number;
  improvingTileTypes: TileTypeId[];
  visibleImprovingCopies: number;
  likelyFaanPaths: FaanPath[];
  risks: AnalysisFact[];
  facts: AnalysisFact[];
}
```

The exact weighting differs by bot personality and coaching objective. Persist the weighting version in analysis results so historical reviews remain understandable.

10.6 Relative safety, not false guarantees

Hong Kong mahjong does not provide the same permanent safety signals as Japanese riichi. The coach must not label a tile “guaranteed safe” merely because an opponent discarded it earlier. Use relative-risk language based on:

• Visible copies.
• Opponents’ exposed suits and honors.
• Fresh honors late in the hand.
• Fresh terminals or middle tiles against a visibly committed suit.
• Recent discard patterns.
• Number of tiles remaining.
• Whether a player’s exposed melds already establish the minimum faan.

10.7 Monte Carlo analysis

Advanced bots and deep review may use deterministic Monte Carlo rollouts from information sets consistent with the player’s observation.

Requirements:

• Never condition on the actual hidden state during live recommendations.
• Sample unknown tiles from the unseen pool.
• Use a derived seed and fixed iteration count for reproducibility.
• Expose iteration count and uncertainty.
• Fall back to heuristics under the latency budget.

10.8 Analysis facts

Every coaching claim should cite one or more structured fact IDs internally.

```ts
interface AnalysisFact {
  id: string;
  kind:
    | "distance"
    | "improving_tiles"
    | "visible_copies"
    | "faan_path"
    | "relative_risk"
    | "legal_rule"
    | "score_gap"
    | "learner_pattern";
  summary: string;
  data: Record<string, unknown>;
}
```

Facts are persisted with a decision event. This enables deterministic templates, LLM grounding, debugging, and later re-rendering.

────────

11. Computer opponents

11.1 No cheating

A bot receives exactly a PlayerObservation, not GameState. Add tests that make it impossible to instantiate a normal bot with omniscient state.

11.2 Difficulty levels

| Level          | Behavior                                                                      |         Target latency |
| -------------- | ----------------------------------------------------------------------------- | ---------------------: |
| `novice`       | Legal moves, simple tile grouping, occasional configurable mistakes           |                < 25 ms |
| `basic`        | Distance and visible improving tiles; simple calls and faan awareness         |                < 75 ms |
| `intermediate` | Ranked discard analysis, hand direction, minimum-faan planning, relative risk |               < 200 ms |
| `advanced`     | Strong heuristics plus deterministic limited rollouts                         |                  < 1 s |
| `adaptive`     | Selects and gradually adjusts one of the above based on learner performance   | Same as selected level |

11.3 Bot decisions

Bots must handle:

• Discard choice.
• Chow, pung, and kong decisions.
• Whether a kong harms flexibility or exposes risk.
• Legal win claims.
• 3-faan feasibility before opening the hand.
• Different speed/value/risk personalities.

Competitive bots should normally declare every legal win. A teaching scenario may explicitly script a pass, but ordinary bots must not sandbag invisibly.

11.4 Simulation gate

Run at least 10,000 seeded bot-only hands in the full verification suite or a documented extended test command. Requirements:

• Zero illegal actions.
• Zero tile-conservation failures.
• Zero crashes.
• Every game terminates within a reasonable action bound.
• Replaying sampled event logs reproduces the terminal state hash.

────────

12. Adaptive teacher

12.1 Teacher responsibilities

The teacher is responsible for pedagogy, not game authority. It:

• Selects an appropriate amount of help.
• Explains legal actions and rules.
• Ranks strategic alternatives using analysis output.
• Asks short questions before revealing answers in Socratic mode.
• Records decisions and hint usage.
• Identifies recurring mistakes only from stored evidence.
• Schedules drills.
• Produces hand and session reviews.
• Reduces assistance as mastery and confidence rise.

12.2 Per-turn teaching flow

In learn mode:

1. Show the active player’s hand with names available on hover/tap.
2. State the immediate task in plain language.
3. Highlight legal action categories.
4. Show one recommended action and one reason.
5. After the choice, briefly explain the consequence.

In guided mode:

1. Ask the learner to choose unaided.
2. Keep hints behind the three-level hint control.
3. After the choice, interrupt only for a high-impact mistake or curriculum target.

In socratic mode:

1. Ask one concrete question, such as “Which tile leaves the most different ways to improve?”
2. Accept a short answer or direct action.
3. Respond using the deterministic comparison.

In competitive and exam modes, defer all teaching until the hand or match ends.

12.3 One lesson at a time

The default live explanation is no more than two short paragraphs and one optional expandable detail section. Choose the concept with the highest combination of:

• Decision impact.
• Current curriculum priority.
• Learner weakness.
• Recency spacing.
• Explanation simplicity.

12.4 Recommendation language

Use calibrated phrases:

| Score gap / confidence | Suggested language                                   |
| ---------------------- | ---------------------------------------------------- |
| Large / high           | “This is the clear choice because…”                  |
| Moderate               | “This is usually better because…”                    |
| Small                  | “These choices are close; I slightly prefer…”        |
| Analysis uncertain     | “This is a practical preference, not a forced move.” |

12.5 Post-hand review

The review must include:

• Final hand and score breakdown.
• A timeline of the learner’s decisions.
• Up to three highest-impact decisions.
• At least one decision the learner handled well.
• Counterfactual analysis for selected alternatives.
• Concepts practiced and updated mastery.
• One recommended drill or next-game focus.
• Optional omniscient opponent-hand reveal, clearly labeled as post-hand information.

Avoid judging only by whether the player won. Decision quality is the primary learning metric because individual hands contain substantial luck.

12.6 Persistent learner model

Track these concept families:

• Tile recognition.
• Suits, honors, terminals, and bonus tiles.
• Chow, pung, kong, and pair recognition.
• Turn order and claim priority.
• Winning shape.
• Minimum-faan planning.
• Dragon and wind value.
• All Chows and All Pungs.
• Half Flush and Full Flush.
• Wait shapes and improving tiles.
• Tile efficiency.
• Call discipline.
• Kong judgment.
• Visible-tile counting.
• Relative safety and table reading.
• Speed versus value.
• Endgame decisions.
• Scoring and payment.
• Social table procedure and terminology.

```ts
interface ConceptMastery {
  learnerId: string;
  conceptId: string;
  mastery: number; // 0.0 to 1.0
  confidence: number; // 0.0 to 1.0
  attempts: number;
  independentAttempts: number;
  successfulAttempts: number;
  hintWeightedScore: number;
  lastSeenAt?: string;
  nextReviewAt?: string;
  updatedAt: string;
}
```

Use a transparent update algorithm, not a black-box ML model. A weighted exponential moving average is sufficient. Independent correct decisions count more than revealed-hint decisions. Store algorithm version.

12.7 Evidence-backed memory

A longitudinal coach statement must be generated from a query result such as:

```ts
interface LearnerPatternEvidence {
  patternId: string;
  sampleSize: number;
  relevantDecisionIds: string[];
  metric: number;
  comparisonBaseline?: number;
  firstObservedAt: string;
  lastObservedAt: string;
}
```

Do not say “you always…” or “you never…”. Prefer “In 4 of your last 6 relevant decisions…” when sample size supports it. Suppress trend claims with insufficient evidence.

12.8 Adaptive difficulty

Use recent independent decision quality, not short-term win rate alone. Raise difficulty after sustained strong performance and lower it after sustained struggle. Never change difficulty in the middle of a hand without an explicit mode designed for it.

────────

13. Curriculum and drills

13.1 Curriculum stages

| Stage | Name                    | Core outcomes                                                   | Suggested unlock criterion                                |
| ----: | ----------------------- | --------------------------------------------------------------- | --------------------------------------------------------- |
|     0 | Tile literacy           | Name suits, winds, dragons, and common tile faces               | 85% tile-recognition accuracy over 40 independent prompts |
|     1 | Turn flow               | Draw, replace flowers, discard, and follow turn order           | Complete two guided hands with no flow errors             |
|     2 | Melds and winning shape | Recognize chow, pung, kong, pair, and four-meld-plus-pair shape | 80% over 20 drills                                        |
|     3 | Legal calls             | Know who may chow and claim priorities                          | 80% over 20 situations                                    |
|     4 | Three-faan planning     | Identify realistic ways to reach the minimum                    | 75% over 20 scored hands                                  |
|     5 | Tile efficiency         | Compare discards by distance and improving tiles                | Positive decision-quality trend over 30 decisions         |
|     6 | Call discipline         | Open only when speed/value gain justifies flexibility loss      | 75% over 20 call/no-call drills                           |
|     7 | Table reading           | Use visible tiles and exposed melds; understand relative safety | 70% over 20 late-hand drills                              |
|     8 | Full social game        | Play a full standard match with limited help                    | Finish one full match and post-game review                |

Unlocks are recommendations, not hard gates. The user may enter any mode manually.

13.2 Required drill types

1. Name the tile: image → English/Chinese label.
2. Find the tile: name → choose the visual tile.
3. Sort the hand: arrange a randomized hand by suit and rank.
4. Complete the chow: choose valid completing tiles.
5. Identify the meld: chow, pung, kong, pair, or none.
6. Find the winning tile: list or select waits.
7. Count visible copies: use hand, melds, and discards.
8. Count faan: score a completed hand under a named profile.
9. Can this hand win?: distinguish shape-complete from minimum-faan legal.
10. Choose a discard: compare candidate speed and value.
11. Call or pass: chow/pung/kong decision.
12. Which tile is riskier?: relative-safety comparison.
13. Replay quiz: revisit one of the learner’s actual decisions.
14. Social table procedure: calls, exposing a meld, flower replacement, and turn rhythm.

13.3 Spaced repetition

Each drill item has:

• Concept IDs.
• Difficulty.
• Last result.
• Hint level used.
• Next review date.
• Source: generated, bundled, or replay-derived.

Use a simple documented interval schedule. Prioritize weak and due concepts while mixing in mastered material.

13.4 Terminology layer

The tile inspector and glossary must support:

• English.
• Traditional Chinese.
• Simplified Chinese.
• Cantonese Jyutping with tone numbers.
• Mandarin pinyin with tone marks.

Default the Hong Kong table vocabulary to English plus Traditional Chinese and Jyutping. Let the user enable Simplified Chinese and pinyin as an additional study layer.

────────

14. Command-line application

14.1 Human CLI

Required commands:

```text
mahjong play
mahjong play --mode guided --rules hk_nyc_social_v1 --seed demo-001
mahjong play --output human
mahjong play --output jsonl
mahjong serve --stdio --seat player-0
mahjong replay <game-or-hand-id>
mahjong replay <id> --format jsonl
mahjong analyze --hand "1m 2m 3m ..." --rules hk_nyc_social_v1
mahjong drill tiles
mahjong drill scoring
mahjong rules list
mahjong rules show hk_nyc_social_v1
mahjong profile show
mahjong profile export <path>
mahjong profile reset
```

Use a plain terminal renderer with ANSI enhancement, not a renderer that prevents non-interactive use. Support:

• --no-color.
• Narrow terminals.
• Unicode tile glyphs when supported, with explicit text labels as fallback.
• Numbered legal actions.
• Tile compact codes in every hand display.
• A concise and a verbose view.

14.2 Human rendering example

```text
East round · You are South · 63 live tiles · 3-faan minimum

North  [score 500]  melds: [R R R]  flowers: F4
West   [score 500]  melds: —
East   [score 468]  melds: [3s 4s 5s]

Discards
East:  9m  W  1p  7s
South: E   9s  2m
West:  1s  N   8p
North: 9p  G

Your hand
1m 2m 3m | 2p 3p 4p | 4s 5s 6s 7s 8s | Wh Wh | drawn: 9s

Legal actions
[1] Discard 9s
[2] Discard 1m
[3] Declare concealed kong: none
[4] Ask for a nudge
```

The exact formatting may improve, but the same information must be available in JSON.

14.3 JSON Lines protocol

Every line is one complete UTF-8 JSON object. No logs or banners may be mixed into stdout in JSONL mode; diagnostics go to stderr.

Envelope:

```ts
interface ProtocolEnvelope<T> {
  protocolVersion: 1;
  type: string;
  seq: number;
  timestamp: string;
  gameId?: string;
  requestId?: string;
  payload: T;
}
```

Host-to-agent messages:

• hello.
• game_started.
• observation.
• action_request.
• action_accepted.
• action_rejected.
• public_event.
• hand_ended.
• match_ended.
• coach_feedback, when requested and permitted.
• error.
• goodbye.

Agent-to-host messages:

• submit_action with emitted actionId.
• request_hint with level.
• request_analysis when mode permits.
• ping.
• resign only in sandbox/debug; ordinary mahjong hands should finish normally.

Example action request:

```json
{
  "protocolVersion": 1,
  "type": "action_request",
  "seq": 42,
  "gameId": "g_01",
  "requestId": "r_42",
  "payload": {
    "playerId": "p0",
    "expectedRevision": 37,
    "deadline": null,
    "legalActions": [
      { "id": "discard:p0:characters.9#2", "type": "discard", "tileId": "characters.9#2" },
      { "id": "discard:p0:dragon.white#1", "type": "discard", "tileId": "dragon.white#1" }
    ]
  }
}
```

Example response:

```json
{
  "protocolVersion": 1,
  "type": "submit_action",
  "seq": 9,
  "gameId": "g_01",
  "requestId": "r_42",
  "payload": { "playerId": "p0", "expectedRevision": 37, "actionId": "discard:p0:characters.9#2" }
}
```

14.4 External LLM player

Provide an adapter that launches or connects to a process using the JSONL protocol. Requirements:

• The agent receives only its player observation.
• Legal actions are enumerated, so free-form text is unnecessary.
• Invalid, malformed, stale, or timed-out responses are rejected.
• A configured deterministic bot takes over after repeated failures.
• The event log records whether the fallback acted.
• No external agent is permitted in exam statistics unless explicitly labeled.

────────

15. Local server and API

15.1 Server behavior

• Bind to 127.0.0.1 by default.
• Serve the production web build and API from one process.
• Store all game and learner data in a local application data directory.
• Never expose an LLM API key to the browser.
• Use WebSocket messages for live updates and ordinary HTTP for commands, history, and profile queries.

15.2 Required endpoints

```text
GET    /api/health
GET    /api/rulesets
GET    /api/rulesets/:id
POST   /api/games
GET    /api/games/:id/observation?playerId=...
POST   /api/games/:id/actions
POST   /api/games/:id/hints
GET    /api/games/:id/replay
POST   /api/games/:id/branches
GET    /api/profile
PATCH  /api/profile
GET    /api/profile/mastery
GET    /api/curriculum
POST   /api/drills/sessions
POST   /api/drills/sessions/:id/answers
GET    /api/reviews/:handId
GET    /api/export
POST   /api/import
WS     /ws/games/:id
```

Validate all request and response bodies against shared schemas. Return structured error codes, not stack traces.

15.3 Game creation payload

```ts
interface CreateGameRequest {
  mode: "learn" | "guided" | "socratic" | "competitive" | "exam" | "sandbox";
  rulesetId: string;
  matchLength: "one_wind" | "full_four_winds";
  seed?: string;
  human: {
    displayName: string;
    preferredSeat?: Wind;
  };
  opponents: Array<{
    displayName: string;
    difficulty: BotDifficulty;
    personality: "fast" | "value" | "balanced";
  }>;
  coach: {
    enabled: boolean;
    provider: "templates" | "openai";
    verbosity: "brief" | "normal" | "detailed";
  };
}
```

────────

16. Persistence

16.1 SQLite tables

At minimum:

• schema_migrations.
• learners.
• learner_preferences.
• concept_mastery.
• games.
• hands.
• game_events.
• game_snapshots.
• decisions.
• analysis_facts.
• hints.
• reviews.
• drill_items.
• drill_attempts.
• spaced_repetition_schedule.
• llm_requests, storing metadata only by default.

16.2 Transactionality

Persist each accepted command’s events, state snapshot decision, and revision update in one transaction. A crash must not leave half an action applied.

16.3 Snapshot policy

• Store every event.
• Store a snapshot at hand start, hand end, and every configurable number of events.
• Verify snapshot hash against replay in tests.

16.4 Export, import, and deletion

Provide:

• Full local export as versioned JSON.
• Optional export without LLM request metadata.
• Import validation and migration.
• Reset learner progress while retaining settings.
• Delete all local data.

16.5 Privacy defaults

• No telemetry.
• No remote account.
• No API request unless the user selects an LLM provider and configures a key.
• Do not persist complete LLM prompts by default; persist request ID, provider, model, latency, token usage if available, fact IDs, and success/error status.

────────

17. Optional LLM coaching integration

17.1 Provider abstraction

```ts
interface CoachNarrator {
  explain(input: CoachNarrationInput): Promise<CoachNarrationResult>;
}
```

Implement:

• TemplateCoachNarrator: deterministic, local, always available.
• OpenAICoachNarrator: optional server-side adapter using the official TypeScript SDK and Responses API with schema-constrained output.

The model name comes from configuration such as OPENAI_MODEL; do not embed it in core logic. Provide a documented sample .env.example without secrets.

17.2 Input boundary

The LLM receives only:

• Active ruleset summary.
• Redacted player observation.
• Legal actions.
• Deterministic ranked candidate analysis.
• Selected analysis facts.
• Relevant evidence-backed learner patterns.
• Current curriculum objective.
• Tone and length preferences.

It does not receive wall order, opponent concealed hands, an API key, raw database contents, or authority to execute game commands.

17.3 Structured output

Require schema adherence:

```ts
interface CoachNarrationResult {
  recommendedActionId?: string;
  confidence: number;
  headline: string;
  explanation: string;
  alternatives: Array<{
    actionId: string;
    tradeoff: string;
    factIds: string[];
  }>;
  question?: string;
  conceptIds: string[];
  factIds: string[];
  uncertainty?: string;
}
```

Validation rules:

• Every referenced action ID must be legal and supplied in input.
• Every fact ID must exist in input.
• The recommended action must match the deterministic recommendation unless the input explicitly asks for a stylistic alternative.
• Reject unsupported scoring claims.
• On timeout, rate limit, invalid schema, or provider error, fall back to the template narrator without blocking play.

17.4 Prompt behavior

The narrator should:

• Use plain beginner-friendly English by default.
• Avoid Japanese mahjong terminology unless explicitly contrasting variants.
• Distinguish guaranteed rules from strategic preferences.
• Avoid insulting or overly congratulatory language.
• Never invent a prior learner behavior.
• Keep live explanations brief and post-hand reviews more detailed.
• Use the active ruleset’s terminology and values.

17.5 Cost and reliability controls

• LLM is off by default.
• Cache identical narration requests by a hash of ruleset, observation, analysis, learner context, and prompt version.
• Add configurable timeouts and maximum output.
• Stream only in the web coaching panel; gameplay must not wait when template output is available.
• Show provider status and fallback status in settings.

────────

18. Visual web application

18.1 Screens

1. Home / Continue: resume latest game, start a new game, drills, profile, rules.
2. Game setup: mode, ruleset, match length, bot difficulty/personality, seed, coach settings.
3. Table: live visual game.
4. Hand result: winner, hand reveal, scoring, payments, key decisions.
5. Match result: standings, mastery changes, recommended next action.
6. Replay: timeline scrubber, branch, compare alternatives.
7. Drills: visual question and answer flow.
8. Curriculum: mastery map and due reviews.
9. Rules and glossary: active rules, tile catalog, terminology.
10. Settings and data: language overlays, accessibility, LLM provider, export/import/reset.

18.2 Table layout

• Human player at bottom.
• Opponents at left, top, and right.
• Each opponent shows name, seat wind, score, concealed tile backs/count, exposed melds, bonus tiles, and discard area.
• Center shows prevailing wind, hand number, dealer, live-wall count, replacement count when appropriate, active player, and last discard.
• Human hand is large enough for tile recognition and touch input.
• Separate the most recently drawn tile visually.
• Sort hand automatically by default; allow manual order as an advanced preference.
• Action bar shows only emitted legal actions.
• Claim opportunities must be visually obvious and explain who is allowed to claim.

18.3 Teacher panel

The panel has:

• Current objective.
• “Think first” prompt in Socratic mode.
• Nudge, Compare, and Reveal controls where permitted.
• Concise explanation.
• Expandable metrics: distance, improving tiles, visible copies, likely faan paths, relative risk.
• A “Why not this tile?” comparison after the user selects another candidate.
• A tile inspector and glossary link.

The panel must never obscure the human hand on common laptop sizes.

18.4 Tile component

Create original, reusable SVG tile-face components. Do not depend on a remote image CDN. Requirements:

• Recognizable Dots, Bamboo, Characters, Winds, Dragons, Flowers, and Seasons.
• White Dragon represented with a visible frame rather than a visually blank tile.
• One Bamboo may use a simplified bird motif, but it must also show an accessible label.
• Consistent dimensions and baseline.
• Face-up, face-down, selected, disabled, recommended, recently drawn, and claimed states.
• No information communicated by color alone.
• High-contrast and color-vision-friendly modes.
• Text/compact-code fallback.
• Snapshot tests for all tile types and states.

Use system fonts; do not bundle or redistribute font files.

18.5 Tile learning affordances

On hover, focus, or tap, show:

• English name.
• Compact code.
• Traditional and Simplified Chinese.
• Jyutping.
• Pinyin.
• Category and rank.
• Whether the tile is a terminal, honor, or bonus tile.
• Visible count when in a live game.

Optional overlays:

• Arabic rank number on suited tiles.
• Suit label.
• Pronunciation label.
• Beginner group highlighting.

18.6 Replay UI

• Event timeline with draw/discard/call/win markers.
• Step backward and forward.
• Jump to each human decision.
• Show the observation that was actually available then.
• Toggle post-hand omniscient view.
• Display chosen action and ranked alternatives.
• Branch into sandbox from a selected decision.
• Compare resulting distance, improving tiles, faan paths, and rollout estimates.

18.7 Responsive behavior

• Desktop and tablet are first-class.
• Mobile must remain usable in portrait through a compact layout and scrollable opponent details.
• Touch targets at least 44 CSS pixels.
• No hover-only essential interaction.

────────

19. Accessibility and localization

19.1 Accessibility target

Target WCAG 2.2 AA for the web application.

Required:

• Complete keyboard play.
• Visible focus indicators.
• Screen-reader names for every tile and action.
• Announced turn changes, claims, and results through an appropriate live region.
• Reduced-motion preference.
• No color-only recommendation or suit distinction.
• Scalable text without clipping.
• Contrast tests for themes.
• Automated accessibility checks plus manual keyboard smoke test.

19.2 Localization architecture

• English UI is complete.
• Tile and glossary metadata includes zh-Hant, zh-Hans, Jyutping, and pinyin from the first release.
• All visible strings use message IDs rather than being embedded across components.
• A partial Chinese UI may be marked incomplete, but tile vocabulary and action glossary must be complete and tested.

────────

20. Reviews, metrics, and progression

20.1 Decision quality

For a human decision, calculate:

• Rank among legal candidates.
• Score difference from the top candidate.
• Distance difference.
• Visible improving-copy difference.
• Expected hand-value-path difference.
• Relative-risk difference where relevant.
• Whether the choice was within a near-equivalent tolerance.
• Hint level used.

Do not mark a near-tie as a mistake.

20.2 Session summary

Include:

• Hands played.
• Independent decisions.
• Hint usage.
• High-impact strong decisions.
• High-impact improvement opportunities.
• Concepts practiced.
• Mastery movement.
• Tile-recognition accuracy.
• Faan-counting accuracy.
• Recommended next mode and one focus.

20.3 Metrics not to overemphasize

Win rate, points, and placement are shown but not used alone to evaluate learning. The primary learner dashboard emphasizes independent decision quality, concept mastery, and repeated error reduction.

────────

21. Ruleset file format

Use a documented JSON schema. A simplified shape:

```ts
interface RulesetDefinition {
  id: string;
  version: string;
  displayName: string;
  description: string;
  disclaimer: string;
  tileSet: {
    bonusTilesEnabled: boolean;
  };
  winRules: {
    minimumFaan: number;
    capFaan: number;
    multipleWinners: boolean;
    sameTileWinLockUntilNextDraw: boolean;
    allowSevenPairs: boolean;
    allowThirteenOrphans: boolean;
    allowNineGates: boolean;
  };
  kongRules: {
    robAddedKong: boolean;
    robConcealedKong: boolean;
  };
  roundRules: {
    prevailingWinds: Wind[];
    dealerRepeatsOnWin: boolean;
    dealerRepeatsOnDraw: boolean;
  };
  scoringRules: ScoringRuleDefinition[];
  payment: PaymentDefinition;
}
```

Rulesets are validated at startup. Invalid built-in rulesets fail the build/test. Invalid user-imported rulesets return a readable validation report.

────────

22. Testing strategy

22.1 Unit tests

Cover:

• Tile definitions, aliases, parsing, and sorting.
• 136- and 144-tile inventories.
• Seeded shuffle determinism.
• Dealing and chained bonus replacements.
• Turn order.
• Every legal action type.
• Chow direction restriction.
• Pung/kong/win priority.
• Equal-priority seat resolution.
• Multiple-winner option.
• Concealed, exposed, and added kongs.
• Robbing added kong.
• Exhaustive draws.
• Passed-win restriction option.
• Standard and special hand solvers.
• Every scoring rule.
• Every stacking and suppression interaction.
• Minimum-faan rejection.
• Payment formulas and zero-sum scores.
• Observation redaction.
• Event replay and state hashes.
• Mastery updates and spaced repetition.
• Template coach output.
• LLM output validation and fallback.

22.2 Golden scoring fixtures

Create at least 75 human-readable fixtures. Each fixture includes:

• Ruleset ID/version.
• Seat and prevailing wind.
• Concealed tiles.
• Melds.
• Bonus tiles.
• Winning tile and source.
• Expected decomposition.
• Applied and suppressed rules.
• Raw and capped faan.
• Legal-win status.
• Payment result.

Every bundled rule must have a positive fixture and at least one near-miss fixture.

22.3 Property tests

At minimum:

• Tile conservation across arbitrary legal command sequences.
• No legal sequence creates a fifth copy of a standard tile.
• Legal action IDs are unique within a request.
• Submitting an emitted legal action never returns illegal_action against the same revision.
• Replaying events equals incrementally reduced state.
• Serialization round trip preserves state hash.
• Public observations cannot contain another player’s concealed tile IDs.
• Score deltas sum to zero.
• Candidate improving-copy counts remain between 0 and 4 per tile type.

22.4 Simulation tests

• Fast CI simulation: at least 500 hands.
• Full verification simulation: at least 10,000 hands.
• Fixed regression seeds for every discovered crash or rules bug.
• Report action counts and termination reasons.

22.5 API and persistence integration tests

• Create, play, save, restart server, resume.
• Duplicate request idempotency.
• Stale revision rejection.
• Migration from an earlier test schema.
• Export and import round trip.
• LLM key never appears in browser responses or saved exports.

22.6 Browser end-to-end tests

At minimum:

1. Start a seeded guided game.
2. Inspect a tile label.
3. Request each hint level.
4. Discard a tile.
5. Accept or pass a claim opportunity in a scripted scenario.
6. Finish a scripted winning hand.
7. Inspect scoring breakdown.
8. Open replay and branch.
9. Complete a tile drill.
10. Reload and verify progress persists.
11. Complete all critical flows with keyboard only.

22.7 Coverage gates

• core, hk-rules, and protocol: at least 95% statement and branch coverage.
• analysis, bots, coach, and persistence: at least 85% statement coverage.
• UI logic: at least 75% where practical, supplemented by end-to-end tests.

Do not game coverage with meaningless tests or ignore directives.

────────

23. Performance and reliability targets

| Operation                     |    Target on a normal development laptop |
| ----------------------------- | ---------------------------------------: |
| Core legal action application |                              p95 < 10 ms |
| Basic discard analysis        |                             p95 < 100 ms |
| Intermediate discard analysis |                             p95 < 250 ms |
| Advanced analysis             |              configurable, default < 1 s |
| Local API action round trip   | p95 < 100 ms excluding advanced analysis |
| Resume saved game             |               < 500 ms for ordinary logs |
| Initial production page load  |                          < 2.5 s locally |

Additional requirements:

• No unbounded recursion on malformed input.
• Cap simulation depth and iteration count.
• Abort optional LLM requests without blocking the game.
• Persist before acknowledging an accepted action to external clients.
• Gracefully recover from a corrupt latest snapshot by replaying from the prior valid snapshot.

────────

24. Developer experience

24.1 Root scripts

Provide at least:

```json
{
  "scripts": {
    "dev": "run web and server in development",
    "build": "build every workspace in dependency order",
    "start": "start the production local server",
    "lint": "lint all workspaces",
    "format": "format files",
    "format:check": "check formatting",
    "typecheck": "typecheck all workspaces",
    "test": "run unit and integration tests",
    "test:coverage": "run coverage gates",
    "test:sim": "run full bot simulation",
    "test:e2e": "run Playwright tests",
    "verify": "format check, lint, typecheck, tests, coverage, build, smoke tests"
  }
}
```

The actual script values must be executable, not descriptive placeholders.

24.2 Quick start

The completed repository must support a clean-machine flow equivalent to:

```bash
corepack enable
pnpm install
pnpm verify
pnpm dev
```

And a production flow equivalent to:

```bash
pnpm build
pnpm start
```

24.3 Code quality

• No any in core, hk-rules, analysis, or protocol except a narrowly documented interoperability boundary.
• Public types and non-obvious algorithms documented.
• Keep functions small enough to test directly.
• Prefer discriminated unions for commands, events, phases, and actions.
• Avoid inheritance-heavy designs.
• Avoid circular workspace dependencies.
• Pin dependency versions through the lockfile.
• Add dependency only when it materially reduces risk or complexity.

────────

25. Documentation deliverables

README.md

• What the app is.
• Screenshots or locally generated static previews after implementation.
• Quick start.
• CLI examples.
• How to start the web app.
• Ruleset disclaimer.
• Data location.
• Optional LLM setup.
• Test commands.

docs/RULES.md

• Full default game flow.
• Every bundled scoring rule.
• Claim priority.
• Kongs and flowers.
• Match progression.
• Example scoring hands.

docs/HOUSE_RULES.md

• Explain known variation points.
• Compare bundled profiles.
• Explain how to copy and edit a ruleset.

docs/ARCHITECTURE.md

• Package boundaries.
• Command/event flow.
• Persistence and snapshots.
• State views and hidden-information controls.
• Analysis and coaching separation.

docs/PROTOCOL.md

• JSONL and HTTP schemas.
• Complete example session.
• Error codes.
• External LLM/player integration.

docs/COACHING.md

• Fact generation.
• Templates.
• Learner evidence.
• Optional LLM adapter.
• Privacy and fallback behavior.

docs/CURRICULUM.md

• Stages, concepts, drills, mastery updates, and spacing.

docs/ACCESSIBILITY.md

• Keyboard map.
• Screen-reader behavior.
• Visual settings.
• Test procedure.

────────

26. Milestone implementation plan

Codex must copy this into plans.md, expand it with concrete tasks, and update status continuously.

Milestone 0: Repository foundation

Deliver:

• Workspace, TypeScript configs, linting, formatting, test framework, build pipeline.
• Package boundaries and import rules.
• AGENTS.md, plans, implementation log, documentation log.
• CI workflow if repository hosting supports it.

Acceptance:

• pnpm lint, pnpm typecheck, pnpm test, and pnpm build run successfully on the empty/scaffolded packages.

Milestone 1: Tile model, ruleset schema, and deterministic RNG

Deliver:

• All tile definitions and localized metadata.
• Physical tile inventory creation.
• Ruleset JSON schema and bundled profiles.
• Seeded RNG and shuffle.
• Tile parser and compact notation.

Acceptance:

• Tile-count and alias tests pass.
• Same seed produces same wall.
• Ruleset validation rejects malformed data.

Milestone 2: Core hand state machine

Deliver:

• Deal and initial flower replacement.
• Draw, discard, claim windows, priority resolution.
• Chow, pung, all kong types, replacement draws.
• Exhaustive draw and round progression.
• Commands, events, reducer, legal actions, observations.

Acceptance:

• Scripted end-to-end core scenarios pass without UI.
• Property tests prove conservation and observation redaction.

Milestone 3: Winning solver, scoring, and payments

Deliver:

• Standard and special hand solver.
• Ruleset-driven scoring and suppression.
• Minimum-faan validation.
• Payment strategies.
• Golden scoring fixtures.

Acceptance:

• At least 75 scoring fixtures pass.
• Every scoring rule has positive and negative coverage.
• Score deltas sum to zero.

Milestone 4: Analysis and bots

Deliver:

• Distance-to-ready.
• Improving tiles and visible availability.
• Faan paths.
• Relative-risk heuristics.
• Candidate ranking.
• Four bot difficulty levels and three personalities.

Acceptance:

• Bots use only observations.
• Fast simulation passes 500 hands.
• Candidate analyses are deterministic.

Milestone 5: Persistence and replay

Deliver:

• SQLite migrations and repositories.
• Event and snapshot persistence.
• Resume, replay, branch, export, import, and reset.

Acceptance:

• Crash/restart integration test resumes exact state.
• Replay reproduces state hash.
• Export/import round trip passes.

Milestone 6: CLI and JSONL protocol

Deliver:

• Human terminal client.
• Machine JSONL mode.
• External process/player adapter.
• Analyze, drill, rules, profile, and replay commands.

Acceptance:

• A scripted JSONL agent can complete a seeded hand.
• Stdout is valid JSONL with no contamination.
• Invalid external actions fall back safely.

Milestone 7: Local server and visual web table

Deliver:

• API and WebSocket server.
• Game setup and live table.
• Original SVG tile component.
• Legal action controls.
• Save/resume.

Acceptance:

• Browser can complete a seeded hand.
• Visual state matches JSON observation.
• Keyboard-only smoke test passes.

Milestone 8: Teacher, learner memory, curriculum, and drills

Deliver:

• Structured analysis facts.
• Template narration.
• Hint levels and modes.
• Concept mastery and evidence queries.
• Required drill types and spacing.
• Adaptive bot selection.

Acceptance:

• Coaching works offline.
• Memory persists across restart.
• Trend statements require evidence.
• A weak concept schedules a relevant drill.

Milestone 9: Optional OpenAI narrator

Deliver:

• Server-side provider adapter.
• Structured output validation.
• Timeouts, cache, usage metadata, and fallback.
• Settings and provider status.

Acceptance:

• Unit tests use a fake provider.
• Invalid model output falls back to templates.
• Browser never receives the API key.
• App remains fully functional with no key.

Milestone 10: Replay analysis, polish, and hardening

Deliver:

• Decision timeline, alternate comparisons, omniscient post-hand toggle, branch UI.
• Full scoring display and rules glossary.
• Accessibility and responsive polish.
• Full documentation and seed fixtures.

Acceptance:

• Playwright critical flows pass.
• Full pnpm verify passes.
• Production server starts and smoke test completes.
• No critical-path placeholder or known data-loss bug remains.

────────

27. Definition of done

The implementation is complete only when all of these are true:

1. A new user can install dependencies and run the app from documented commands.
2. A user can complete a visual four-player game against three bots.
3. The same engine can be played through the human CLI.
4. An external agent can play through versioned JSONL without pixels.
5. Default 144-tile flower play and optional 136-tile play both work.
6. Chow, pung, all kong types, flower replacement, win claims, claim priority, and exhaustive draws work.
7. The default 3-faan profile and alternate profile score correctly against fixtures.
8. The app rejects a complete but under-minimum hand with an accurate explanation.
9. Games save automatically, resume after restart, replay deterministically, and branch safely.
10. The visual tile set is recognizable, accessible, and entirely local.
11. Offline teacher mode gives grounded recommendations and post-hand reviews.
12. Learner mastery and evidence-backed patterns persist across sessions.
13. Drills cover tile recognition, melds, waits, faan, calls, discards, and table reading.
14. Optional LLM narration validates structured output and falls back cleanly.
15. Bots never access hidden state and complete the simulation gate.
16. Critical browser flows pass keyboard and accessibility checks.
17. pnpm verify exits successfully.
18. implementation.md and documentation.md accurately describe what shipped.

────────

28. Required acceptance scenarios

Scenario A: First-time learner

• Open the web app with no prior database.
• Choose Learn mode and training_relaxed_v1.
• See a short tile-orientation lesson.
• Start a game with named beginner bots.
• Hover/tap every tile for labels and pronunciation.
• Receive a concise discard recommendation.
• Complete a hand and see how the same hand would be judged under the 3-faan profile.

Scenario B: Standard 3-faan play

• Start hk_nyc_social_v1 with a fixed seed.
• Form a dragon pung and half-flush direction.
• Claim a legal pung.
• Reject an illegal chow from the wrong seat.
• Win with at least 3 faan.
• Show applied and suppressed scoring rules and zero-sum payments.

Scenario C: Under-minimum complete hand

• Construct a complete one-faan hand in sandbox.
• declare_win is absent or returns a preview marked illegal, depending on UI design.
• Explanation states current faan, minimum, and missing amount.
• Training profile permits the same shape.

Scenario D: Kong and robbery

• Create an exposed pung.
• Later draw the fourth tile and propose an added kong.
• Open a robbing-kong window.
• Resolve an eligible win correctly; otherwise complete the kong and replacement draw.

Scenario E: LLM protocol

• Launch mahjong serve --stdio.
• Read hello, observation, and action_request lines.
• Submit a legal action ID.
• Receive acceptance and subsequent public events.
• Submit an invalid action and receive a structured rejection without process failure.

Scenario F: Persistent coach

• Make several related suboptimal decisions across two sessions.
• Restart the application.
• Coach retrieves a statistically supported pattern with sample size.
• Curriculum schedules a matching drill.
• After improved independent performance, mastery rises and hints become less proactive.

Scenario G: Replay integrity

• Finish a seeded hand.
• Reload it from the database.
• Replay every event to the terminal hash.
• Scrub to a human decision and show only information available then.
• Toggle omniscient post-hand mode.
• Branch from that decision into sandbox without modifying original history.

────────

29. Suggested AGENTS.md contents

Codex should create a concise version of the following at repository root:

```md
# Repository instructions

## Source of truth

- Read `CODEX_HANDOFF_HK_MAHJONG.md` before substantial work.
- `plans.md` defines milestone order and acceptance criteria.
- Update `implementation.md` and `documentation.md` continuously.

## Correctness

- The pure game engine is authoritative.
- Never put rules or scoring logic in UI code.
- Never expose hidden tiles through observations, bots, live coaching, logs, or APIs.
- All randomness must use the seeded RNG abstraction.
- All ruleset variation must be explicit and versioned.

## Validation

- Run relevant unit tests after each change.
- Run lint and typecheck before completing a milestone.
- Stop and fix validation failures before moving on.
- Add a regression seed or fixture for every discovered rules bug.

## TypeScript

- Strict mode is mandatory.
- Avoid `any` in domain packages.
- Use discriminated unions and exhaustive checks.
- Validate all external data at runtime.

## Scope

- Prioritize engine, scoring, persistence, protocol, and learning correctness over animation.
- Do not add online multiplayer, wagering, Japanese rules, or cloud accounts.
- Do not leave critical-path placeholders or disabled tests.
```

────────

30. Example player observation

```json
{
  "schemaVersion": 1,
  "gameId": "g_demo_001",
  "revision": 37,
  "ruleset": {
    "id": "hk_nyc_social_v1",
    "version": "1.0.0",
    "minimumFaan": 3,
    "capFaan": 10,
    "bonusTilesEnabled": true
  },
  "phase": "awaiting_discard",
  "viewer": {
    "playerId": "p0",
    "seat": "south",
    "score": 500
  },
  "round": {
    "prevailingWind": "east",
    "dealerPlayerId": "p3",
    "handIndex": 2,
    "liveWallCount": 63
  },
  "players": [
    {
      "playerId": "p0",
      "seat": "south",
      "displayName": "You",
      "concealedTileCount": 14,
      "melds": [],
      "bonusTiles": [],
      "discards": ["wind.east", "bamboo.9", "characters.2"]
    },
    {
      "playerId": "p1",
      "seat": "west",
      "displayName": "Ming",
      "concealedTileCount": 13,
      "melds": [],
      "bonusTiles": [],
      "discards": ["bamboo.1", "wind.north", "dots.8"]
    },
    {
      "playerId": "p2",
      "seat": "north",
      "displayName": "Jade",
      "concealedTileCount": 10,
      "melds": [
        {
          "kind": "pung",
          "tiles": ["dragon.red", "dragon.red", "dragon.red"],
          "exposed": true,
          "claimedFrom": "p3"
        }
      ],
      "bonusTiles": ["season.winter"],
      "discards": ["dots.9", "dragon.green"]
    },
    {
      "playerId": "p3",
      "seat": "east",
      "displayName": "Alex",
      "concealedTileCount": 10,
      "melds": [
        {
          "kind": "chow",
          "tiles": ["bamboo.3", "bamboo.4", "bamboo.5"],
          "exposed": true,
          "claimedFrom": "p2"
        }
      ],
      "bonusTiles": [],
      "discards": ["characters.9", "wind.west", "dots.1", "bamboo.7"]
    }
  ],
  "private": {
    "concealedTiles": [
      "characters.1#1",
      "characters.2#2",
      "characters.3#4",
      "dots.2#1",
      "dots.3#1",
      "dots.4#2",
      "bamboo.4#1",
      "bamboo.5#2",
      "bamboo.6#2",
      "bamboo.7#4",
      "bamboo.8#1",
      "dragon.white#1",
      "dragon.white#3",
      "bamboo.9#2"
    ],
    "drawnTileId": "bamboo.9#2"
  },
  "legalActions": [
    {
      "id": "discard:p0:bamboo.9#2",
      "type": "discard",
      "tileId": "bamboo.9#2"
    },
    {
      "id": "discard:p0:dragon.white#1",
      "type": "discard",
      "tileId": "dragon.white#1"
    }
  ]
}
```

The example abbreviates the legal-action list; real output must include every legal discard.

────────

31. Example deterministic coaching result

```json
{
  "decisionId": "d_01J...",
  "analysisVersion": "1.0.0",
  "recommendedActionId": "discard:p0:bamboo.9#2",
  "confidence": 0.78,
  "scoreGap": 0.19,
  "headline": "Discard 9 Bamboo to keep the widest set of useful draws.",
  "facts": [
    {
      "id": "fact_distance_equal",
      "kind": "distance",
      "summary": "Both leading choices leave the hand two tiles from ready.",
      "data": { "distance": 2 }
    },
    {
      "id": "fact_more_improvers",
      "kind": "improving_tiles",
      "summary": "Discarding 9 Bamboo leaves 7 visible improving tile types; breaking the White Dragon pair leaves 5.",
      "data": { "recommended": 7, "alternative": 5 }
    },
    {
      "id": "fact_value_pair",
      "kind": "faan_path",
      "summary": "Keeping the White Dragon pair preserves a possible one-faan dragon pung.",
      "data": { "ruleId": "dragon_pung", "secured": false }
    }
  ],
  "alternatives": [
    {
      "actionId": "discard:p0:dragon.white#1",
      "tradeoff": "Slightly simpler shape, but it gives up a useful value pair and fewer visible improving tiles.",
      "factIds": ["fact_more_improvers", "fact_value_pair"]
    }
  ],
  "conceptIds": ["tile_efficiency", "dragon_value"],
  "uncertainty": "The candidates are not identical, but the recommendation is strategic rather than forced."
}
```

────────

32. Error codes

Define stable machine-readable codes, including:

• invalid_request.
• unknown_game.
• unknown_player.
• stale_revision.
• duplicate_request.
• not_players_turn.
• action_not_legal.
• claim_window_closed.
• win_shape_incomplete.
• win_below_minimum_faan.
• passed_win_restriction.
• ruleset_invalid.
• persistence_failure.
• external_agent_timeout.
• llm_provider_unavailable.
• llm_output_invalid.

Each error contains a safe human message and structured details. Never expose database paths, keys, or stack traces to browser clients.

────────

33. Seeded demo scenarios

Ship deterministic demos accessible from the home screen and CLI:

1. demo_tile_basics: relaxed hand emphasizing tile identification.
2. demo_claim_priority: simultaneous chow and pung opportunity.
3. demo_three_faan: hand that needs a dragon pung to meet the minimum.
4. demo_half_flush: realistic decision about committing to one suit.
5. demo_kong: concealed, exposed, and added kong sequence.
6. demo_robbing_kong: added kong interrupted by a legal win.
7. demo_under_minimum: complete but illegal hand under standard profile.
8. demo_last_tile: last-tile draw/discard scoring.
9. demo_replay_branch: hand with a meaningful alternate discard.
10. demo_scoring_limit: one limit-hand scoring example.

Every demo is represented by a seed plus scripted setup/events or a validated scenario fixture. It must run in both CLI and web clients.

────────

34. Final Codex report format

At the end of the run, update implementation.md and output a report with:

1. What was implemented by milestone.
2. Exact commands to install, verify, run CLI, and run web.
3. Test totals, coverage, and simulation count.
4. Database location and reset command.
5. Bundled rulesets and important assumptions.
6. Optional LLM setup and fallback behavior.
7. Known limitations, each with severity and workaround.
8. Files that deserve human review first.
9. Confirmation that no hidden-information path was found in tests.
10. Confirmation that pnpm verify and production smoke test passed, or the exact failing command and error if they did not.

Do not claim completion when validation is failing.

────────

35. Implementation priorities when time is constrained

If the overnight run cannot finish every enhancement, preserve this order:

1. Correct deterministic engine and hidden-information separation.
2. Ruleset-driven scoring and comprehensive tests.
3. JSONL protocol and playable CLI.
4. Save/resume and replay integrity.
5. Functional visual table with recognizable tiles.
6. Deterministic analysis and bots.
7. Offline teacher and learner memory.
8. Required drills and reviews.
9. Optional LLM narration.
10. Visual polish and nonessential animation.

A missing optional LLM integration is acceptable if the offline teacher is complete. A visually polished app with uncertain scoring or hidden-information leaks is not acceptable.

────────

36. Research and rules caveat

Hong Kong-style mahjong is a family of related table rules. Sources commonly agree on the four-meld-plus-pair structure, chow/pung/kong flow, and frequent use of a 3-faan minimum, but scoring values, cap, payments, special hands, flowers, and penalties vary. This specification therefore treats the default as a teaching profile and requires all disputed details to be visible, versioned, tested, and replaceable.

The product should encourage the learner to ask a real group which house rules it uses, then select or customize the corresponding profile. That behavior is a feature, not an admission of engine uncertainty.
