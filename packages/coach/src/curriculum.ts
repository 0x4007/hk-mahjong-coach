import {
  CURRICULUM_VERSION,
  type ConceptId,
  type ConceptMastery,
  type CurriculumStage,
} from "./types.js";

export const CURRICULUM_STAGES: readonly CurriculumStage[] = [
  {
    stage: 0,
    id: "tile_literacy",
    name: "Tile literacy",
    outcomes: ["Name suits, winds, dragons, and common tile faces."],
    suggestedUnlock: "85% tile-recognition accuracy over 40 independent prompts.",
    conceptIds: ["tile_recognition", "tile_categories"],
  },
  {
    stage: 1,
    id: "turn_flow",
    name: "Turn flow",
    outcomes: ["Draw, replace flowers, discard, and follow turn order."],
    suggestedUnlock: "Complete two guided hands with no flow errors.",
    conceptIds: ["turn_order_claim_priority", "social_table_procedure"],
  },
  {
    stage: 2,
    id: "melds_winning_shape",
    name: "Melds and winning shape",
    outcomes: ["Recognize chow, pung, kong, pair, and four-meld-plus-pair shape."],
    suggestedUnlock: "80% over 20 drills.",
    conceptIds: ["meld_recognition", "winning_shape"],
  },
  {
    stage: 3,
    id: "legal_calls",
    name: "Legal calls",
    outcomes: ["Know who may chow and claim priorities."],
    suggestedUnlock: "80% over 20 situations.",
    conceptIds: ["turn_order_claim_priority", "call_discipline"],
  },
  {
    stage: 4,
    id: "three_faan_planning",
    name: "Three-faan planning",
    outcomes: ["Identify realistic ways to reach the active minimum."],
    suggestedUnlock: "75% over 20 scored hands.",
    conceptIds: ["minimum_faan_planning", "dragon_wind_value", "scoring_payments"],
  },
  {
    stage: 5,
    id: "tile_efficiency",
    name: "Tile efficiency",
    outcomes: ["Compare discards by distance and improving tiles."],
    suggestedUnlock: "Positive decision-quality trend over 30 decisions.",
    conceptIds: ["tile_efficiency", "waits_improving_tiles", "visible_tile_counting"],
  },
  {
    stage: 6,
    id: "call_discipline",
    name: "Call discipline",
    outcomes: ["Open only when speed or value gain justifies lost flexibility."],
    suggestedUnlock: "75% over 20 call/no-call drills.",
    conceptIds: ["call_discipline", "speed_vs_value", "kong_judgment"],
  },
  {
    stage: 7,
    id: "table_reading",
    name: "Table reading",
    outcomes: ["Use visible tiles and exposed melds; understand relative safety."],
    suggestedUnlock: "70% over 20 late-hand drills.",
    conceptIds: ["visible_tile_counting", "relative_safety", "endgame_decisions"],
  },
  {
    stage: 8,
    id: "full_social_game",
    name: "Full social game",
    outcomes: ["Play a full standard match with limited help."],
    suggestedUnlock: "Finish one full match and post-game review.",
    conceptIds: ["social_table_procedure", "speed_vs_value", "endgame_decisions"],
  },
] as const;

export const curriculumStageFor = (mastery: readonly ConceptMastery[]): CurriculumStage => {
  const byConcept = new Map(mastery.map((record) => [record.conceptId, record] as const));
  for (const stage of CURRICULUM_STAGES) {
    const complete = stage.conceptIds.every(
      (conceptId) => (byConcept.get(conceptId)?.mastery ?? 0) >= 0.75,
    );
    if (!complete) {
      return stage;
    }
  }
  const finalStage = CURRICULUM_STAGES.at(-1);
  if (finalStage === undefined) {
    throw new Error("Curriculum has no initial stage");
  }
  return finalStage;
};

export const nextCurriculumConcept = (
  mastery: readonly ConceptMastery[],
  preferred: readonly ConceptId[] = [],
): ConceptId | null => {
  const byConcept = new Map(mastery.map((record) => [record.conceptId, record] as const));
  const ranked = [...preferred, ...CURRICULUM_STAGES.flatMap((stage) => stage.conceptIds)].filter(
    (conceptId, index, all) => all.indexOf(conceptId) === index,
  );
  const next = ranked
    .map((conceptId, priority) => ({
      conceptId,
      mastery: byConcept.get(conceptId)?.mastery ?? 0,
      priority,
    }))
    .sort((left, right) => left.mastery - right.mastery || left.priority - right.priority)[0];
  return next?.conceptId ?? null;
};

export { CURRICULUM_VERSION };
