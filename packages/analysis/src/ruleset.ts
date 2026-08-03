import type { PlayerObservation } from "@hk-mahjong/core/public";
import type { ResolvedRuleset, ScoringRuleId } from "@hk-mahjong/hk-rules";

export const compareCodePoints = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

export const assertObservationRuleset = (
  observation: PlayerObservation,
  ruleset: ResolvedRuleset,
): void => {
  const runtimeSchemaVersion = (observation as { schemaVersion: number }).schemaVersion;
  if (runtimeSchemaVersion !== 1) {
    throw new Error(`Unsupported observation schema ${String(runtimeSchemaVersion)}`);
  }
  const expected = ruleset.definition;
  if (
    observation.ruleset.id !== expected.id ||
    observation.ruleset.version !== expected.version ||
    observation.ruleset.hash !== ruleset.hash ||
    observation.ruleset.minimumFaan !== expected.winRules.minimumFaan ||
    observation.ruleset.capFaan !== expected.winRules.capFaan ||
    observation.ruleset.bonusTilesEnabled !== expected.tileSet.bonusTilesEnabled
  ) {
    throw new Error(
      `Analysis ruleset mismatch: expected ${expected.id}@${expected.version} (${ruleset.hash})`,
    );
  }
};

export const configuredFaan = (ruleset: ResolvedRuleset, ruleId: ScoringRuleId): number => {
  const rule = ruleset.definition.scoringRules.find(({ id }) => id === ruleId);
  if (rule?.enabled !== true) {
    return 0;
  }
  return rule.value.type === "limit" ? ruleset.definition.winRules.capFaan : rule.value.amount;
};
