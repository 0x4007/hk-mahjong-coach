import type { CombatValidation, CombatValidationFailure } from "../world-types.js";

export const scoreCombatPlan = (
  failures: readonly CombatValidationFailure[],
  travel: CombatValidation["travel"],
  visibility: CombatValidation["visibility"],
): number => {
  const failurePenalty = failures.length * 1000;
  const routeBalance = Math.abs(travel.attackerToASeconds - travel.attackerToBSeconds);
  const visibilityPenalty = Math.max(0, visibility.maximumVisibleShare - 0.2) * 100;
  const longSightlinePenalty = Math.max(0, visibility.longSightlines.length - 1) * 50;
  return 10_000 - failurePenalty - routeBalance * 10 - visibilityPenalty - longSightlinePenalty;
};

export const isCombatValidationFailure = (
  failures: readonly CombatValidationFailure[],
  code: CombatValidationFailure["code"],
): boolean => failures.some((failure) => failure.code === code);
