import type { BotPolicy } from "@hk-mahjong/bots";
import type { GameState } from "@hk-mahjong/core";
import type { PlayerObservation } from "@hk-mahjong/core/public";

declare const policy: BotPolicy;
declare const state: GameState;
declare const observation: PlayerObservation;

policy.decide(observation);
// @ts-expect-error Authoritative GameState is not a valid bot decision input.
policy.decide(state);
