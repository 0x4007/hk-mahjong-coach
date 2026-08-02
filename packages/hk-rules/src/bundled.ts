import modernInput from "../../../rulesets/hk_modern_13f_v1.json" with { type: "json" };
import defaultInput from "../../../rulesets/hk_nyc_social_v1.json" with { type: "json" };
import trainingInput from "../../../rulesets/training_relaxed_v1.json" with { type: "json" };
import { resolveRuleset, type ResolvedRuleset } from "./ruleset.js";

export const BUNDLED_RULESET_IDS = [
  "hk_nyc_social_v1",
  "hk_modern_13f_v1",
  "training_relaxed_v1",
] as const;

export type BundledRulesetId = (typeof BUNDLED_RULESET_IDS)[number];

const resolvedInputs = [defaultInput, modernInput, trainingInput].map(resolveRuleset);

export const createRulesetRegistry = (
  rulesets: readonly ResolvedRuleset[],
  requiredIds: readonly string[],
): ReadonlyMap<string, ResolvedRuleset> => {
  const registry = new Map(rulesets.map((ruleset) => [ruleset.definition.id, ruleset] as const));
  const identities = new Set(
    rulesets.map(({ definition }) => `${definition.id}@${definition.version}`),
  );

  if (
    registry.size !== requiredIds.length ||
    identities.size !== requiredIds.length ||
    requiredIds.some((id) => !registry.has(id))
  ) {
    throw new Error("Bundled ruleset registry does not match the required profile IDs");
  }

  for (const { definition } of rulesets) {
    const comparisonId = definition.standardComparisonRulesetId;
    if (comparisonId !== null && (comparisonId === definition.id || !registry.has(comparisonId))) {
      throw new Error(
        `Bundled ruleset ${definition.id} has an invalid standard comparison ${comparisonId}`,
      );
    }
  }

  return registry;
};

const bundledById = createRulesetRegistry(resolvedInputs, BUNDLED_RULESET_IDS);

export const BUNDLED_RULESETS: readonly ResolvedRuleset[] = Object.freeze(resolvedInputs);

export const getBundledRuleset = (id: string): ResolvedRuleset => {
  const ruleset = bundledById.get(id);
  if (ruleset === undefined) {
    throw new RangeError(`Unknown bundled ruleset: ${id}`);
  }
  return ruleset;
};

export interface RulesetSummary {
  id: string;
  version: string;
  hash: string;
  displayName: string;
  description: string;
  disclaimer: string;
  minimumFaan: number;
  capFaan: number;
  bonusTilesEnabled: boolean;
}

export const listBundledRulesets = (): readonly RulesetSummary[] =>
  BUNDLED_RULESETS.map(({ definition, hash }) => ({
    id: definition.id,
    version: definition.version,
    hash,
    displayName: definition.displayName,
    description: definition.description,
    disclaimer: definition.disclaimer,
    minimumFaan: definition.winRules.minimumFaan,
    capFaan: definition.winRules.capFaan,
    bonusTilesEnabled: definition.tileSet.bonusTilesEnabled,
  }));
