import type {
  PlayerObservation,
  StandardTileTypeId,
  TileInstanceId,
  WinningForm,
} from "@hk-mahjong/core/public";

export const ANALYSIS_VERSION = "1.0.0" as const;
export const ANALYSIS_WEIGHTING_VERSION = "discard-weights-v1" as const;
export const STRATEGIC_ACTION_WEIGHTING_VERSION = "legal-action-weights-v1" as const;
export const ROLLOUT_VERSION = "information-set-rollout-v1" as const;

export type AnalysisFactKind =
  | "distance"
  | "improving_tiles"
  | "visible_copies"
  | "faan_path"
  | "relative_risk"
  | "legal_rule"
  | "score_gap"
  | "learner_pattern";

export interface AnalysisFact {
  id: string;
  kind: AnalysisFactKind;
  summary: string;
  data: Readonly<Record<string, unknown>>;
}

export interface DistanceOptions {
  allowSevenPairs: boolean;
  sevenPairsAllowsQuadAsTwoPairs: boolean;
  allowThirteenOrphans: boolean;
}

export interface DistanceToReady {
  standard: number;
  sevenPairs: number | null;
  thirteenOrphans: number | null;
  minimum: number;
  bestForms: readonly Exclude<WinningForm, "nine_gates">[];
}

export interface ImprovingTileAnalysis {
  tileTypeId: StandardTileTypeId;
  theoreticalCopies: 4;
  visibleCopies: number;
  visibleRemainingCopies: number;
  exhausted: boolean;
  resultingDistance: number;
}

export type FaanPathStatus = "secured" | "likely" | "speculative" | "impossible";

export interface FaanPath {
  id:
    | "fast_mixed"
    | "all_chows"
    | "all_pungs"
    | "half_flush"
    | "full_flush"
    | "dragon_or_wind"
    | "bonus_value"
    | "seven_pairs"
    | "thirteen_orphans"
    | "nine_gates";
  label: string;
  status: FaanPathStatus;
  estimatedFaan: number;
  reason: string;
}

export type AnalysisPersonality = "fast" | "value" | "balanced";

export interface CandidateComponents {
  speed: number;
  visibleAvailability: number;
  handValue: number;
  flexibility: number;
  callCompatibility: number;
  relativeSafety: number;
}

export interface RolloutEstimate {
  version: typeof ROLLOUT_VERSION;
  iterations: number;
  depth: number;
  meanUtility: number;
  uncertainty: number;
}

export interface DiscardCandidateAnalysis {
  actionId: string;
  tileId: TileInstanceId;
  rank: number;
  totalScore: number;
  confidence: number;
  components: CandidateComponents;
  distanceAfterDiscard: number;
  improvingTileTypes: readonly StandardTileTypeId[];
  visibleImprovingCopies: number;
  improvingTiles: readonly ImprovingTileAnalysis[];
  likelyFaanPaths: readonly FaanPath[];
  relativeRisk: number;
  rollout: RolloutEstimate | null;
  risks: readonly AnalysisFact[];
  facts: readonly AnalysisFact[];
  weightingVersion: string;
}

export interface DiscardAnalysisResult {
  schemaVersion: 1;
  analysisVersion: typeof ANALYSIS_VERSION;
  weightingVersion: string;
  branchId: PlayerObservation["branchId"];
  practiceBranch: boolean;
  observationRevision: number;
  playerId: string;
  personality: AnalysisPersonality;
  recommendedActionId: string | null;
  candidates: readonly DiscardCandidateAnalysis[];
  facts: readonly AnalysisFact[];
}

export interface DiscardAnalysisOptions {
  personality?: AnalysisPersonality;
  rollout?: {
    iterations: number;
    depth: number;
  };
}

export interface LegalActionAnalysis {
  actionId: string;
  actionType: PlayerObservation["legalActions"][number]["type"];
  branchId: PlayerObservation["branchId"];
  practiceBranch: boolean;
  observationRevision: number;
  rank: number;
  totalScore: number;
  weightingVersion: string;
  baselineActionId: string | null;
  scoreDeltaFromBaseline: number;
  components: CandidateComponents;
  distanceAfterAction: number | null;
  visibleImprovingCopies: number | null;
  likelyFaanPaths: readonly FaanPath[];
  relativeRisk: number;
  valueFaan: number;
  opensHand: boolean;
  facts: readonly AnalysisFact[];
}

export interface ObservationAnalysisInput {
  observation: PlayerObservation;
}
