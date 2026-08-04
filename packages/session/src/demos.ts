import type { DemoDescriptor } from "@hk-mahjong/protocol";

/**
 * Deterministic entry points used by the browser and CLI. The engine still owns every draw,
 * legal action, and scoring decision; a demo is only a named seed plus a teaching focus.
 */
export const SEEDED_DEMOS: readonly DemoDescriptor[] = Object.freeze([
  {
    id: "demo_tile_basics",
    title: "Tile basics",
    description: "A relaxed first hand for learning suits, honors, and the table rhythm.",
    rulesetId: "training_relaxed_v1",
    mode: "learn",
    seed: "demo_tile_basics",
    focus: ["tile_recognition", "turn_rhythm"],
  },
  {
    id: "demo_claim_priority",
    title: "Claim priority",
    description: "Watch the claim window and compare legal pung, chow, and pass choices.",
    rulesetId: "training_relaxed_v1",
    mode: "guided",
    seed: "demo_claim_priority",
    focus: ["turn_order_claim_priority", "call_discipline"],
  },
  {
    id: "demo_three_faan",
    title: "Reach three faan",
    description: "Plan a value direction before the minimum-faan check closes the hand.",
    rulesetId: "hk_nyc_social_v1",
    mode: "guided",
    seed: "demo_three_faan",
    focus: ["minimum_faan_planning", "dragon_value"],
  },
  {
    id: "demo_half_flush",
    title: "Half-flush direction",
    description: "Balance speed against committing to one suit and a matching honor group.",
    rulesetId: "hk_nyc_social_v1",
    mode: "socratic",
    seed: "demo_half_flush",
    focus: ["hand_direction", "minimum_faan_planning"],
  },
  {
    id: "demo_kong",
    title: "Kong sequence",
    description:
      "Practice concealed, exposed, and added-kong opportunities with replacement draws.",
    rulesetId: "training_relaxed_v1",
    mode: "sandbox",
    seed: "demo_kong",
    focus: ["kong_timing", "turn_rhythm"],
  },
  {
    id: "demo_robbing_kong",
    title: "Robbing a kong",
    description: "A post-hand review focus for the added-kong robbery window.",
    rulesetId: "hk_nyc_social_v1",
    mode: "sandbox",
    seed: "demo_robbing_kong",
    focus: ["kong_robbery", "claim_priority"],
  },
  {
    id: "demo_under_minimum",
    title: "Under the minimum",
    description: "See why a complete shape can still be an illegal three-faan-profile win.",
    rulesetId: "hk_nyc_social_v1",
    mode: "guided",
    seed: "demo_under_minimum",
    focus: ["minimum_faan_planning", "win_legality"],
  },
  {
    id: "demo_last_tile",
    title: "Last tile",
    description: "Trace the final live draw and the scoring provenance it creates.",
    rulesetId: "hk_nyc_social_v1",
    mode: "guided",
    seed: "demo_last_tile",
    focus: ["last_tile", "scoring_provenance"],
  },
  {
    id: "demo_replay_branch",
    title: "Replay branch",
    description: "Finish a seeded hand, revisit a decision, and compare another legal line.",
    rulesetId: "training_relaxed_v1",
    mode: "sandbox",
    seed: "demo_replay_branch",
    focus: ["replay_review", "counterfactuals"],
  },
  {
    id: "demo_scoring_limit",
    title: "Limit scoring",
    description: "Inspect a limit-hand breakdown and see lower patterns suppressed by the cap.",
    rulesetId: "hk_modern_13f_v1",
    mode: "guided",
    seed: "demo_scoring_limit",
    focus: ["faan_counting", "limit_aggregation"],
  },
]);

export const listSeededDemos = (): readonly DemoDescriptor[] => SEEDED_DEMOS;
