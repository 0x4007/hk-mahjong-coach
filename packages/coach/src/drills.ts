import { getTileDefinition, type TileTypeId } from "@hk-mahjong/core/public";

import {
  DRILL_LIBRARY_VERSION,
  DRILL_TYPES,
  type ConceptId,
  type DrillItem,
  type DrillSource,
  type DrillType,
} from "./types.js";

const bundledDefinitions: Readonly<Record<DrillType, Omit<DrillItem, "id" | "source">>> = {
  name_tile: {
    type: "name_tile",
    conceptIds: ["tile_recognition"],
    difficulty: 0.1,
    prompt: "Name this tile.",
    choices: ["East", "Red Dragon", "One Character"],
    answer: "East",
  },
  find_tile: {
    type: "find_tile",
    conceptIds: ["tile_recognition"],
    difficulty: 0.12,
    prompt: "Find the tile named Red Dragon.",
    choices: ["Red Dragon", "Green Dragon", "White Dragon"],
    answer: "Red Dragon",
  },
  sort_hand: {
    type: "sort_hand",
    conceptIds: ["tile_categories"],
    difficulty: 0.2,
    prompt: "Put these tiles in suit and rank order.",
    choices: ["1m 2m 3m 1p", "3m 1p 2m 1m"],
    answer: "1m 2m 3m 1p",
  },
  complete_chow: {
    type: "complete_chow",
    conceptIds: ["meld_recognition"],
    difficulty: 0.2,
    prompt: "Which tile completes 1 Bamboo and 2 Bamboo as a chow?",
    choices: ["3 Bamboo", "4 Bamboo", "White Dragon"],
    answer: "3 Bamboo",
  },
  identify_meld: {
    type: "identify_meld",
    conceptIds: ["meld_recognition"],
    difficulty: 0.22,
    prompt: "What kind of group is 7 Dots, 7 Dots, 7 Dots?",
    choices: ["Chow", "Pung", "Pair"],
    answer: "Pung",
  },
  find_winning_tile: {
    type: "find_winning_tile",
    conceptIds: ["winning_shape", "waits_improving_tiles"],
    difficulty: 0.45,
    prompt: "Which tile completes the pair wait 6 Characters, 6 Characters?",
    choices: ["6 Characters", "5 Characters", "7 Characters"],
    answer: "6 Characters",
  },
  count_visible_copies: {
    type: "count_visible_copies",
    conceptIds: ["visible_tile_counting"],
    difficulty: 0.42,
    prompt: "Three Green Dragons are visible. How many remain unseen at most?",
    choices: ["1", "2", "3"],
    answer: "1",
  },
  count_faan: {
    type: "count_faan",
    conceptIds: ["minimum_faan_planning", "scoring_payments"],
    difficulty: 0.58,
    prompt: "A dragon pung is worth how many faan in the teaching profile?",
    choices: ["1", "2", "3"],
    answer: "1",
  },
  can_hand_win: {
    type: "can_hand_win",
    conceptIds: ["winning_shape", "minimum_faan_planning"],
    difficulty: 0.55,
    prompt: "A complete one-faan hand under the 3-faan profile can be declared as a win.",
    choices: ["Yes", "No"],
    answer: "No",
  },
  choose_discard: {
    type: "choose_discard",
    conceptIds: ["tile_efficiency", "speed_vs_value"],
    difficulty: 0.65,
    prompt: "Choose the discard supported by the deterministic candidate comparison.",
    choices: ["Keep the wider improving set", "Break a useful pair"],
    answer: "Keep the wider improving set",
  },
  call_or_pass: {
    type: "call_or_pass",
    conceptIds: ["call_discipline", "turn_order_claim_priority"],
    difficulty: 0.6,
    prompt: "May a player two seats away chow the latest discard?",
    choices: ["Yes", "No"],
    answer: "No",
  },
  compare_relative_safety: {
    type: "compare_relative_safety",
    conceptIds: ["relative_safety", "endgame_decisions"],
    difficulty: 0.7,
    prompt: "Which statement is accurate about a previously discarded tile?",
    choices: ["Guaranteed safe", "Relatively safer, not guaranteed"],
    answer: "Relatively safer, not guaranteed",
  },
  replay_quiz: {
    type: "replay_quiz",
    conceptIds: ["tile_efficiency"],
    difficulty: 0.72,
    prompt: "Revisit a prior decision and choose the ranked alternative.",
    choices: ["Top-ranked action", "Lowest-ranked action"],
    answer: "Top-ranked action",
  },
  social_table_procedure: {
    type: "social_table_procedure",
    conceptIds: ["social_table_procedure"],
    difficulty: 0.3,
    prompt: "What should happen when you draw a flower?",
    choices: ["Keep it concealed", "Expose it and draw a replacement"],
    answer: "Expose it and draw a replacement",
  },
};

/** All fourteen required exercise families, bundled and usable without a network connection. */
export const createBundledDrillLibrary = (): readonly DrillItem[] =>
  DRILL_TYPES.map((type): DrillItem => {
    const definition = bundledDefinitions[type];
    return {
      id: `bundled:${DRILL_LIBRARY_VERSION}:${type}`,
      source: "bundled",
      ...definition,
    };
  });

export const createTileRecognitionDrill = (
  tile: TileTypeId,
  source: DrillSource = "generated",
): DrillItem => {
  const definition = getTileDefinition(tile);
  return {
    id: `${source}:${DRILL_LIBRARY_VERSION}:tile:${definition.id}`,
    source,
    type: "name_tile",
    conceptIds: ["tile_recognition"],
    difficulty: 0.15,
    prompt: "Name this tile.",
    choices: [definition.names.en],
    answer: definition.names.en,
    tile: definition.id,
  };
};

export const drillTypesForConcept = (conceptId: ConceptId): readonly DrillType[] =>
  createBundledDrillLibrary()
    .filter((drill) => drill.conceptIds.includes(conceptId))
    .map((drill) => drill.type);

export { DRILL_LIBRARY_VERSION };
