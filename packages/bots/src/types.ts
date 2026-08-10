import type { PlayerObservation } from "@hk-mahjong/core/public";
import type { AnalysisPersonality } from "@hk-mahjong/analysis";
import type { ResolvedRuleset } from "@hk-mahjong/hk-rules";

export const BOT_POLICY_VERSION = "1.0.0" as const;

export type BotDifficulty = "novice" | "basic" | "intermediate" | "advanced";
export type BotPersonality = AnalysisPersonality;
export type ObservedLegalAction = PlayerObservation["legalActions"][number];

export interface BotDecision {
  schemaVersion: 1;
  policyVersion: typeof BOT_POLICY_VERSION;
  botId: string;
  difficulty: BotDifficulty;
  personality: BotPersonality;
  branchId: PlayerObservation["branchId"];
  practiceBranch: boolean;
  observationRevision: number;
  actionId: string;
  actionType: ObservedLegalAction["type"];
  analysisRank: number | null;
  reason:
    | "ordinary_win"
    | "scripted_win_pass"
    | "match_progression"
    | "ranked_discard"
    | "strategic_action"
    | "novice_mistake";
}

export interface BotPolicy {
  decide(observation: PlayerObservation): BotDecision | null;
}

export interface BotPolicyConfig {
  botId: string;
  difficulty: BotDifficulty;
  personality: BotPersonality;
  ruleset: ResolvedRuleset;
  noviceMistakeFrequency?: number;
}

export interface ScriptedTeachingBotPolicyConfig extends BotPolicyConfig {
  passLegalWinsAtRevisions: readonly number[];
}

export interface AdaptiveDecisionEvidence {
  decisionId: string;
  quality: number;
  independent: boolean;
}

export interface AdaptiveDifficultySelection {
  version: "adaptive-difficulty-v1";
  branchId: PlayerObservation["branchId"];
  practiceBranch: boolean;
  handIndex: number;
  difficulty: BotDifficulty;
  evidenceDecisionIds: readonly string[];
}

export interface AdaptiveDifficultySelector {
  selectionForHand(
    observation: PlayerObservation,
    recentDecisions: readonly AdaptiveDecisionEvidence[],
  ): AdaptiveDifficultySelection;
  completeHand(observation: PlayerObservation): void;
}
