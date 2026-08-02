import { readFile, writeFile } from "node:fs/promises";
import { rulesetDefinitionSchema } from "../packages/hk-rules/src/ruleset.js";
import { format } from "prettier";

interface RuleValue {
  type: "faan" | "limit";
  amount?: number;
}

interface MaterializedRule {
  id: string;
  value: RuleValue;
}

interface MaterializedRuleset {
  id: string;
  version: string;
  displayName: string;
  description: string;
  disclaimer: string;
  standardComparisonRulesetId: string | null;
  winRules: {
    minimumFaan: number;
    capFaan: number;
  };
  scoringRules: MaterializedRule[];
  [key: string]: unknown;
}

const sourceUrl = new URL("../rulesets/hk_nyc_social_v1.json", import.meta.url);
const source = JSON.parse(await readFile(sourceUrl, "utf8")) as MaterializedRuleset;
const formatJson = async (value: unknown): Promise<string> =>
  format(JSON.stringify(value), { parser: "json", printWidth: 100 });

const clone = (): MaterializedRuleset => structuredClone(source);

const setRuleValue = (ruleset: MaterializedRuleset, id: string, value: RuleValue): void => {
  const rule = ruleset.scoringRules.find((candidate) => candidate.id === id);
  if (rule === undefined) {
    throw new Error(`Cannot materialize unknown scoring rule ${id}`);
  }
  rule.value = value;
};

const modern = clone();
modern.id = "hk_modern_13f_v1";
modern.version = "1.0.0";
modern.displayName = "Hong Kong Modern 13-Faan Teaching Profile v1";
modern.description =
  "A fully materialized alternate profile that demonstrates common higher-value and 13-faan variations.";
modern.disclaimer =
  "This alternate teaching profile demonstrates table variation; it is not more official than the default profile.";
modern.standardComparisonRulesetId = null;
modern.winRules.minimumFaan = 3;
modern.winRules.capFaan = 13;
setRuleValue(modern, "full_flush", { type: "faan", amount: 7 });
setRuleValue(modern, "little_three_dragons", { type: "faan", amount: 5 });
setRuleValue(modern, "big_three_dragons", { type: "faan", amount: 8 });
setRuleValue(modern, "little_four_winds", { type: "faan", amount: 8 });
setRuleValue(modern, "big_four_winds", { type: "faan", amount: 10 });
setRuleValue(modern, "all_honors", { type: "faan", amount: 10 });
setRuleValue(modern, "four_concealed_pungs", { type: "faan", amount: 10 });
setRuleValue(modern, "all_terminals", { type: "faan", amount: 10 });
setRuleValue(modern, "nine_gates", { type: "faan", amount: 10 });
setRuleValue(modern, "jade_dragon", { type: "faan", amount: 10 });
setRuleValue(modern, "ruby_dragon", { type: "faan", amount: 10 });
setRuleValue(modern, "pearl_dragon", { type: "faan", amount: 10 });
setRuleValue(modern, "thirteen_orphans", { type: "limit" });
setRuleValue(modern, "all_kongs", { type: "limit" });
setRuleValue(modern, "heavenly_hand", { type: "limit" });
setRuleValue(modern, "earthly_hand", { type: "limit" });

const training = clone();
training.id = "training_relaxed_v1";
training.version = "1.0.0";
training.displayName = "Training Relaxed — Game Flow Profile v1";
training.description =
  "The default teaching evaluators with no minimum, used while a beginner learns turn flow.";
training.disclaimer =
  "This training profile permits low-value complete hands and always compares them with the standard three-faan profile.";
training.standardComparisonRulesetId = "hk_nyc_social_v1";
training.winRules.minimumFaan = 0;
training.winRules.capFaan = 10;

const writeRuleset = async (filename: string, ruleset: MaterializedRuleset): Promise<void> => {
  const target = new URL(`../rulesets/${filename}`, import.meta.url);
  await writeFile(target, await formatJson(ruleset), "utf8");
};

const jsonSchema = {
  $id: "https://local.hk-mahjong-coach.invalid/ruleset.schema.json",
  title: "Hong Kong Mahjong Coach Ruleset",
  ...rulesetDefinitionSchema.toJSONSchema({ target: "draft-2020-12" }),
};

await Promise.all([
  writeRuleset("hk_modern_13f_v1.json", modern),
  writeRuleset("training_relaxed_v1.json", training),
  writeFile(
    new URL("../rulesets/ruleset.schema.json", import.meta.url),
    await formatJson(jsonSchema),
    "utf8",
  ),
]);
