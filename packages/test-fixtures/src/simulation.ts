import { performance } from "node:perf_hooks";
import { ANALYSIS_VERSION } from "@hk-mahjong/analysis";
import {
  BOT_POLICY_VERSION,
  createBotPolicy,
  type BotDifficulty,
  type BotPersonality,
  type BotPolicy,
} from "@hk-mahjong/bots";
import {
  RNG_VERSION,
  WINDS,
  assertStateInvariants,
  authoritativeTileZones,
  canonicalJsonHash,
  createGameEngine,
  createTileInventory,
  getTileDefinition,
  replayEvents,
  shuffle,
  tileTypeFromInstanceId,
  type GameEngine,
  type GameEvent,
  type GameState,
  type PlayerObservation,
  type RandomSource,
  type TileInstanceId,
  type WallProviderContext,
  type Wind,
} from "@hk-mahjong/core";
import {
  createHongKongScoringSystem,
  getBundledRuleset,
  toCoreGameRules,
  type ResolvedRuleset,
} from "@hk-mahjong/hk-rules";

const BOT_IDS = ["bot-0", "bot-1", "bot-2", "bot-3"] as const;
const RULESET_IDS = ["hk_nyc_social_v1", "training_relaxed_v1", "hk_modern_13f_v1"] as const;
const DIFFICULTIES: readonly BotDifficulty[] = ["novice", "basic", "intermediate", "advanced"];
const PERSONALITIES: readonly BotPersonality[] = ["fast", "value", "balanced"];
const REPLAY_SAMPLE_LIMIT = 500;
const MAXIMUM_SIMULATION_HANDS = 10_000;
const MAXIMUM_HANDS_PER_MATCH = 32;
const MAXIMUM_ACCEPTED_COMMANDS_PER_HAND = 1_024;
const NATURAL_SHUFFLE_MATCHES = 3;
const DEFAULT_SIMULATION_SEED_NAMESPACE = "m4-simulation";

type SimulationWallProfile = "natural_shuffle" | "terminal_regression";

export type SimulationWallMode = "mixed" | "natural_shuffle";

export interface BotSimulationOptions {
  wallMode?: SimulationWallMode;
  seedNamespace?: string;
  matchIndexOffset?: number;
}

interface ResolvedBotSimulationOptions {
  wallMode: SimulationWallMode;
  seedNamespace: string;
  matchIndexOffset: number;
}

const resolveSimulationOptions = (options: BotSimulationOptions): ResolvedBotSimulationOptions => {
  const wallMode: unknown = options.wallMode ?? "mixed";
  if (wallMode !== "mixed" && wallMode !== "natural_shuffle") {
    throw new RangeError(`Unsupported simulation wall mode ${String(wallMode)}`);
  }
  const seedNamespace = options.seedNamespace ?? DEFAULT_SIMULATION_SEED_NAMESPACE;
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/u.test(seedNamespace)) {
    throw new RangeError(
      "Simulation seed namespace must be 1 through 96 ASCII letters, digits, '.', '_', ':', or '-'",
    );
  }
  const matchIndexOffset = options.matchIndexOffset ?? 0;
  if (!Number.isSafeInteger(matchIndexOffset) || matchIndexOffset < 0) {
    throw new RangeError("Simulation match index offset must be a non-negative safe integer");
  }
  return { wallMode, seedNamespace, matchIndexOffset };
};

const wallProfileFor = (
  wallMode: SimulationWallMode,
  matchIndex: number,
  handIndex: number,
): SimulationWallProfile =>
  wallMode === "natural_shuffle" || (matchIndex < NATURAL_SHUFFLE_MATCHES && handIndex === 0)
    ? "natural_shuffle"
    : "terminal_regression";

/**
 * A short deterministic hand for scale testing. Normal policies still rank and submit every
 * action. East cannot win initially; every East discard is a terminal or honor that completes
 * South's thirteen-sided Thirteen Orphans wait. The unused tail is shuffled by the injected RNG.
 */
const terminalRegressionWall = (
  inventory: readonly TileInstanceId[],
  random: RandomSource,
  context: WallProviderContext,
): readonly TileInstanceId[] => {
  const remaining = [...inventory];
  const take = (tileId: TileInstanceId): TileInstanceId => {
    const index = remaining.indexOf(tileId);
    if (index < 0) {
      throw new Error(`Terminal simulation wall ${context.seed} is missing ${tileId}`);
    }
    return remaining.splice(index, 1)[0]!;
  };
  const takeStandard = (): TileInstanceId => {
    const index = remaining.findIndex(
      (tileId) => !getTileDefinition(tileTypeFromInstanceId(tileId)).bonus,
    );
    if (index < 0) {
      throw new Error(`Terminal simulation wall ${context.seed} exhausted standard tiles`);
    }
    return remaining.splice(index, 1)[0]!;
  };
  const orphanTypes = [
    "characters.1",
    "characters.9",
    "dots.1",
    "dots.9",
    "bamboo.1",
    "bamboo.9",
    "wind.east",
    "wind.south",
    "wind.west",
    "wind.north",
    "dragon.red",
    "dragon.green",
    "dragon.white",
  ] as const;
  const east = [
    ...orphanTypes
      .filter((typeId) => typeId !== "dragon.green")
      .map((typeId) => take(`${typeId}#2` as TileInstanceId)),
    take("characters.1#3"),
    take("characters.9#3"),
  ];
  const south = orphanTypes.map((typeId) => take(`${typeId}#1` as TileInstanceId));
  const west = Array.from({ length: 13 }, () => takeStandard());
  const north = Array.from({ length: 13 }, () => takeStandard());
  const dealt: TileInstanceId[] = [];
  for (let round = 0; round < 13; round += 1) {
    dealt.push(east[round]!, south[round]!, west[round]!, north[round]!);
  }
  dealt.push(east[13]!);
  return [...dealt, ...shuffle(remaining, random)];
};

type BotId = (typeof BOT_IDS)[number];
type ActionType = PlayerObservation["legalActions"][number]["type"];
type TerminationReason = "win" | "exhaustive_draw" | "sandbox_end";

const ACTION_TYPES: readonly ActionType[] = [
  "discard",
  "declare_win",
  "declare_concealed_kong",
  "declare_added_kong",
  "claim_chow",
  "claim_pung",
  "claim_kong",
  "claim_win",
  "pass",
  "start_next_hand",
];

export interface SimulationLatencySummary {
  p50Milliseconds: number;
  p95Milliseconds: number;
  p99Milliseconds: number;
  maximumMilliseconds: number;
}

export interface SimulationRulesetIdentity {
  id: string;
  version: string;
  hash: string;
}

export interface SimulationReplaySample {
  globalHandIndex: number;
  terminalStateHash: string;
  eventPrefixDigest: string;
}

export interface BotSimulationSummary {
  schemaVersion: 1;
  versions: {
    rng: typeof RNG_VERSION;
    analysis: typeof ANALYSIS_VERSION;
    botPolicy: typeof BOT_POLICY_VERSION;
  };
  rulesets: readonly SimulationRulesetIdentity[];
  wallMode: SimulationWallMode;
  seedNamespace: string;
  matchIndexOffset: number;
  requestedHands: number;
  completedHands: number;
  matchesStarted: number;
  completedMatches: number;
  replaySamples: readonly SimulationReplaySample[];
  replaySampleIndices: readonly number[];
  handDigestCount: number;
  handDigestRoot: string;
  maximumAcceptedCommands: number;
  meanAcceptedCommands: number;
  actionCounts: Readonly<Record<ActionType, number>>;
  terminationReasons: Readonly<Record<TerminationReason, number>>;
  rulesetHandCounts: Readonly<Record<string, number>>;
  wallProfileCounts: Readonly<Record<SimulationWallProfile, number>>;
  configurationCounts: Readonly<Record<string, number>>;
  decisionConfigurationCounts: Readonly<Record<string, number>>;
  failures: {
    illegalActions: 0;
    invariantViolations: 0;
    crashes: 0;
    commandBoundExceeded: 0;
    replayMismatches: 0;
  };
  latency: SimulationLatencySummary;
  regressionSeeds: readonly string[];
  runDigest: string;
}

export interface SimulationSeatProfile {
  botId: BotId;
  seat: Wind;
  difficulty: BotDifficulty;
  personality: BotPersonality;
}

export interface BotSimulationHandLedger {
  matchIndex: number;
  matchHandIndex: number;
  matchSeed: string;
  handSeed: string;
  ruleset: SimulationRulesetIdentity;
  seatProfiles: readonly SimulationSeatProfile[];
  orderedActionTrace: readonly string[];
  eventPrefixDigest: string;
  eventCount: number;
  commandCount: number;
  wallProfile: SimulationWallProfile;
  actionCounts: Readonly<Record<ActionType, number>>;
  decisionConfigurationCounts: Readonly<Record<string, number>>;
  termination: TerminationReason;
  terminalStateHash: string;
  terminalStateDigest: string;
  decisionLatencies: readonly number[];
}

export interface BotSimulationMatchLedger {
  schemaVersion: 1;
  matchIndex: number;
  matchSeed: string;
  ruleset: SimulationRulesetIdentity;
  completedMatch: boolean;
  hands: readonly BotSimulationHandLedger[];
  events: readonly GameEvent[];
}

export interface BotSimulationAccumulator {
  readonly complete: boolean;
  readonly nextMatchIndex: number;
  acceptMatch(match: BotSimulationMatchLedger): void;
  finish(): BotSimulationSummary;
}

interface HandPolicies {
  handId: string;
  profiles: readonly SimulationSeatProfile[];
  byBotId: Readonly<Record<BotId, BotPolicy>>;
}

const roundedMilliseconds = (value: number): number => Math.round(value * 1_000) / 1_000;

const percentileOfSorted = (ordered: readonly number[], quantile: number): number => {
  if (ordered.length === 0) {
    return 0;
  }
  const index = Math.max(0, Math.ceil(quantile * ordered.length) - 1);
  return ordered[index]!;
};

const latencySummary = (values: number[]): SimulationLatencySummary => {
  values.sort((left, right) => left - right);
  return {
    p50Milliseconds: roundedMilliseconds(percentileOfSorted(values, 0.5)),
    p95Milliseconds: roundedMilliseconds(percentileOfSorted(values, 0.95)),
    p99Milliseconds: roundedMilliseconds(percentileOfSorted(values, 0.99)),
    maximumMilliseconds: roundedMilliseconds(values.at(-1) ?? 0),
  };
};

const assertSimulationStep = (state: GameState, expectedInventory: ReadonlySet<string>): void => {
  const zones = authoritativeTileZones(state);
  if (
    zones.length !== expectedInventory.size ||
    new Set(zones).size !== expectedInventory.size ||
    zones.some((tileId) => !expectedInventory.has(tileId))
  ) {
    throw new Error("Simulation step violated physical tile conservation");
  }
  const totalScore = Object.values(state.players).reduce(
    (total, player) => total + player.score,
    0,
  );
  if (totalScore !== state.match.initialTotalScore) {
    throw new Error("Simulation step violated zero-sum score conservation");
  }
};

const emptyActionCounts = (): Record<ActionType, number> =>
  Object.fromEntries(ACTION_TYPES.map((type) => [type, 0])) as Record<ActionType, number>;

const emptyRulesetCounts = (): Record<string, number> =>
  Object.fromEntries(RULESET_IDS.map((id) => [id, 0]));

const emptyWallProfileCounts = (): Record<SimulationWallProfile, number> => ({
  natural_shuffle: 0,
  terminal_regression: 0,
});

const emptyConfigurationCounts = (): Record<string, number> =>
  Object.fromEntries(
    DIFFICULTIES.flatMap((difficulty) =>
      PERSONALITIES.map((personality) => [`${difficulty}:${personality}`, 0]),
    ),
  );

const replayIndicesFor = (requestedHands: number): readonly number[] => {
  if (requestedHands <= REPLAY_SAMPLE_LIMIT) {
    return Array.from({ length: requestedHands }, (_, index) => index);
  }
  return Array.from({ length: REPLAY_SAMPLE_LIMIT }, (_, index) =>
    Math.floor((index * (requestedHands - 1)) / (REPLAY_SAMPLE_LIMIT - 1)),
  );
};

const rulesetIdentity = (ruleset: ResolvedRuleset): SimulationRulesetIdentity => ({
  id: ruleset.definition.id,
  version: ruleset.definition.version,
  hash: ruleset.hash,
});

const seatOrderedPlayers = (state: GameState): readonly GameState["players"][string][] =>
  Object.values(state.players).sort(
    (left, right) => WINDS.indexOf(left.seat) - WINDS.indexOf(right.seat),
  );

const profilesForHand = (
  state: GameState,
  matchIndex: number,
  matchHandSequence: number,
): readonly SimulationSeatProfile[] =>
  seatOrderedPlayers(state).map((player, seatIndex): SimulationSeatProfile => {
    const botIndex = BOT_IDS.indexOf(player.id as BotId);
    if (botIndex < 0) {
      throw new Error(`Simulation encountered unknown bot identity ${player.id}`);
    }
    const configurationIndex =
      (matchIndex + matchHandSequence * WINDS.length + seatIndex) %
      (DIFFICULTIES.length * PERSONALITIES.length);
    const difficultyIndex = Math.floor(configurationIndex / PERSONALITIES.length);
    return {
      botId: player.id as BotId,
      seat: player.seat,
      difficulty: DIFFICULTIES[difficultyIndex]!,
      personality: PERSONALITIES[configurationIndex % PERSONALITIES.length]!,
    };
  });

const policiesForHand = (
  state: GameState,
  ruleset: ResolvedRuleset,
  matchIndex: number,
  matchHandSequence: number,
): HandPolicies => {
  const profiles = profilesForHand(state, matchIndex, matchHandSequence);
  return {
    handId: state.hand.id,
    profiles,
    byBotId: Object.fromEntries(
      profiles.map(({ botId, difficulty, personality }) => [
        botId,
        createBotPolicy({
          botId,
          difficulty,
          personality,
          ruleset,
        }),
      ]),
    ) as Readonly<Record<BotId, BotPolicy>>,
  };
};

const initialPlayers = (
  matchIndex: number,
): readonly [
  { id: BotId; displayName: string; controller: "bot"; seat: Wind },
  { id: BotId; displayName: string; controller: "bot"; seat: Wind },
  { id: BotId; displayName: string; controller: "bot"; seat: Wind },
  { id: BotId; displayName: string; controller: "bot"; seat: Wind },
] => {
  const players = WINDS.map((seat, seatIndex) => {
    const botId = BOT_IDS[(seatIndex + matchIndex) % BOT_IDS.length]!;
    return {
      id: botId,
      displayName: `Bot ${botId.slice("bot-".length)}`,
      controller: "bot" as const,
      seat,
    };
  });
  return [players[0]!, players[1]!, players[2]!, players[3]!];
};

const selectActor = (
  engine: GameEngine,
  state: GameState,
): { botId: BotId; observation: PlayerObservation } => {
  for (const player of seatOrderedPlayers(state)) {
    const observation = engine.observation(state, player.id);
    if (observation.legalActions.length > 0) {
      return { botId: player.id as BotId, observation };
    }
  }
  throw new Error(`Simulation reached ${state.phase} without a legal actor`);
};

const maximum = (values: readonly number[]): number => {
  let result = 0;
  for (const value of values) {
    result = Math.max(result, value);
  }
  return result;
};

const assertRequestedHands = (requestedHands: number): void => {
  if (
    !Number.isSafeInteger(requestedHands) ||
    requestedHands < 1 ||
    requestedHands > MAXIMUM_SIMULATION_HANDS
  ) {
    throw new RangeError(
      `Simulation count must be a safe integer from 1 through ${String(MAXIMUM_SIMULATION_HANDS)}`,
    );
  }
};

const matchSeedFor = (
  matchIndex: number,
  ruleset: ResolvedRuleset,
  seedNamespace: string,
): string =>
  `${seedNamespace}:match:${String(matchIndex).padStart(8, "0")}` +
  `:ruleset:${ruleset.definition.id}`;

export const runBotMatchSimulation = (
  matchIndex: number,
  maximumHands: number,
  options: BotSimulationOptions = {},
): BotSimulationMatchLedger => {
  if (!Number.isSafeInteger(matchIndex) || matchIndex < 0) {
    throw new RangeError("Simulation match index must be a non-negative safe integer");
  }
  assertRequestedHands(maximumHands);
  const resolvedOptions = resolveSimulationOptions(options);

  const bundledRulesets = RULESET_IDS.map(getBundledRuleset);
  const ruleset = bundledRulesets[matchIndex % bundledRulesets.length]!;
  const engine = createGameEngine({
    scoringSystem: createHongKongScoringSystem(ruleset),
    wallProvider: (inventory, random, context) =>
      wallProfileFor(resolvedOptions.wallMode, matchIndex, context.handIndex) === "natural_shuffle"
        ? shuffle(inventory, random)
        : terminalRegressionWall(inventory, random, context),
  });
  const expectedInventory = new Set(
    createTileInventory(ruleset.definition.tileSet.bonusTilesEnabled),
  );
  const matchSeed = matchSeedFor(matchIndex, ruleset, resolvedOptions.seedNamespace);
  const created = engine.create({
    type: "create_game",
    requestId: `create:${matchSeed}`,
    branchId: "main",
    seed: matchSeed,
    mode: "competitive",
    matchLength: "one_wind",
    rules: toCoreGameRules(ruleset),
    players: initialPlayers(matchIndex),
  });
  if (!created.accepted) {
    throw new Error(`Simulation ${matchSeed} could not create a game: ${created.error.message}`);
  }
  let state = created.state;
  const events: GameEvent[] = [...created.events];
  const hands: BotSimulationHandLedger[] = [];
  let policies: HandPolicies | null = null;
  let matchCommandSequence = 0;
  let handAcceptedCommands = 0;
  let handActionTrace: string[] = [];
  let handActionCounts = emptyActionCounts();
  let handDecisionConfigurationCounts = emptyConfigurationCounts();
  let handDecisionLatencies: number[] = [];
  assertSimulationStep(state, expectedInventory);

  const handLimit = Math.min(maximumHands, MAXIMUM_HANDS_PER_MATCH);
  while (hands.length < handLimit) {
    if (policies?.handId !== state.hand.id) {
      policies = policiesForHand(state, ruleset, matchIndex, hands.length);
    }
    const { botId, observation } = selectActor(engine, state);
    const policy = policies.byBotId[botId];
    const startedAt = performance.now();
    const botDecision = policy.decide(observation);
    handDecisionLatencies.push(performance.now() - startedAt);
    if (botDecision === null) {
      throw new Error(`Simulation ${matchSeed} bot ${botId} returned no decision`);
    }
    const decisionConfiguration = `${botDecision.difficulty}:${botDecision.personality}`;
    if (!(decisionConfiguration in handDecisionConfigurationCounts)) {
      throw new Error(`Simulation ${matchSeed} produced unknown bot configuration`);
    }
    handDecisionConfigurationCounts[decisionConfiguration] =
      (handDecisionConfigurationCounts[decisionConfiguration] ?? 0) + 1;
    const selected = observation.legalActions.find(({ id }) => id === botDecision.actionId);
    if (
      selected === undefined ||
      botDecision.branchId !== observation.branchId ||
      botDecision.practiceBranch !== observation.practiceBranch ||
      botDecision.observationRevision !== observation.revision ||
      botDecision.actionType !== selected.type
    ) {
      throw new Error(
        `Simulation ${matchSeed} bot ${botId} selected an action outside its exact observation`,
      );
    }

    matchCommandSequence += 1;
    const result = engine.decide(state, {
      type: "submit_action",
      gameId: observation.gameId,
      branchId: observation.branchId,
      playerId: botId,
      expectedRevision: observation.revision,
      requestId:
        `${matchSeed}:command:${String(matchCommandSequence).padStart(6, "0")}` + `:${botId}`,
      actionId: selected.id,
    });
    if (!result.accepted) {
      throw new Error(
        `Simulation ${matchSeed} rejected ${selected.type} for ${botId}: ` +
          `${result.error.code} ${result.error.message}`,
      );
    }
    state = result.state;
    events.push(...result.events);
    handActionCounts[selected.type] += 1;
    if (selected.type !== "start_next_hand") {
      handAcceptedCommands += 1;
      handActionTrace.push(selected.id);
      if (handAcceptedCommands > MAXIMUM_ACCEPTED_COMMANDS_PER_HAND) {
        throw new Error(
          `Simulation ${matchSeed} exceeded ${String(MAXIMUM_ACCEPTED_COMMANDS_PER_HAND)} ` +
            "accepted commands in one hand",
        );
      }
    }
    assertSimulationStep(state, expectedInventory);

    if (state.phase !== "hand_ended" && state.phase !== "match_ended") {
      continue;
    }
    const resultKind = state.hand.result?.kind;
    if (resultKind === undefined) {
      throw new Error(`Simulation ${matchSeed} reached a terminal phase without a hand result`);
    }
    const eventPrefixDigest = `sha256:${canonicalJsonHash(events)}`;
    const seatProfiles = policies.profiles.map(
      ({ botId: profileBotId, seat, difficulty, personality }) => ({
        botId: profileBotId,
        seat,
        difficulty,
        personality,
      }),
    );
    hands.push({
      matchIndex,
      matchHandIndex: state.match.handIndex,
      matchSeed,
      handSeed: state.hand.seed,
      ruleset: rulesetIdentity(ruleset),
      seatProfiles,
      orderedActionTrace: handActionTrace,
      eventPrefixDigest,
      eventCount: events.length,
      commandCount: handAcceptedCommands,
      wallProfile: wallProfileFor(resolvedOptions.wallMode, matchIndex, state.match.handIndex),
      actionCounts: handActionCounts,
      decisionConfigurationCounts: handDecisionConfigurationCounts,
      termination: resultKind,
      terminalStateHash: state.stateHash,
      terminalStateDigest: `sha256:${canonicalJsonHash(state)}`,
      decisionLatencies: handDecisionLatencies,
    });
    handAcceptedCommands = 0;
    handActionTrace = [];
    handActionCounts = emptyActionCounts();
    handDecisionConfigurationCounts = emptyConfigurationCounts();
    handDecisionLatencies = [];
    if (state.phase === "match_ended") {
      break;
    }
  }

  if (maximumHands > MAXIMUM_HANDS_PER_MATCH && state.phase !== "match_ended") {
    throw new Error(
      `Simulation ${matchSeed} exceeded ${String(MAXIMUM_HANDS_PER_MATCH)} hands without completing its one-wind match`,
    );
  }

  return {
    schemaVersion: 1,
    matchIndex,
    matchSeed,
    ruleset: rulesetIdentity(ruleset),
    completedMatch: state.phase === "match_ended",
    hands,
    events,
  };
};

class SimulationAccumulator implements BotSimulationAccumulator {
  readonly #requestedHands: number;
  readonly #options: ResolvedBotSimulationOptions;
  readonly #bundledRulesets = RULESET_IDS.map(getBundledRuleset);
  readonly #replaySampleIndices: readonly number[];
  readonly #replayIndexSet: ReadonlySet<number>;
  readonly #actionCounts = emptyActionCounts();
  readonly #terminationReasons: Record<TerminationReason, number> = {
    win: 0,
    exhaustive_draw: 0,
    sandbox_end: 0,
  };
  readonly #rulesetHandCounts = emptyRulesetCounts();
  readonly #wallProfileCounts = emptyWallProfileCounts();
  readonly #configurationCounts = emptyConfigurationCounts();
  readonly #decisionConfigurationCounts = emptyConfigurationCounts();
  readonly #commandCounts: number[] = [];
  readonly #decisionLatencies: number[] = [];
  readonly #handDigests: string[] = [];
  readonly #replaySamples: SimulationReplaySample[] = [];
  #completedHands = 0;
  #matchesStarted = 0;
  #completedMatches = 0;
  #nextMatchIndex: number;

  constructor(requestedHands: number, options: BotSimulationOptions) {
    assertRequestedHands(requestedHands);
    this.#requestedHands = requestedHands;
    this.#options = resolveSimulationOptions(options);
    this.#nextMatchIndex = this.#options.matchIndexOffset;
    this.#replaySampleIndices = replayIndicesFor(requestedHands);
    this.#replayIndexSet = new Set(this.#replaySampleIndices);
  }

  get complete(): boolean {
    return this.#completedHands === this.#requestedHands;
  }

  get nextMatchIndex(): number {
    return this.#nextMatchIndex;
  }

  acceptMatch(match: BotSimulationMatchLedger): void {
    if (this.complete) {
      throw new Error("A complete simulation cannot accept another match");
    }
    const expectedRuleset = this.#bundledRulesets[this.#nextMatchIndex % RULESET_IDS.length]!;
    const expectedRulesetIdentity = rulesetIdentity(expectedRuleset);
    const expectedMatchSeed = matchSeedFor(
      this.#nextMatchIndex,
      expectedRuleset,
      this.#options.seedNamespace,
    );
    if (
      match.matchIndex !== this.#nextMatchIndex ||
      match.matchSeed !== expectedMatchSeed ||
      canonicalJsonHash(match.ruleset) !== canonicalJsonHash(expectedRulesetIdentity) ||
      match.hands.length === 0
    ) {
      throw new Error(`Simulation match ${String(match.matchIndex)} has invalid identity`);
    }
    this.#matchesStarted += 1;
    this.#nextMatchIndex += 1;
    let consumedHands = 0;
    let previousEventCount = 0;
    const handLimit = Math.min(match.hands.length, this.#requestedHands - this.#completedHands);

    for (let handIndex = 0; handIndex < handLimit; handIndex += 1) {
      const hand = match.hands[handIndex]!;
      if (
        hand.matchIndex !== match.matchIndex ||
        hand.matchSeed !== match.matchSeed ||
        canonicalJsonHash(hand.ruleset) !== canonicalJsonHash(match.ruleset) ||
        !Number.isSafeInteger(hand.eventCount) ||
        hand.eventCount <= previousEventCount ||
        hand.eventCount > match.events.length ||
        !Number.isSafeInteger(hand.commandCount) ||
        hand.commandCount < 1 ||
        hand.commandCount > MAXIMUM_ACCEPTED_COMMANDS_PER_HAND ||
        !["natural_shuffle", "terminal_regression"].includes(hand.wallProfile) ||
        !["win", "exhaustive_draw", "sandbox_end"].includes(hand.termination) ||
        !/^sha256:[0-9a-f]{64}$/u.test(hand.terminalStateHash) ||
        !/^sha256:[0-9a-f]{64}$/u.test(hand.terminalStateDigest) ||
        hand.decisionLatencies.some((latency) => !Number.isFinite(latency) || latency < 0)
      ) {
        throw new Error(
          `Simulation match ${String(match.matchIndex)} contains an invalid hand ledger`,
        );
      }
      previousEventCount = hand.eventCount;
      const globalHandIndex = this.#completedHands;
      const handDigestPayload = {
        globalHandIndex,
        matchIndex: hand.matchIndex,
        matchHandIndex: hand.matchHandIndex,
        matchSeed: hand.matchSeed,
        handSeed: hand.handSeed,
        ruleset: hand.ruleset,
        seatProfiles: hand.seatProfiles,
        orderedActionTrace: hand.orderedActionTrace,
        eventPrefixDigest: hand.eventPrefixDigest,
        commandCount: hand.commandCount,
        wallProfile: hand.wallProfile,
        termination: hand.termination,
        terminalStateHash: hand.terminalStateHash,
      };
      this.#handDigests.push(`sha256:${canonicalJsonHash(handDigestPayload)}`);
      this.#commandCounts.push(hand.commandCount);
      this.#decisionLatencies.push(...hand.decisionLatencies);
      this.#terminationReasons[hand.termination] += 1;
      this.#rulesetHandCounts[hand.ruleset.id] =
        (this.#rulesetHandCounts[hand.ruleset.id] ?? 0) + 1;
      this.#wallProfileCounts[hand.wallProfile] += 1;
      for (const actionType of ACTION_TYPES) {
        const count = hand.actionCounts[actionType];
        if (!Number.isSafeInteger(count) || count < 0) {
          throw new Error(`Simulation hand has invalid ${actionType} action count`);
        }
        this.#actionCounts[actionType] += count;
      }
      for (const { difficulty, personality } of hand.seatProfiles) {
        const configuration = `${difficulty}:${personality}`;
        if (!(configuration in this.#configurationCounts)) {
          throw new Error(`Simulation hand has unknown bot configuration ${configuration}`);
        }
        this.#configurationCounts[configuration] =
          (this.#configurationCounts[configuration] ?? 0) + 1;
      }
      for (const configuration of Object.keys(this.#decisionConfigurationCounts)) {
        const count = hand.decisionConfigurationCounts[configuration];
        if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) {
          throw new Error(`Simulation hand has invalid ${configuration} decision count`);
        }
        this.#decisionConfigurationCounts[configuration] =
          (this.#decisionConfigurationCounts[configuration] ?? 0) + count;
      }

      if (this.#replayIndexSet.has(globalHandIndex)) {
        const eventPrefix = match.events.slice(0, hand.eventCount);
        if (eventPrefix.length !== hand.eventCount) {
          throw new Error("Simulation event prefix is incomplete");
        }
        const serializedEvents = JSON.stringify(eventPrefix);
        const parsedEvents: unknown = JSON.parse(serializedEvents);
        if (!Array.isArray(parsedEvents)) {
          throw new Error("Serialized simulation events did not decode to an array");
        }
        if (`sha256:${canonicalJsonHash(parsedEvents)}` !== hand.eventPrefixDigest) {
          throw new Error(
            `Simulation ${match.matchSeed} event prefix digest changed during serialization`,
          );
        }
        const replayed = replayEvents(parsedEvents as readonly GameEvent[]);
        assertStateInvariants(replayed);
        if (
          replayed.stateHash !== hand.terminalStateHash ||
          `sha256:${canonicalJsonHash(replayed)}` !== hand.terminalStateDigest
        ) {
          throw new Error(
            `Simulation ${match.matchSeed} replay did not reproduce hand ${String(globalHandIndex)}`,
          );
        }
        this.#replaySamples.push({
          globalHandIndex,
          terminalStateHash: hand.terminalStateHash,
          eventPrefixDigest: hand.eventPrefixDigest,
        });
      }

      this.#completedHands += 1;
      consumedHands += 1;
    }

    if (consumedHands === match.hands.length && match.completedMatch) {
      this.#completedMatches += 1;
    }
  }

  finish(): BotSimulationSummary {
    if (!this.complete || this.#replaySamples.length !== this.#replaySampleIndices.length) {
      throw new Error("Cannot summarize an incomplete bot simulation");
    }
    const maximumAcceptedCommands = maximum(this.#commandCounts);
    const meanAcceptedCommands =
      this.#commandCounts.reduce((total, count) => total + count, 0) / this.#commandCounts.length;
    const handDigestRoot = `sha256:${canonicalJsonHash(this.#handDigests)}`;
    const deterministicReport = {
      versions: {
        rng: RNG_VERSION,
        analysis: ANALYSIS_VERSION,
        botPolicy: BOT_POLICY_VERSION,
      },
      rulesets: this.#bundledRulesets.map(rulesetIdentity),
      wallMode: this.#options.wallMode,
      seedNamespace: this.#options.seedNamespace,
      matchIndexOffset: this.#options.matchIndexOffset,
      requestedHands: this.#requestedHands,
      completedHands: this.#completedHands,
      matchesStarted: this.#matchesStarted,
      completedMatches: this.#completedMatches,
      replaySamples: this.#replaySamples,
      replaySampleIndices: this.#replaySampleIndices,
      handDigestCount: this.#handDigests.length,
      handDigestRoot,
      maximumAcceptedCommands,
      meanAcceptedCommands: Math.round(meanAcceptedCommands * 1_000) / 1_000,
      actionCounts: this.#actionCounts,
      terminationReasons: this.#terminationReasons,
      rulesetHandCounts: this.#rulesetHandCounts,
      wallProfileCounts: this.#wallProfileCounts,
      configurationCounts: this.#configurationCounts,
      decisionConfigurationCounts: this.#decisionConfigurationCounts,
      regressionSeeds: [] as const,
    };
    return {
      schemaVersion: 1,
      ...deterministicReport,
      failures: {
        illegalActions: 0,
        invariantViolations: 0,
        crashes: 0,
        commandBoundExceeded: 0,
        replayMismatches: 0,
      },
      latency: latencySummary(this.#decisionLatencies),
      runDigest: `sha256:${canonicalJsonHash(deterministicReport)}`,
    };
  }
}

export const createBotSimulationAccumulator = (
  requestedHands: number,
  options: BotSimulationOptions = {},
): BotSimulationAccumulator => new SimulationAccumulator(requestedHands, options);

export const runBotSimulation = (
  requestedHands: number,
  options: BotSimulationOptions = {},
): BotSimulationSummary => {
  const accumulator = createBotSimulationAccumulator(requestedHands, options);
  while (!accumulator.complete) {
    accumulator.acceptMatch(
      runBotMatchSimulation(accumulator.nextMatchIndex, requestedHands, options),
    );
  }
  return accumulator.finish();
};
