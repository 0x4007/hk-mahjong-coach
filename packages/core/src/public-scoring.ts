import type {
  PublicScoringResult,
  ScoringResult,
  WinningDecomposition,
  WinningDecompositionSummary,
} from "./domain.js";
import { tileTypeFromInstanceId } from "./tiles.js";

const publicDecomposition = (decomposition: WinningDecomposition): WinningDecomposition => ({
  form: decomposition.form,
  concealedGroups: decomposition.concealedGroups.map(({ kind, tileTypes }) => ({
    kind,
    tileTypes: [...tileTypes],
  })),
  declaredMeldIds: [...decomposition.declaredMeldIds],
});

const publicAlternative = (
  alternative: WinningDecompositionSummary,
): WinningDecompositionSummary => ({
  decomposition: publicDecomposition(alternative.decomposition),
  rawFaan: alternative.rawFaan,
  cappedFaan: alternative.cappedFaan,
  legalWin: alternative.legalWin,
  appliedRuleIds: [...alternative.appliedRuleIds],
});

/**
 * Allowlists terminal scoring facts for clients. Physical IDs and free-form evaluator evidence
 * deliberately remain authoritative-only.
 */
export const projectPublicScoringResult = (scoring: ScoringResult): PublicScoringResult => ({
  rulesetId: scoring.rulesetId,
  rulesetVersion: scoring.rulesetVersion,
  rulesetHash: scoring.rulesetHash,
  winnerId: scoring.winnerId,
  winningTileTypeId: tileTypeFromInstanceId(scoring.winningTileId),
  winSource: scoring.winSource,
  decomposition: publicDecomposition(scoring.decomposition),
  alternatives: scoring.alternatives.map(publicAlternative),
  applied: scoring.applied.map(
    ({ ruleId, name, value, occurrences, faanContribution, impliedByRuleIds }) => ({
      ruleId,
      name,
      value: structuredClone(value),
      occurrences,
      faanContribution,
      impliedByRuleIds: [...impliedByRuleIds],
    }),
  ),
  suppressed: scoring.suppressed.map(
    ({ ruleId, name, value, occurrences, wouldAddFaan, reason, byRuleIds }) => ({
      ruleId,
      name,
      value: structuredClone(value),
      occurrences,
      wouldAddFaan,
      reason,
      byRuleIds: [...byRuleIds],
    }),
  ),
  rawFaan: scoring.rawFaan,
  cappedFaan: scoring.cappedFaan,
  minimumRequired: scoring.minimumRequired,
  missingFaan: scoring.missingFaan,
  legalWin: scoring.legalWin,
  basePoints: scoring.basePoints,
  payments: scoring.payments.map(
    ({ fromPlayerId, toPlayerId, points, basePoints, multiplier, reasons }) => ({
      fromPlayerId,
      toPlayerId,
      points,
      basePoints,
      multiplier,
      reasons: [...reasons],
    }),
  ),
  standardComparison:
    scoring.standardComparison === null
      ? null
      : {
          rulesetId: scoring.standardComparison.rulesetId,
          rulesetVersion: scoring.standardComparison.rulesetVersion,
          rulesetHash: scoring.standardComparison.rulesetHash,
          rawFaan: scoring.standardComparison.rawFaan,
          cappedFaan: scoring.standardComparison.cappedFaan,
          minimumRequired: scoring.standardComparison.minimumRequired,
          missingFaan: scoring.standardComparison.missingFaan,
          legalWin: scoring.standardComparison.legalWin,
          appliedRuleIds: [...scoring.standardComparison.appliedRuleIds],
        },
});
