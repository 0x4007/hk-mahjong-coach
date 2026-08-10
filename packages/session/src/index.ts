import {
  createBotPolicy,
  type BotDifficulty,
  type BotPersonality,
  type BotPolicy,
} from "@hk-mahjong/bots";
import {
  canonicalJsonHash,
  createGameEngine,
  projectPublicEventStream,
  reduceGameEvent,
  type CreatePlayer,
  type GameEngine,
  type GameEvent,
  type GameMode,
  type GameState,
  type PlayerObservation,
  type PublicGameEvent,
  type Wind,
} from "@hk-mahjong/core";
import {
  createHongKongScoringSystem,
  getBundledRuleset,
  resolveRuleset,
  toCoreGameRules,
  type BundledRulesetId,
  type ResolvedRuleset,
} from "@hk-mahjong/hk-rules";
import { createAnalyzer, type AnalysisFact, type LegalActionAnalysis } from "@hk-mahjong/analysis";
import {
  CoachNarrationService,
  coachingAnalysisFromLegalActions,
  createBundledDrillLibrary,
  createPostHandReview,
  curriculumStageFor,
  decisionQualityFromAnalysis,
  updateConceptMastery,
  MASTERY_ALGORITHM_VERSION,
  type CoachingDecisionRecord,
  type CoachNarrator,
  type ConceptId,
  type ConceptMastery,
  type DrillItem,
  type HintLevel,
} from "@hk-mahjong/coach";
import {
  type AcceptedDecisionEvidenceInput,
  SqlitePersistenceRepository,
  type GameSessionConfigurationV1,
  type ImportResult,
  type JsonObject,
  type JsonValue,
  type PersistenceExport,
  type PersistenceRepositoryOptions,
} from "@hk-mahjong/persistence";
import {
  playerObservationSchema,
  publicGameEventSchema,
  type PlayerObservationDto,
  type ProtocolError,
  type PublicGameEventDto,
} from "@hk-mahjong/protocol";

export interface SessionOpponent {
  readonly playerId: string;
  readonly displayName: string;
  readonly difficulty: BotDifficulty;
  readonly personality: BotPersonality;
}

export interface SessionCreateInput {
  readonly mode: GameMode;
  readonly rulesetId: BundledRulesetId;
  readonly matchLength: "one_wind" | "full_four_winds";
  readonly seed: string;
  readonly learnerId: string;
  readonly humanPlayerId: string;
  readonly humanDisplayName: string;
  readonly preferredSeat?: Wind;
  readonly opponents: readonly SessionOpponent[];
  readonly coach?: GameSessionConfigurationV1["coach"];
  readonly requestId?: string;
}

export interface SessionGameKey {
  readonly gameId: string;
  readonly branchId: string;
}

export interface SessionCreateResult {
  readonly game: SessionGameKey;
  readonly observation: PlayerObservationDto;
  readonly publicEvents: readonly PublicGameEventDto[];
}

export interface SessionActionInput {
  readonly gameId: string;
  readonly branchId: string;
  readonly playerId: string;
  readonly expectedRevision: number;
  readonly requestId: string;
  readonly actionId: string;
}

export interface SessionHintInput {
  readonly gameId: string;
  readonly branchId: string;
  readonly playerId: string;
  readonly expectedRevision: number;
  readonly requestId: string;
  readonly level: Exclude<HintLevel, "none">;
}

export interface SessionHintResult {
  readonly status: "template" | "provider" | "fallback" | "unavailable";
  readonly level: Exclude<HintLevel, "none">;
  readonly headline: string;
  readonly explanation: string;
  readonly recommendedActionId: string | null;
  readonly factIds: readonly string[];
  readonly conceptIds: readonly ConceptId[];
}

export interface SessionBranchInput {
  readonly gameId: string;
  readonly parentBranchId: string;
  readonly branchId: string;
  readonly playerId: string;
  readonly expectedRevision: number;
  readonly requestId: string;
  readonly decisionId: string;
}

export interface SessionBranchResult {
  readonly game: SessionGameKey;
  readonly parent: SessionGameKey;
  readonly forkRevision: number;
  readonly forkStateHash: string;
  readonly observation: PlayerObservationDto;
}

export interface SessionDrillAnswerInput {
  readonly sessionId: string;
  readonly requestId: string;
  readonly answer: unknown;
  readonly hintLevel: HintLevel;
}

export interface SessionDrillAnswerResult {
  readonly sessionId: string;
  readonly drillItemId: string;
  readonly correct: boolean;
  readonly nextReviewAt: string;
}

export type SessionActionResult =
  | {
      readonly accepted: true;
      readonly observation: PlayerObservationDto;
      readonly publicEvents: readonly PublicGameEventDto[];
    }
  | {
      readonly accepted: false;
      readonly observation: PlayerObservationDto;
      readonly publicEvents: readonly PublicGameEventDto[];
      readonly error: ProtocolError;
    };

interface SessionGame {
  readonly key: SessionGameKey;
  readonly engine: GameEngine;
  readonly ruleset: ResolvedRuleset;
  readonly learnerId: string;
  readonly humanPlayerId: string;
  readonly botPolicies: ReadonlyMap<string, BotPolicy>;
  state: GameState;
}

interface DrillSession {
  readonly learnerId: string;
  readonly items: readonly DrillItem[];
}

const LANGUAGE_OVERLAYS = ["zhHant", "zhHans", "jyutping", "pinyin"] as const;

const profileFromPreferences = (
  learnerId: string,
  preferences: Readonly<Record<string, unknown>>,
  narratorStatus: "templates" | "provider_available" | "provider_unavailable" = "templates",
) => {
  const overlays = Array.isArray(preferences.languageOverlays)
    ? preferences.languageOverlays.filter(
        (value): value is (typeof LANGUAGE_OVERLAYS)[number] =>
          typeof value === "string" &&
          LANGUAGE_OVERLAYS.includes(value as (typeof LANGUAGE_OVERLAYS)[number]),
      )
    : [];
  return {
    learnerId,
    displayName:
      typeof preferences.displayName === "string" && preferences.displayName.trim().length > 0
        ? preferences.displayName
        : "Learner",
    languageOverlays: [...new Set(overlays)],
    highContrast: preferences.highContrast === true,
    reducedMotion: preferences.reducedMotion === true,
    narratorStatus,
  };
};

const DEFAULT_OPPONENTS: readonly SessionOpponent[] = [
  { playerId: "player-1", displayName: "Ming", difficulty: "basic", personality: "fast" },
  { playerId: "player-2", displayName: "Jade", difficulty: "basic", personality: "value" },
  { playerId: "player-3", displayName: "Alex", difficulty: "basic", personality: "balanced" },
];

const protocolObservation = (observation: PlayerObservation): PlayerObservationDto =>
  playerObservationSchema.parse(observation);

const protocolPublicEvents = (events: readonly PublicGameEvent[]): readonly PublicGameEventDto[] =>
  events.map((event) => publicGameEventSchema.parse(event));

const isJsonValue = (value: unknown): value is JsonValue => {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every((item) => isJsonValue(item));
  if (typeof value !== "object") return false;
  return Object.values(value).every((item) => isJsonValue(item));
};

const jsonObject = (value: Readonly<Record<string, unknown>>): JsonObject => {
  const result: Record<string, JsonValue> = {};
  for (const [key, child] of Object.entries(value)) {
    if (isJsonValue(child)) result[key] = child;
  }
  return result;
};

const stringArray = (value: JsonValue | undefined): readonly string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

const isHintLevel = (value: JsonValue | undefined): value is HintLevel =>
  typeof value === "string" && ["none", "nudge", "compare", "reveal"].includes(value);

const conceptsFromFacts = (facts: readonly AnalysisFact[]): readonly ConceptId[] => {
  const concepts = new Set<ConceptId>();
  for (const fact of facts) {
    const concept: ConceptId =
      fact.kind === "distance"
        ? "tile_efficiency"
        : fact.kind === "improving_tiles"
          ? "waits_improving_tiles"
          : fact.kind === "visible_copies"
            ? "visible_tile_counting"
            : fact.kind === "faan_path"
              ? "minimum_faan_planning"
              : fact.kind === "relative_risk"
                ? "relative_safety"
                : fact.kind === "legal_rule"
                  ? "turn_order_claim_priority"
                  : fact.kind === "score_gap"
                    ? "tile_efficiency"
                    : "tile_efficiency";
    concepts.add(concept);
  }
  return [...concepts].sort();
};

const decisionFromRecord = (
  record: PersistenceExport["data"]["decisions"][number],
): CoachingDecisionRecord | null => {
  const conceptIds = stringArray(record.data.conceptIds) as ConceptId[];
  if (conceptIds.length === 0) return null;
  const recommendedActionId = record.data.recommendedActionId;
  const selectedActionId = record.data.selectedActionId;
  const quality = record.data.quality;
  const hintLevel = record.data.hintLevel;
  if (
    typeof selectedActionId !== "string" ||
    (recommendedActionId !== null && typeof recommendedActionId !== "string") ||
    typeof quality !== "number" ||
    !isHintLevel(hintLevel)
  ) {
    return null;
  }
  return {
    decisionId: record.id,
    learnerId: record.learnerId ?? "local-learner",
    conceptIds,
    selectedActionId,
    recommendedActionId,
    quality,
    independent: record.independent,
    hintLevel,
    createdAt: record.createdAt,
  };
};

const repositoryOptions = (
  databasePath: string,
  clock: () => string,
): PersistenceRepositoryOptions => ({
  databasePath,
  reducer: reduceGameEvent,
  legalActions: (state, playerId, definition) => {
    const ruleset = resolveRuleset(definition);
    return createGameEngine({ scoringSystem: createHongKongScoringSystem(ruleset) }).legalActions(
      state,
      playerId,
    );
  },
  validateRulesetDefinition: (definition) => {
    const ruleset = resolveRuleset(definition);
    return {
      definition: ruleset.definition,
      hash: ruleset.hash,
      coreRules: toCoreGameRules(ruleset),
    };
  },
  clock,
});

const errorFor = (
  code: ProtocolError["code"],
  message: string,
  details: Readonly<Record<string, unknown>> = {},
): ProtocolError => ({ code, message, details });

const engineFor = (ruleset: ResolvedRuleset): GameEngine =>
  createGameEngine({ scoringSystem: createHongKongScoringSystem(ruleset) });

const sessionConfigurationFor = (
  opponents: readonly SessionOpponent[],
  coach: GameSessionConfigurationV1["coach"] | undefined,
): GameSessionConfigurationV1 => {
  return {
    schemaVersion: 1,
    bots: opponents.map(({ playerId, difficulty, personality }) => ({
      playerId,
      difficulty,
      personality,
    })),
    coach: coach ?? { enabled: false, provider: "templates", verbosity: "brief" },
  };
};

const policiesFor = (
  opponents: readonly SessionOpponent[],
  ruleset: ResolvedRuleset,
): ReadonlyMap<string, BotPolicy> =>
  new Map(
    opponents.map(({ playerId, difficulty, personality }) => [
      playerId,
      createBotPolicy({ botId: playerId, difficulty, personality, ruleset }),
    ]),
  );

const policiesFromConfiguration = (
  configuration: GameSessionConfigurationV1,
  state: GameState,
  ruleset: ResolvedRuleset,
): ReadonlyMap<string, BotPolicy> =>
  policiesFor(
    configuration.bots.map(({ playerId, difficulty, personality }) => {
      const player = state.players[playerId];
      if (player?.controller !== "bot") {
        throw new Error(`Session configuration references non-bot player ${playerId}`);
      }
      return { playerId, displayName: player.displayName, difficulty, personality };
    }),
    ruleset,
  );

const humanPlayerIdFor = (state: GameState): string => {
  const human = Object.values(state.players).find((player) => player.controller === "human");
  if (human === undefined) {
    throw new Error("Persisted session has no human player");
  }
  return human.id;
};

const uniquePlayerIds = (humanPlayerId: string, opponents: readonly SessionOpponent[]): void => {
  const ids = [humanPlayerId, ...opponents.map(({ playerId }) => playerId)];
  if (ids.some((id) => id.trim().length === 0) || new Set(ids).size !== 4) {
    throw new TypeError("Session requires four distinct non-empty player IDs");
  }
};

/**
 * The composition boundary shared by the CLI and local server. It is the only layer allowed to
 * hold authoritative GameState; callers receive a protocol-validated observation instead.
 */
export class SessionController {
  readonly #databasePath: string;
  readonly #clock: () => string;
  readonly #games = new Map<string, SessionGame>();
  readonly #repositories = new Map<string, SqlitePersistenceRepository>();
  readonly #drillSessions = new Map<string, DrillSession>();
  readonly #narratorService: CoachNarrationService;
  readonly #narratorStatus: "templates" | "provider_available" | "provider_unavailable";

  public constructor(
    options: { databasePath?: string; clock?: () => string; narrator?: CoachNarrator | null } = {},
  ) {
    this.#databasePath = options.databasePath ?? ":memory:";
    this.#clock = options.clock ?? (() => new Date().toISOString());
    this.#narratorService = new CoachNarrationService({ provider: options.narrator ?? null });
    this.#narratorStatus =
      options.narrator === undefined || options.narrator === null
        ? "templates"
        : "provider_available";
  }

  public close(): void {
    for (const repository of this.#repositories.values()) {
      repository.close();
    }
    this.#repositories.clear();
    this.#games.clear();
    this.#drillSessions.clear();
  }

  public create(input: SessionCreateInput): SessionCreateResult {
    uniquePlayerIds(input.humanPlayerId, input.opponents);
    if (input.opponents.length !== 3) {
      throw new TypeError("Session requires exactly three opponents");
    }
    const ruleset = getBundledRuleset(input.rulesetId);
    const engine = engineFor(ruleset);
    const requestId = input.requestId ?? `create:${input.seed}`;
    const sessionConfiguration = sessionConfigurationFor(input.opponents, input.coach);
    const human: CreatePlayer = {
      id: input.humanPlayerId,
      displayName: input.humanDisplayName,
      controller: "human",
      ...(input.preferredSeat === undefined ? {} : { seat: input.preferredSeat }),
    };
    const [firstOpponent, secondOpponent, thirdOpponent] = input.opponents;
    if (
      firstOpponent === undefined ||
      secondOpponent === undefined ||
      thirdOpponent === undefined
    ) {
      throw new TypeError("Session requires exactly three opponents");
    }
    const players: readonly [CreatePlayer, CreatePlayer, CreatePlayer, CreatePlayer] = [
      human,
      { id: firstOpponent.playerId, displayName: firstOpponent.displayName, controller: "bot" },
      { id: secondOpponent.playerId, displayName: secondOpponent.displayName, controller: "bot" },
      { id: thirdOpponent.playerId, displayName: thirdOpponent.displayName, controller: "bot" },
    ];
    const result = engine.create({
      type: "create_game",
      requestId,
      branchId: "main",
      seed: input.seed,
      mode: input.mode,
      matchLength: input.matchLength,
      rules: toCoreGameRules(ruleset),
      players,
    });
    if (!result.accepted) {
      throw new Error(result.error.message);
    }
    const repository = this.repositoryFor();
    repository.appendAcceptedCommand({
      key: { gameId: result.state.gameId, branchId: result.state.branchId },
      requestId,
      events: result.events,
      state: result.state,
      learnerId: input.learnerId,
      rulesetDefinition: ruleset.definition,
      sessionConfiguration,
    });
    const game: SessionGame = {
      key: { gameId: result.state.gameId, branchId: result.state.branchId },
      engine,
      ruleset,
      learnerId: input.learnerId,
      humanPlayerId: input.humanPlayerId,
      botPolicies: policiesFor(input.opponents, ruleset),
      state: result.state,
    };
    this.#games.set(this.gameMapKey(game.key), game);
    const publicEvents = [...result.publicEvents, ...this.driveBots(game)];
    return {
      game: game.key,
      observation: protocolObservation(game.engine.observation(game.state, game.humanPlayerId)),
      publicEvents: protocolPublicEvents(publicEvents),
    };
  }

  public resume(learnerId: string): SessionCreateResult | null {
    const repository = this.repositoryFor();
    const loaded = repository.loadLatestResumableGame(learnerId);
    if (loaded === null) {
      return null;
    }
    const ruleset = resolveRuleset(loaded.game.rulesetDefinition);
    const engine = engineFor(ruleset);
    const configuration = loaded.game.sessionConfiguration;
    const game: SessionGame = {
      key: loaded.key,
      engine,
      ruleset,
      learnerId,
      humanPlayerId: humanPlayerIdFor(loaded.state),
      botPolicies: policiesFromConfiguration(configuration, loaded.state, ruleset),
      state: loaded.state,
    };
    this.#games.set(this.gameMapKey(game.key), game);
    const publicEvents = this.driveBots(game);
    return {
      game: game.key,
      observation: protocolObservation(game.engine.observation(game.state, game.humanPlayerId)),
      publicEvents: protocolPublicEvents(publicEvents),
    };
  }

  /** Hydrates one persisted branch for replay or a local client reconnect. */
  public load(gameId: string, branchId = "main", playerId?: string): SessionCreateResult {
    const repository = this.repositoryFor();
    const loaded = repository.loadGame({ gameId, branchId });
    const ruleset = resolveRuleset(loaded.game.rulesetDefinition);
    const engine = engineFor(ruleset);
    const humanPlayerId = playerId ?? humanPlayerIdFor(loaded.state);
    const configuration = loaded.game.sessionConfiguration;
    const opponents =
      configuration?.bots.map(({ playerId: botId, difficulty, personality }) => ({
        playerId: botId,
        displayName: loaded.state.players[botId]?.displayName ?? botId,
        difficulty,
        personality,
      })) ??
      Object.values(loaded.state.players)
        .filter((player) => player.controller === "bot")
        .map((player) => ({
          playerId: player.id,
          displayName: player.displayName,
          difficulty: "basic" as const,
          personality: "balanced" as const,
        }));
    const game: SessionGame = {
      key: loaded.key,
      engine,
      ruleset,
      learnerId: loaded.game.learnerId ?? "local-learner",
      humanPlayerId,
      botPolicies: policiesFor(opponents, ruleset),
      state: loaded.state,
    };
    this.#games.set(this.gameMapKey(game.key), game);
    return {
      game: game.key,
      observation: protocolObservation(engine.observation(loaded.state, humanPlayerId)),
      publicEvents: [],
    };
  }

  public observation(gameId: string, playerId: string, branchId = "main"): PlayerObservationDto {
    const game = this.requireGame(gameId, branchId);
    return protocolObservation(game.engine.observation(game.state, playerId));
  }

  public profile(learnerId: string) {
    const repository = this.repositoryFor();
    repository.ensureLearner(learnerId);
    return profileFromPreferences(
      learnerId,
      repository.getLearnerPreferences(learnerId)?.preferences ?? {},
      this.#narratorStatus,
    );
  }

  public patchProfile(
    learnerId: string,
    patch: Readonly<{
      displayName?: string | undefined;
      languageOverlays?: readonly (typeof LANGUAGE_OVERLAYS)[number][] | undefined;
      highContrast?: boolean | undefined;
      reducedMotion?: boolean | undefined;
    }>,
  ) {
    const repository = this.repositoryFor();
    const current = repository.getLearnerPreferences(learnerId)?.preferences ?? {};
    const next: Record<string, JsonValue> = { ...current };
    if (patch.displayName !== undefined) next.displayName = patch.displayName;
    if (patch.languageOverlays !== undefined) next.languageOverlays = [...patch.languageOverlays];
    if (patch.highContrast !== undefined) next.highContrast = patch.highContrast;
    if (patch.reducedMotion !== undefined) next.reducedMotion = patch.reducedMotion;
    repository.saveLearnerPreferences({ learnerId, preferences: next });
    return profileFromPreferences(learnerId, next);
  }

  public mastery(learnerId: string): readonly ConceptMastery[] {
    return this.repositoryFor()
      .listConceptMastery(learnerId)
      .map((record) => ({
        learnerId: record.learnerId,
        conceptId: record.conceptId as ConceptMastery["conceptId"],
        mastery: record.mastery,
        confidence: record.confidence,
        attempts: record.attempts,
        independentAttempts: record.independentAttempts,
        successfulAttempts: record.successfulAttempts,
        hintWeightedScore: record.hintWeightedScore,
        algorithmVersion: MASTERY_ALGORITHM_VERSION,
        lastSeenAt: record.lastSeenAt,
        nextReviewAt: record.nextReviewAt,
        updatedAt: record.updatedAt,
      }));
  }

  public curriculum(learnerId: string) {
    const mastery = this.mastery(learnerId);
    return { current: curriculumStageFor(mastery), mastery };
  }

  public exportData(options: { includeLlmMetadata?: boolean } = {}): PersistenceExport {
    return this.repositoryFor().exportData(options);
  }

  public importData(document: unknown, mode: "merge" | "replace" = "merge"): ImportResult {
    return this.repositoryFor().importData(document, { mode });
  }

  public resetLearner(learnerId: string): void {
    this.repositoryFor().resetLearnerProgress(learnerId);
    this.#drillSessions.forEach((session, sessionId) => {
      if (session.learnerId === learnerId) this.#drillSessions.delete(sessionId);
    });
  }

  public replay(gameId: string, playerId: string, branchId = "main") {
    const game = this.requireGame(gameId, branchId);
    const repository = this.repositoryFor();
    const loaded = repository.loadGame({ gameId, branchId });
    const events = projectPublicEventStream(
      repository.listHistory({ gameId, branchId }).map(({ event }) => event),
    );
    return {
      game: { gameId, branchId },
      viewerPlayerId: playerId,
      events: events.map((event) => publicGameEventSchema.parse(event)),
      terminalObservation: protocolObservation(game.engine.observation(loaded.state, playerId)),
      omniscientAvailable:
        loaded.state.mode === "sandbox" ||
        loaded.state.phase === "hand_ended" ||
        loaded.state.phase === "match_ended",
    };
  }

  public review(handId: string): JsonObject | null {
    const review = this.repositoryFor()
      .exportData({ includeLlmMetadata: false })
      .data.reviews.find(({ handId: candidate }) => candidate === handId);
    return review?.data ?? null;
  }

  public branch(input: SessionBranchInput): SessionBranchResult {
    const parent = this.requireGame(input.gameId, input.parentBranchId);
    const result = parent.engine.decide(parent.state, {
      type: "create_practice_branch",
      gameId: input.gameId,
      branchId: input.branchId,
      parentBranchId: input.parentBranchId,
      playerId: input.playerId,
      expectedRevision: input.expectedRevision,
      requestId: input.requestId,
      originDecisionId: input.decisionId,
    });
    if (!result.accepted) {
      throw new Error(result.error.message);
    }
    const marker = result.events[0];
    if (marker?.type !== "practice_branch_created") {
      throw new Error("Practice branch creation did not produce its provenance marker");
    }
    const repository = this.repositoryFor();
    const fork = repository.forkPracticeBranch({
      parent: parent.key,
      event: marker,
      state: result.state,
    });
    const child: SessionGame = {
      key: fork.branch.key,
      engine: parent.engine,
      ruleset: parent.ruleset,
      learnerId: parent.learnerId,
      humanPlayerId: parent.humanPlayerId,
      botPolicies: parent.botPolicies,
      state: result.state,
    };
    this.#games.set(this.gameMapKey(child.key), child);
    return {
      game: child.key,
      parent: parent.key,
      forkRevision: fork.branch.forkRevision,
      forkStateHash:
        fork.branch.forkStateHash ??
        (() => {
          throw new Error("Practice branch is missing its fork state hash");
        })(),
      observation: protocolObservation(child.engine.observation(child.state, input.playerId)),
    };
  }

  public async hint(input: SessionHintInput): Promise<SessionHintResult> {
    const game = this.requireGame(input.gameId, input.branchId);
    if (input.playerId !== game.humanPlayerId) {
      throw new Error("Only the configured human player may request a hint");
    }
    if (input.expectedRevision !== game.state.revision) {
      throw new Error("The game has changed; refresh before requesting a hint");
    }
    const observation = game.engine.observation(game.state, input.playerId);
    const analyzed: readonly LegalActionAnalysis[] = createAnalyzer(
      game.ruleset,
    ).analyzeLegalActions(observation, "balanced");
    const feedback = await this.#narratorService.explain({
      observation,
      analysis: {
        analysisVersion: "legal-action-analysis-v1",
        weightingVersion: analyzed[0]?.weightingVersion ?? "legal-action-weights-v1",
        recommendedActionId: analyzed[0]?.actionId ?? null,
        candidates: analyzed.map((action) => ({
          actionId: action.actionId,
          rank: action.rank,
          totalScore: action.totalScore,
          confidence: 0.5,
          distanceAfterAction: action.distanceAfterAction,
          visibleImprovingCopies: action.visibleImprovingCopies,
          likelyFaanPathIds: action.likelyFaanPaths.map(({ id }) => id),
          facts: action.facts,
        })),
        facts: analyzed.flatMap(({ facts }) => facts),
        rollout: null,
      },
      learner: {
        learnerId: game.learnerId,
        mode: game.state.mode,
        currentObjective: "Make one grounded decision from the visible table.",
        mastery: [],
        patterns: [],
        verbosity: "brief",
      },
      hintLevel: input.level,
    });
    const level = input.level === "nudge" ? 1 : input.level === "compare" ? 2 : 3;
    this.repositoryFor().recordHint({
      id: input.requestId,
      learnerId: game.learnerId,
      level,
      data: {
        gameId: input.gameId,
        branchId: input.branchId,
        revision: input.expectedRevision,
        status: feedback.status,
        factIds: [...feedback.narration.factIds],
      },
    });
    return {
      status: feedback.status,
      level: input.level,
      headline: feedback.narration.headline,
      explanation: feedback.narration.explanation,
      recommendedActionId: feedback.narration.recommendedActionId ?? null,
      factIds: feedback.narration.factIds,
      conceptIds: feedback.narration.conceptIds,
    };
  }

  public createDrillSession(learnerId: string, conceptIds: readonly ConceptId[] = []) {
    const items = createBundledDrillLibrary()
      .filter(
        (item) =>
          conceptIds.length === 0 ||
          item.conceptIds.some((concept) => conceptIds.includes(concept)),
      )
      .slice(0, 5);
    if (items.length === 0) throw new Error("No bundled drills match the requested concepts");
    const sessionId = `drill-session:${canonicalJsonHash({ learnerId, conceptIds, itemIds: items.map(({ id }) => id) }).slice(7, 39)}`;
    this.repositoryFor().ensureLearner(learnerId);
    this.#drillSessions.set(sessionId, { learnerId, items });
    return {
      sessionId,
      items: items.map(
        ({ id, source, type, conceptIds: itemConcepts, difficulty, prompt, choices, tile }) => ({
          id,
          source,
          type,
          conceptIds: itemConcepts,
          difficulty,
          prompt,
          choices,
          ...(tile === undefined ? {} : { tile }),
        }),
      ),
    };
  }

  public answerDrill(input: SessionDrillAnswerInput): SessionDrillAnswerResult {
    const session = this.#drillSessions.get(input.sessionId);
    if (session === undefined) throw new Error("Unknown drill session");
    const item = session.items[0];
    if (item === undefined) throw new Error("Drill session has no item");
    const correct = typeof input.answer === "string" && input.answer === item.answer;
    const hintLevel =
      input.hintLevel === "none"
        ? 0
        : input.hintLevel === "nudge"
          ? 1
          : input.hintLevel === "compare"
            ? 2
            : 3;
    const repository = this.repositoryFor();
    repository.saveDrillItem({
      id: item.id,
      learnerId: session.learnerId,
      source: item.source,
      conceptIds: item.conceptIds,
      difficulty: item.difficulty,
      data: {
        type: item.type,
        prompt: item.prompt,
        choices: [...item.choices],
        answer: item.answer,
      },
    });
    repository.recordDrillAttempt({
      id: `attempt:${input.sessionId}:${input.requestId}`,
      drillItemId: item.id,
      learnerId: session.learnerId,
      correct,
      hintLevel,
      data: { answer: typeof input.answer === "string" ? input.answer : null },
    });
    const occurredAt = this.#clock();
    let nextReviewAt = occurredAt;
    for (const conceptId of item.conceptIds) {
      const previous =
        this.mastery(session.learnerId).find(({ conceptId: id }) => id === conceptId) ?? null;
      const update = updateConceptMastery(previous, {
        learnerId: session.learnerId,
        conceptId,
        quality: correct ? 1 : 0,
        independent: input.hintLevel === "none",
        hintLevel: input.hintLevel,
        occurredAt,
      });
      const mastery = update.mastery;
      repository.upsertConceptMastery({
        learnerId: mastery.learnerId,
        conceptId: mastery.conceptId,
        mastery: mastery.mastery,
        confidence: mastery.confidence,
        attempts: mastery.attempts,
        independentAttempts: mastery.independentAttempts,
        successfulAttempts: mastery.successfulAttempts,
        hintWeightedScore: mastery.hintWeightedScore,
        algorithmVersion: mastery.algorithmVersion,
        ...(mastery.lastSeenAt === null ? {} : { lastSeenAt: mastery.lastSeenAt }),
        ...(mastery.nextReviewAt === null ? {} : { nextReviewAt: mastery.nextReviewAt }),
        updatedAt: mastery.updatedAt,
      });
      repository.saveSpacedRepetitionSchedule({
        drillItemId: item.id,
        learnerId: session.learnerId,
        nextReviewAt: mastery.nextReviewAt ?? occurredAt,
        intervalDays: update.intervalDays,
        ease: Math.max(1.3, 2.5 - (correct ? 0 : 0.3)),
      });
      nextReviewAt = mastery.nextReviewAt ?? occurredAt;
    }
    this.#drillSessions.set(input.sessionId, {
      learnerId: session.learnerId,
      items: session.items.slice(1),
    });
    return { sessionId: input.sessionId, drillItemId: item.id, correct, nextReviewAt };
  }

  public submit(input: SessionActionInput): SessionActionResult {
    const game = this.requireGame(input.gameId, input.branchId);
    if (input.playerId !== game.humanPlayerId) {
      return {
        accepted: false,
        observation: protocolObservation(game.engine.observation(game.state, game.humanPlayerId)),
        publicEvents: [],
        error: errorFor("unknown_player", "Only the configured human player may submit actions", {
          playerId: input.playerId,
        }),
      };
    }
    const beforeObservation = game.engine.observation(game.state, input.playerId);
    const decisionEvidence = this.decisionEvidenceFor(
      game,
      beforeObservation,
      input.actionId,
      input.requestId,
    );
    const result = game.engine.decide(game.state, {
      type: "submit_action",
      gameId: input.gameId,
      branchId: input.branchId,
      playerId: input.playerId,
      expectedRevision: input.expectedRevision,
      requestId: input.requestId,
      actionId: input.actionId,
    });
    if (!result.accepted) {
      return {
        accepted: false,
        observation: protocolObservation(game.engine.observation(game.state, game.humanPlayerId)),
        publicEvents: [],
        error: errorFor(result.error.code, result.error.message, result.error.details),
      };
    }
    this.persist(game, input.requestId, result.events, result.state, decisionEvidence);
    game.state = result.state;
    const publicEvents = [...result.publicEvents, ...this.driveBots(game)];
    return {
      accepted: true,
      observation: protocolObservation(game.engine.observation(game.state, game.humanPlayerId)),
      publicEvents: protocolPublicEvents(publicEvents),
    };
  }

  private repositoryFor(): SqlitePersistenceRepository {
    const existing = this.#repositories.get(this.#databasePath);
    if (existing !== undefined) {
      return existing;
    }
    const repository = new SqlitePersistenceRepository(
      repositoryOptions(this.#databasePath, this.#clock),
    );
    this.#repositories.set(this.#databasePath, repository);
    return repository;
  }

  private persist(
    game: SessionGame,
    requestId: string,
    events: readonly GameEvent[],
    state: GameState,
    decisionEvidence?: AcceptedDecisionEvidenceInput,
  ): void {
    const repository = this.repositoryFor();
    repository.appendAcceptedCommand({
      key: game.key,
      requestId,
      events,
      state,
      ...(decisionEvidence === undefined ? {} : { decisionEvidence }),
    });
    this.persistPostHandReview(game, state);
  }

  private decisionEvidenceFor(
    game: SessionGame,
    observation: PlayerObservation,
    actionId: string,
    requestId: string,
  ): AcceptedDecisionEvidenceInput | undefined {
    const analyzed = createAnalyzer(game.ruleset).analyzeLegalActions(observation, "balanced");
    const analysis = coachingAnalysisFromLegalActions(analyzed);
    const selected = analysis.candidates.find(
      ({ actionId: candidateId }) => candidateId === actionId,
    );
    if (selected === undefined) return undefined;
    const exported = this.repositoryFor().exportData({ includeLlmMetadata: false });
    const hint = exported.data.hints
      .filter((candidate) => {
        const gameId = candidate.data.gameId;
        const revision = candidate.data.revision;
        return (
          gameId === game.key.gameId &&
          candidate.data.branchId === game.key.branchId &&
          revision === observation.revision
        );
      })
      .sort((left, right) => right.level - left.level)[0];
    const hintLevel: HintLevel =
      hint?.level === 1
        ? "nudge"
        : hint?.level === 2
          ? "compare"
          : hint?.level === 3
            ? "reveal"
            : "none";
    const quality = decisionQualityFromAnalysis(actionId, analysis);
    const decisionId = `decision:${game.key.gameId}:${game.key.branchId}:${String(observation.revision)}`;
    const persistedFacts = [
      ...new Map(
        analysis.facts.map((fact) => [
          fact.id,
          {
            ...fact,
            id: `${decisionId}:${fact.id}`,
          },
        ]),
      ).values(),
    ];
    return {
      decision: {
        id: decisionId,
        learnerId: game.learnerId,
        handId: game.state.hand.id,
        revision: observation.revision,
        playerId: observation.viewer.playerId,
        actionId,
        independent: hintLevel === "none",
        quality,
        analysisVersion: analysis.analysisVersion,
        weightingVersion: analysis.weightingVersion,
        data: jsonObject({
          conceptIds: conceptsFromFacts(analysis.facts),
          selectedActionId: actionId,
          recommendedActionId: analysis.recommendedActionId,
          quality,
          hintLevel,
          requestId,
          factIds: persistedFacts.map(({ id }) => id),
        }),
      },
      analysisFacts: persistedFacts.map((fact) => ({
        id: fact.id,
        kind: fact.kind,
        summary: fact.summary,
        data: jsonObject(fact.data),
      })),
    };
  }

  private persistPostHandReview(game: SessionGame, state: GameState): void {
    if (
      state.hand.result === null ||
      (state.phase !== "hand_ended" && state.phase !== "match_ended")
    ) {
      return;
    }
    const repository = this.repositoryFor();
    const reviewId = `review:${game.key.gameId}:${game.key.branchId}:${state.hand.id}`;
    const exported = repository.exportData({ includeLlmMetadata: false });
    if (exported.data.reviews.some(({ id }) => id === reviewId)) return;
    const decisions = exported.data.decisions
      .filter(
        (decision) =>
          decision.key.gameId === game.key.gameId &&
          decision.key.branchId === game.key.branchId &&
          decision.handId === state.hand.id &&
          decision.learnerId === game.learnerId,
      )
      .map(decisionFromRecord)
      .filter((decision): decision is CoachingDecisionRecord => decision !== null);
    const result =
      state.hand.result.kind === "win"
        ? {
            kind: "win" as const,
            winners: state.hand.result.winners.map(({ playerId, scoring }) => ({
              playerId,
              scoring: { cappedFaan: scoring.cappedFaan },
            })),
          }
        : { kind: state.hand.result.kind, winners: [] as const };
    const review = createPostHandReview({
      handId: state.hand.id,
      result,
      decisions,
      mastery: this.mastery(game.learnerId),
      omniscientAvailable: true,
    });
    repository.recordReview({
      id: reviewId,
      learnerId: game.learnerId,
      key: game.key,
      handId: state.hand.id,
      data: jsonObject(review as unknown as Readonly<Record<string, unknown>>),
    });
  }

  private driveBots(game: SessionGame): readonly PublicGameEvent[] {
    const publicEvents: PublicGameEvent[] = [];
    for (let iteration = 0; iteration < 256; iteration += 1) {
      const humanObservation = game.engine.observation(game.state, game.humanPlayerId);
      if (humanObservation.legalActions.length > 0 || game.state.phase === "match_ended") {
        return publicEvents;
      }
      let advanced = false;
      for (const [playerId, policy] of game.botPolicies) {
        const observation = game.engine.observation(game.state, playerId);
        if (observation.legalActions.length === 0) {
          continue;
        }
        const decision = policy.decide(observation);
        if (decision === null) {
          continue;
        }
        const requestId = `bot:${game.state.gameId}:${String(game.state.revision)}:${playerId}`;
        const result = game.engine.decide(game.state, {
          type: "submit_action",
          gameId: game.state.gameId,
          branchId: game.state.branchId,
          playerId,
          expectedRevision: game.state.revision,
          requestId,
          actionId: decision.actionId,
        });
        if (!result.accepted) {
          throw new Error(`Bot action rejected: ${result.error.message}`);
        }
        this.persist(game, requestId, result.events, result.state);
        game.state = result.state;
        publicEvents.push(...result.publicEvents);
        advanced = true;
        break;
      }
      if (!advanced) {
        return publicEvents;
      }
    }
    throw new Error("Bot controller exceeded its action bound");
  }

  private gameMapKey(key: SessionGameKey): string {
    return `${key.gameId}:${key.branchId}`;
  }

  private requireGame(gameId: string, branchId: string): SessionGame {
    const key = this.gameMapKey({ gameId, branchId });
    const existing = this.#games.get(key);
    if (existing !== undefined) {
      return existing;
    }
    try {
      this.load(gameId, branchId);
    } catch {
      throw new Error(`Unknown game ${gameId}/${branchId}`);
    }
    const hydrated = this.#games.get(key);
    if (hydrated === undefined) {
      throw new Error(`Unknown game ${gameId}/${branchId}`);
    }
    return hydrated;
  }
}

export { DEFAULT_OPPONENTS };
