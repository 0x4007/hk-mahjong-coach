import type { RandomSource } from "./rng.js";
import type { Wind } from "./seats.js";
import type { StandardTileTypeId, TileInstanceId, TileTypeId } from "./tiles.js";

export type PlayerId = string;
export type GameId = string;
export type BranchId = string;
export type EventId = string;
export type ActionId = string;
export type RequestId = string;

export const MAIN_BRANCH_ID = "main" as const;

export type GameMode = "learn" | "guided" | "socratic" | "competitive" | "exam" | "sandbox";
export type PlayerController = "human" | "bot" | "external_llm";
export type MatchLength = "one_wind" | "full_four_winds";
export type WinSource = "self_draw" | "discard" | "robbing_kong" | "replacement" | "initial_deal";

export interface CoreGameRules {
  id: string;
  version: string;
  hash: string;
  minimumFaan: number;
  capFaan: number;
  bonusTilesEnabled: boolean;
  multipleWinners: boolean;
  sameTileWinLockUntilNextDraw: boolean;
  passedWinLockTriggers: "explicit_pass" | "any_unclaimed_legal_win";
  passedWinLockIncludesKongRobbery: boolean;
  robAddedKong: boolean;
  robConcealedKong: boolean;
  concealedKongRobberyForms: readonly ("standard" | "thirteen_orphans")[];
  allowKongImmediatelyAfterChowOrPung: boolean;
  initialDealWinsEnabled: boolean;
  dealerRepeatsOnWin: boolean;
  dealerRepeatsOnDraw: boolean;
  dealerRepeatsWhenAmongMultipleWinners: boolean;
  prevailingWinds: readonly Wind[];
}

export interface CreatePlayer {
  id: PlayerId;
  displayName: string;
  controller: PlayerController;
  seat?: Wind;
  initialScore?: number;
}

export interface CreateGameCommand {
  type: "create_game";
  requestId: RequestId;
  branchId: typeof MAIN_BRANCH_ID;
  seed: string;
  mode: GameMode;
  matchLength: MatchLength;
  rules: CoreGameRules;
  players: readonly [CreatePlayer, CreatePlayer, CreatePlayer, CreatePlayer];
}

/**
 * Deterministic context supplied when an engine caller overrides wall construction. This is not
 * a `CreateGameCommand`: later hands and practice branches are not new main games.
 */
export interface WallProviderContext {
  gameId: GameId;
  branchId: BranchId;
  requestId: RequestId;
  seed: string;
  mode: GameMode;
  matchLength: MatchLength;
  rules: CoreGameRules;
  players: readonly CreatePlayer[];
  handIndex: number;
}

export interface SubmitActionCommand {
  type: "submit_action";
  gameId: GameId;
  branchId: BranchId;
  playerId: PlayerId;
  expectedRevision: number;
  requestId: RequestId;
  actionId: ActionId;
}

export interface EndSandboxHandCommand {
  type: "end_sandbox_hand";
  gameId: GameId;
  branchId: BranchId;
  playerId: PlayerId;
  expectedRevision: number;
  requestId: RequestId;
}

/**
 * Creates a non-destructive practice timeline from the supplied parent-state revision. Callers
 * load the parent state at that revision before invoking the pure engine; persistence verifies
 * that the decision provenance belongs to that historical branch.
 */
export interface CreatePracticeBranchCommand {
  type: "create_practice_branch";
  gameId: GameId;
  /** The new, practice-only branch ID. */
  branchId: BranchId;
  parentBranchId: BranchId;
  playerId: PlayerId;
  expectedRevision: number;
  requestId: RequestId;
  originDecisionId: string;
}

export type GameCommand = SubmitActionCommand | EndSandboxHandCommand | CreatePracticeBranchCommand;

export type GamePhase =
  | "setup"
  | "initial_replacements"
  | "awaiting_discard"
  | "awaiting_claims"
  | "awaiting_kong_robbery"
  | "drawing_replacement"
  | "hand_ended"
  | "match_ended";

export interface TemporaryRestriction {
  type: "same_tile_win_lock";
  tileTypeId: TileTypeId;
  until: "next_draw";
}

export interface DiscardRecord {
  id: string;
  tileId: TileInstanceId;
  playerId: PlayerId;
  eventId: EventId;
  followedFinalLiveDraw: boolean;
  dealerFirstDiscard: boolean;
  claimedBy: PlayerId | null;
  claimMeldId: string | null;
  winningPlayerIds: PlayerId[];
}

export interface Meld {
  id: string;
  kind: "chow" | "pung" | "kong";
  kongKind: "exposed" | "concealed" | "added" | null;
  tileIds: TileInstanceId[];
  exposed: boolean;
  claimedFrom: PlayerId | null;
  claimedTileId: TileInstanceId | null;
  createdEventId: EventId;
}

export interface PlayerState {
  id: PlayerId;
  displayName: string;
  controller: PlayerController;
  seat: Wind;
  score: number;
  concealed: TileInstanceId[];
  melds: Meld[];
  bonusTiles: TileInstanceId[];
  discards: DiscardRecord[];
  temporaryRestrictions: TemporaryRestriction[];
}

export interface WallState {
  tiles: readonly TileInstanceId[];
  liveIndex: number;
  replacementIndex: number;
}

export interface MatchState {
  matchLength: MatchLength;
  initialTotalScore: number;
  effectivePrevailingWinds: readonly Wind[];
  prevailingWindIndex: number;
  prevailingWind: Wind;
  windHandIndex: number;
  handIndex: number;
  dealerPlayerId: PlayerId;
  handsCompleted: number;
}

export type WinningForm = "standard" | "seven_pairs" | "thirteen_orphans" | "nine_gates";

export interface ConcealedScoringGroup {
  kind: "chow" | "pung" | "pair";
  tileTypes: readonly StandardTileTypeId[];
}

export interface WinningDecomposition {
  form: WinningForm;
  concealedGroups: readonly ConcealedScoringGroup[];
  declaredMeldIds: readonly string[];
}

export type ScoringRuleValue = { type: "faan"; amount: number } | { type: "limit" };

export interface AppliedScoringRule {
  ruleId: string;
  name: string;
  value: ScoringRuleValue;
  occurrences: number;
  faanContribution: number;
  evidence: readonly string[];
  impliedByRuleIds: readonly string[];
}

export type ScoringSuppressionReason =
  "suppressed_by_rule" | "suppressed_by_stacking_group" | "excluded_by_rule" | "limit_aggregation";

export interface SuppressedScoringRule {
  ruleId: string;
  name: string;
  value: ScoringRuleValue;
  occurrences: number;
  wouldAddFaan: number;
  reason: ScoringSuppressionReason;
  byRuleIds: readonly string[];
  evidence: readonly string[];
}

export interface WinningDecompositionSummary {
  decomposition: WinningDecomposition;
  rawFaan: number;
  cappedFaan: number;
  legalWin: boolean;
  appliedRuleIds: readonly string[];
}

export interface StandardScoringComparison {
  rulesetId: string;
  rulesetVersion: string;
  rulesetHash: string;
  rawFaan: number;
  cappedFaan: number;
  minimumRequired: number;
  missingFaan: number;
  legalWin: boolean;
  appliedRuleIds: readonly string[];
}

export interface ScoringBreakdown {
  rulesetId: string;
  rulesetVersion: string;
  rulesetHash: string;
  winnerId: PlayerId;
  winningTileId: TileInstanceId;
  winSource: WinSource;
  decomposition: WinningDecomposition;
  alternatives: readonly WinningDecompositionSummary[];
  applied: readonly AppliedScoringRule[];
  suppressed: readonly SuppressedScoringRule[];
  rawFaan: number;
  cappedFaan: number;
  minimumRequired: number;
  missingFaan: number;
  legalWin: boolean;
  basePoints: number;
  standardComparison: StandardScoringComparison | null;
}

export interface PlayerPayment {
  fromPlayerId: PlayerId;
  toPlayerId: PlayerId;
  points: number;
  basePoints: number;
  multiplier: number;
  reasons: readonly ("discarder" | "other_loser" | "self_draw" | "dealer")[];
}

export interface ScoringResult extends ScoringBreakdown {
  payments: readonly PlayerPayment[];
}

export interface ScoringPreview {
  shapeComplete: boolean;
  legalWin: boolean;
  rawFaan: number;
  cappedFaan: number;
  minimumRequired: number;
  missingFaan: number;
  appliedRuleIds: readonly string[];
  winningForm: "standard" | "seven_pairs" | "thirteen_orphans" | "nine_gates" | null;
  reason:
    | "legal"
    | "shape_incomplete"
    | "below_minimum_faan"
    | "passed_win_restriction"
    | "kong_robbery_form_not_allowed";
}

export interface WinnerRecord {
  playerId: PlayerId;
  source: WinSource;
  winningTileId: TileInstanceId;
  fromPlayerId: PlayerId | null;
  preview: ScoringPreview;
  scoring: ScoringResult;
}

export type HandResult =
  | {
      kind: "win";
      winners: WinnerRecord[];
      scoreDeltas: Readonly<Record<PlayerId, number>>;
    }
  | {
      kind: "exhaustive_draw" | "sandbox_end";
      winners: [];
      scoreDeltas: Readonly<Record<PlayerId, number>>;
    };

export interface HandState {
  id: string;
  seed: string;
  activePlayerId: PlayerId;
  dealerPlayerId: PlayerId;
  turnOrigin: "initial_deal" | "draw" | "claim" | "replacement";
  drawnTileId: TileInstanceId | null;
  lastDrawSource: "live" | "replacement" | "initial_deal" | null;
  lastDrawReason: "initial_deal" | "turn" | "bonus_replacement" | "kong_replacement" | null;
  drawnTileWasFinalLiveTile: boolean;
  turnConsumedFinalLiveTile: boolean;
  lastDiscardId: string | null;
  firstDiscardCompleted: boolean;
  callsOccurred: boolean;
  initialBonusReplacementOccurred: boolean;
  openingKongOccurred: boolean;
  winningTileZone: TileInstanceId[];
  result: HandResult | null;
}

export interface PendingClaimResponse {
  playerId: PlayerId;
  action: ClaimWindowAction;
}

export interface PendingClaimWindow {
  kind: "discard_claim";
  id: string;
  discardId: string;
  discarderId: PlayerId;
  tileId: TileInstanceId;
  openedAtRevision: number;
  eligiblePlayerIds: PlayerId[];
  optionsByPlayer: Partial<Record<PlayerId, readonly ClaimWindowAction[]>>;
  winAssessmentsByPlayer: Partial<Record<PlayerId, ScoringAssessment>>;
  responses: Partial<Record<PlayerId, PendingClaimResponse>>;
}

export interface PendingKongRobberyWindow {
  kind: "kong_robbery";
  id: string;
  proposerId: PlayerId;
  kongKind: "added" | "concealed";
  robberyTileId: TileInstanceId;
  concealedTileIds: TileInstanceId[];
  meldId: string | null;
  openedAtRevision: number;
  eligiblePlayerIds: PlayerId[];
  optionsByPlayer: Partial<Record<PlayerId, readonly ClaimWindowAction[]>>;
  winAssessmentsByPlayer: Partial<Record<PlayerId, ScoringAssessment>>;
  responses: Partial<Record<PlayerId, PendingClaimResponse>>;
}

export type PendingDecision = PendingClaimWindow | PendingKongRobberyWindow;

export interface GameState {
  schemaVersion: 1;
  gameId: GameId;
  branchId: BranchId;
  practiceBranch: boolean;
  revision: number;
  ruleset: CoreGameRules;
  seed: string;
  rngVersion: string;
  mode: GameMode;
  phase: GamePhase;
  match: MatchState;
  hand: HandState;
  players: Record<PlayerId, PlayerState>;
  wall: WallState;
  pending: PendingDecision | null;
  processedRequestIds: RequestId[];
  lastEventId: EventId | null;
  stateHash: string;
}

export interface ScoringAssessmentInput {
  rules: CoreGameRules;
  mode: GameMode;
  player: {
    id: PlayerId;
    seat: Wind;
    concealedTileIds: readonly TileInstanceId[];
    melds: readonly Meld[];
    bonusTileIds: readonly TileInstanceId[];
  };
  prevailingWind: Wind;
  dealerPlayerId: PlayerId;
  winningTileId: TileInstanceId;
  winSource: WinSource;
  fromPlayerId: PlayerId | null;
  replacementReason: "bonus" | "kong" | null;
  isInitialDeal: boolean;
  isDealerFirstDiscard: boolean;
  initialBonusReplacementOccurred: boolean;
  openingKongOccurred: boolean;
  firstDiscardCompleted: boolean;
  callsOccurred: boolean;
  robbedKongKind: "added" | "concealed" | null;
  winningTileWasFinalLiveTile: boolean;
  discardFollowedFinalLiveDraw: boolean;
}

export interface ScoringAssessment {
  preview: ScoringPreview;
  breakdown: ScoringBreakdown | null;
}

export interface PaymentSettlementInput {
  players: readonly {
    id: PlayerId;
    seat: Wind;
  }[];
  dealerPlayerId: PlayerId;
  winners: readonly {
    playerId: PlayerId;
    source: WinSource;
    fromPlayerId: PlayerId | null;
    breakdown: ScoringBreakdown;
  }[];
}

export interface PaymentSettlement {
  payments: readonly PlayerPayment[];
  scoreDeltas: Readonly<Record<PlayerId, number>>;
}

export interface ScoringSystem {
  assess(input: ScoringAssessmentInput): ScoringAssessment;
  settle(input: PaymentSettlementInput): PaymentSettlement;
}

export interface EngineDependencies {
  scoringSystem: ScoringSystem;
  wallProvider?: (
    inventory: readonly TileInstanceId[],
    random: RandomSource,
    context: WallProviderContext,
  ) => readonly TileInstanceId[];
}

export type LegalAction =
  | { id: ActionId; type: "discard"; tileId: TileInstanceId }
  | { id: ActionId; type: "declare_win"; source: WinSource; preview: ScoringPreview }
  | {
      id: ActionId;
      type: "declare_concealed_kong";
      tileIds: readonly TileInstanceId[];
    }
  | {
      id: ActionId;
      type: "declare_added_kong";
      meldId: string;
      tileId: TileInstanceId;
    }
  | {
      id: ActionId;
      type: "claim_chow";
      discardId: string;
      tileIdsFromHand: readonly TileInstanceId[];
    }
  | {
      id: ActionId;
      type: "claim_pung";
      discardId: string;
      tileIdsFromHand: readonly TileInstanceId[];
    }
  | {
      id: ActionId;
      type: "claim_kong";
      discardId: string;
      tileIdsFromHand: readonly TileInstanceId[];
    }
  | {
      id: ActionId;
      type: "claim_win";
      windowId: string;
      source: "discard" | "robbing_kong";
      discardId: string | null;
      tileTypeId: TileTypeId;
      meldId: string | null;
      preview: ScoringPreview;
    }
  | { id: ActionId; type: "pass"; windowId: string }
  | { id: ActionId; type: "start_next_hand"; completedHandId: string };

export type ClaimWindowAction = Extract<
  LegalAction,
  { type: "claim_chow" | "claim_pung" | "claim_kong" | "claim_win" | "pass" }
>;

export type EventVisibility = "public" | "internal";

interface EventBase {
  id: EventId;
  gameId: GameId;
  branchId: BranchId;
  revision: number;
  requestId: RequestId;
  visibility: EventVisibility;
}

export interface AssignedPlayer {
  id: PlayerId;
  displayName: string;
  controller: PlayerController;
  seat: Wind;
  initialScore: number;
}

export interface GameCreatedEvent extends EventBase {
  type: "game_created";
  seed: string;
  rngVersion: string;
  mode: GameMode;
  rules: CoreGameRules;
  matchLength: MatchLength;
  players: readonly AssignedPlayer[];
  wallOrder: readonly TileInstanceId[];
}

export interface DealTraceEntry {
  playerId: PlayerId;
  tileId: TileInstanceId;
  source: "live" | "replacement";
  disposition: "concealed" | "bonus";
}

export interface InitialPlayerDeal {
  concealed: readonly TileInstanceId[];
  bonusTiles: readonly TileInstanceId[];
  drawnTileId: TileInstanceId | null;
}

export interface InitialDealCompletedEvent extends EventBase {
  type: "initial_deal_completed";
  deals: Readonly<Record<PlayerId, InitialPlayerDeal>>;
  trace: readonly DealTraceEntry[];
  liveIndex: number;
  replacementIndex: number;
}

export interface DrawStep {
  tileId: TileInstanceId;
  source: "live" | "replacement";
  disposition: "concealed" | "bonus";
  reason: "turn" | "bonus_replacement" | "kong_replacement";
  finalLiveTile: boolean;
}

export interface DrawCompletedEvent extends EventBase {
  type: "draw_completed";
  playerId: PlayerId;
  fromWindowId: string | null;
  steps: readonly DrawStep[];
  outcome: "ready" | "replacement_exhausted";
}

export interface TileDiscardedEvent extends EventBase {
  type: "tile_discarded";
  playerId: PlayerId;
  tileId: TileInstanceId;
  discardId: string;
  windowId: string;
  eligiblePlayerIds: readonly PlayerId[];
  optionsByPlayer: Readonly<Partial<Record<PlayerId, readonly ClaimWindowAction[]>>>;
  winAssessmentsByPlayer: Readonly<Partial<Record<PlayerId, ScoringAssessment>>>;
  followedFinalLiveDraw: boolean;
  dealerFirstDiscard: boolean;
}

export interface ClaimResponseRecordedEvent extends EventBase {
  type: "claim_response_recorded";
  windowId: string;
  playerId: PlayerId;
  action: ClaimWindowAction;
  passedWinLockTileTypeId: TileTypeId | null;
}

export interface MeldClaimedEvent extends EventBase {
  type: "meld_claimed";
  windowId: string;
  playerId: PlayerId;
  discardId: string;
  kind: "chow" | "pung" | "kong";
  tileIdsFromHand: readonly TileInstanceId[];
  meldId: string;
}

export interface KongProposedEvent extends EventBase {
  type: "kong_proposed";
  windowId: string;
  proposerId: PlayerId;
  kongKind: "added" | "concealed";
  robberyTileId: TileInstanceId;
  concealedTileIds: readonly TileInstanceId[];
  meldId: string | null;
  eligiblePlayerIds: readonly PlayerId[];
  optionsByPlayer: Readonly<Partial<Record<PlayerId, readonly ClaimWindowAction[]>>>;
  winAssessmentsByPlayer: Readonly<Partial<Record<PlayerId, ScoringAssessment>>>;
}

export interface KongCompletedEvent extends EventBase {
  type: "kong_completed";
  windowId: string | null;
  playerId: PlayerId;
  kongKind: "concealed" | "added";
  tileIds: readonly TileInstanceId[];
  meldId: string;
}

export interface HandWonEvent extends EventBase {
  type: "hand_won";
  windowId: string | null;
  winners: readonly WinnerRecord[];
  scoreDeltas: Readonly<Record<PlayerId, number>>;
  tileOwner:
    | { kind: "self_draw" }
    | { kind: "discard"; discardId: string }
    | {
        kind: "kong_robbery";
        proposerId: PlayerId;
        tileId: TileInstanceId;
      };
}

export interface HandEndedEvent extends EventBase {
  type: "hand_ended";
  reason: "exhaustive_draw" | "sandbox_end";
}

export interface NextHandStartedEvent extends EventBase {
  type: "next_hand_started";
  previousHandId: string;
  handId: string;
  dealerRepeated: boolean;
  handIndex: number;
  handsCompleted: number;
  prevailingWindIndex: number;
  prevailingWind: Wind;
  windHandIndex: number;
  dealerPlayerId: PlayerId;
  seatAssignments: readonly {
    playerId: PlayerId;
    seat: Wind;
  }[];
  handSeed: string;
  rngVersion: string;
  wallOrder: readonly TileInstanceId[];
}

export interface MatchEndedEvent extends EventBase {
  type: "match_ended";
  finalHandId: string;
  reason: "schedule_complete";
}

/**
 * The first child-local event. Its revision immediately follows the parent state revision and
 * the reducer switches the whole state to the child identity when applying it.
 */
export interface PracticeBranchCreatedEvent extends EventBase {
  type: "practice_branch_created";
  parentBranchId: BranchId;
  parentRevision: number;
  parentEventId: EventId;
  parentStateHash: string;
  originDecisionId: string;
  originDecisionBranchId: BranchId;
  requestedByPlayerId: PlayerId;
}

export type GameEvent =
  | GameCreatedEvent
  | InitialDealCompletedEvent
  | DrawCompletedEvent
  | TileDiscardedEvent
  | ClaimResponseRecordedEvent
  | MeldClaimedEvent
  | KongProposedEvent
  | KongCompletedEvent
  | HandWonEvent
  | HandEndedEvent
  | NextHandStartedEvent
  | MatchEndedEvent
  | PracticeBranchCreatedEvent;

export type EngineErrorCode =
  | "invalid_request"
  | "unknown_game"
  | "unknown_player"
  | "stale_revision"
  | "duplicate_request"
  | "not_players_turn"
  | "action_not_legal"
  | "claim_window_closed"
  | "win_shape_incomplete"
  | "win_below_minimum_faan"
  | "passed_win_restriction"
  | "ruleset_invalid";

export interface EngineError {
  code: EngineErrorCode;
  message: string;
  details: Readonly<Record<string, unknown>>;
}

export type CreateEngineResult =
  | {
      accepted: true;
      state: GameState;
      events: readonly GameEvent[];
      publicEvents: readonly PublicGameEvent[];
    }
  | {
      accepted: false;
      error: EngineError;
      events: [];
      publicEvents: [];
    };

export type EngineResult =
  | {
      accepted: true;
      state: GameState;
      events: readonly GameEvent[];
      publicEvents: readonly PublicGameEvent[];
    }
  | {
      accepted: false;
      state: GameState;
      error: EngineError;
      events: [];
      publicEvents: [];
    };

export interface GameEngine {
  create(command: CreateGameCommand): CreateEngineResult;
  decide(state: GameState, command: GameCommand): EngineResult;
  reduce(state: GameState | undefined, event: GameEvent): GameState;
  legalActions(state: GameState, playerId: PlayerId): readonly LegalAction[];
  observation(state: GameState, playerId: PlayerId): PlayerObservation;
}

export interface PublicMeld {
  id: string;
  kind: Meld["kind"];
  kongKind: Meld["kongKind"];
  tileTypes: readonly TileTypeId[];
  exposed: boolean;
  claimedFrom: PlayerId | null;
}

export interface PublicDiscard {
  id: string;
  tileType: TileTypeId;
  claimedBy: PlayerId | null;
  winningPlayerIds: readonly PlayerId[];
}

export type PublicPendingDecision =
  | {
      kind: "discard_claim";
      windowId: string;
      sourcePlayerId: PlayerId;
      tileTypeId: TileTypeId;
      discardId: string;
    }
  | {
      kind: "kong_robbery";
      windowId: string;
      sourcePlayerId: PlayerId;
      tileTypeId: TileTypeId;
      kongKind: "added" | "concealed";
      meldId: string | null;
    };

export interface PublicWinner {
  playerId: PlayerId;
  source: WinSource;
  winningTileTypeId: TileTypeId;
  fromPlayerId: PlayerId | null;
  preview: ScoringPreview;
  scoring: PublicScoringResult;
}

export interface PublicScoringResult {
  rulesetId: string;
  rulesetVersion: string;
  rulesetHash: string;
  winnerId: PlayerId;
  winningTileTypeId: TileTypeId;
  winSource: WinSource;
  decomposition: WinningDecomposition;
  alternatives: readonly WinningDecompositionSummary[];
  applied: readonly Omit<AppliedScoringRule, "evidence">[];
  suppressed: readonly Omit<SuppressedScoringRule, "evidence">[];
  rawFaan: number;
  cappedFaan: number;
  minimumRequired: number;
  missingFaan: number;
  legalWin: boolean;
  basePoints: number;
  payments: readonly PlayerPayment[];
  standardComparison: StandardScoringComparison | null;
}

interface PublicEventBase {
  schemaVersion: 1;
  eventId: EventId;
  gameId: GameId;
  branchId: BranchId;
  practiceBranch: boolean;
  revision: number;
}

export type PublicGameEvent =
  | (PublicEventBase & {
      type: "game_started";
      mode: GameMode;
      matchLength: MatchLength;
      ruleset: {
        id: string;
        version: string;
        hash: string;
        minimumFaan: number;
        capFaan: number;
        bonusTilesEnabled: boolean;
      };
      players: readonly {
        playerId: PlayerId;
        displayName: string;
        controller: PlayerController;
        seat: Wind;
        score: number;
      }[];
      prevailingWind: Wind;
      dealerPlayerId: PlayerId;
    })
  | (PublicEventBase & {
      type: "initial_deal_completed";
      handId: string;
      players: readonly {
        playerId: PlayerId;
        concealedTileCount: number;
        bonusTileTypes: readonly TileTypeId[];
      }[];
      liveWallCount: number;
    })
  | (PublicEventBase & {
      type: "tile_drawn";
      playerId: PlayerId;
      concealedTileDrawn: boolean;
      exposedBonusTileTypes: readonly TileTypeId[];
      outcome: DrawCompletedEvent["outcome"];
      liveWallCount: number;
    })
  | (PublicEventBase & {
      type: "tile_discarded";
      playerId: PlayerId;
      discardId: string;
      windowId: string;
      tileTypeId: TileTypeId;
      followedFinalLiveDraw: boolean;
    })
  | (PublicEventBase & {
      type: "meld_claimed";
      playerId: PlayerId;
      discardId: string;
      meldId: string;
      kind: "chow" | "pung" | "kong";
      tileTypes: readonly TileTypeId[];
    })
  | (PublicEventBase & {
      type: "kong_proposed";
      windowId: string;
      proposerId: PlayerId;
      kongKind: "added" | "concealed";
      tileTypeId: TileTypeId;
      meldId: string | null;
    })
  | (PublicEventBase & {
      type: "kong_completed";
      playerId: PlayerId;
      kongKind: "added" | "concealed";
      meldId: string;
      tileTypes: readonly TileTypeId[];
    })
  | (PublicEventBase & {
      type: "hand_ended";
      handId: string;
      result: PublicHandResult;
    })
  | (PublicEventBase & {
      type: "hand_started";
      previousHandId: string;
      handId: string;
      dealerRepeated: boolean;
      handIndex: number;
      handsCompleted: number;
      prevailingWindIndex: number;
      prevailingWind: Wind;
      windHandIndex: number;
      dealerPlayerId: PlayerId;
      seatAssignments: readonly {
        playerId: PlayerId;
        seat: Wind;
      }[];
    })
  | (PublicEventBase & {
      type: "match_ended";
      finalHandId: string;
      reason: MatchEndedEvent["reason"];
      standings: readonly {
        playerId: PlayerId;
        seat: Wind;
        score: number;
      }[];
    })
  | (PublicEventBase & {
      type: "practice_branch_created";
      parentBranchId: BranchId;
      parentRevision: number;
      parentEventId: EventId;
      originDecisionId: string;
      originDecisionBranchId: BranchId;
      requestedByPlayerId: PlayerId;
    });

export type PublicHandResult =
  | {
      kind: "win";
      winners: readonly PublicWinner[];
      scoreDeltas: Readonly<Record<PlayerId, number>>;
    }
  | {
      kind: "exhaustive_draw" | "sandbox_end";
      winners: [];
      scoreDeltas: Readonly<Record<PlayerId, number>>;
    };

export interface ObservedPlayer {
  playerId: PlayerId;
  displayName: string;
  seat: Wind;
  score: number;
  concealedTileCount: number;
  melds: readonly PublicMeld[];
  bonusTiles: readonly TileTypeId[];
  discards: readonly PublicDiscard[];
}

export interface PlayerObservation {
  schemaVersion: 1;
  gameId: GameId;
  branchId: BranchId;
  practiceBranch: boolean;
  revision: number;
  phase: GamePhase;
  ruleset: {
    id: string;
    version: string;
    hash: string;
    minimumFaan: number;
    capFaan: number;
    bonusTilesEnabled: boolean;
  };
  viewer: {
    playerId: PlayerId;
    seat: Wind;
    score: number;
  };
  round: {
    prevailingWind: Wind;
    prevailingWindIndex: number;
    windHandIndex: number;
    dealerPlayerId: PlayerId;
    handIndex: number;
    handsCompleted: number;
    liveWallCount: number;
    replacementDrawsAvailable: number;
    activePlayerId: PlayerId;
    lastDiscard: PublicDiscard | null;
    progression: "repeat_dealer" | "advance_dealer" | "match_complete" | null;
  };
  players: readonly ObservedPlayer[];
  pending: PublicPendingDecision | null;
  result: PublicHandResult | null;
  private: {
    concealedTiles: readonly TileInstanceId[];
    drawnTileId: TileInstanceId | null;
    temporaryRestrictions: readonly TemporaryRestriction[];
  };
  legalActions: readonly LegalAction[];
  winAssessment: ScoringPreview | null;
  claimWinAssessment: ScoringPreview | null;
}

export interface OmniscientReplayView {
  schemaVersion: 1;
  state: GameState;
}
