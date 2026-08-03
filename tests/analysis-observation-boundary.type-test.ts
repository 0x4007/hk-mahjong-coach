import type { Analyzer } from "@hk-mahjong/analysis";
// @ts-expect-error Raw physical-tile analysis helpers are intentionally not public.
import { distanceForPhysicalTiles } from "@hk-mahjong/analysis";
import type { GameState } from "@hk-mahjong/core";
import type { PlayerObservation } from "@hk-mahjong/core/public";

declare const analyzer: Analyzer;
declare const state: GameState;
declare const observation: PlayerObservation;

analyzer.analyzeDistance(observation);
analyzer.analyzeDiscards(observation);
analyzer.analyzeLegalActions(observation, "balanced");
// @ts-expect-error Authoritative GameState is not a valid analysis input.
analyzer.analyzeDistance(state);
// @ts-expect-error Authoritative GameState is not a valid analysis input.
analyzer.analyzeDiscards(state);
// @ts-expect-error Authoritative GameState is not a valid analysis input.
analyzer.analyzeLegalActions(state, "balanced");
void distanceForPhysicalTiles;
