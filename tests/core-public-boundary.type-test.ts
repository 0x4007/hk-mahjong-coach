import type * as PublicCore from "@hk-mahjong/core/public";

export type PublicObservation = PublicCore.PlayerObservation;
export type PublicWinningForm = PublicCore.WinningForm;
export type PublicStandardTile = PublicCore.StandardTileTypeId;
export type PublicPhysicalTile = PublicCore.TileInstanceId;
export type PublicTile = PublicCore.TileTypeId;

// @ts-expect-error Authoritative state must not be exported to live-information consumers.
export type ForbiddenGameState = PublicCore.GameState;
// @ts-expect-error Engine authority must not be exported to live-information consumers.
export type ForbiddenGameEngine = PublicCore.GameEngine;
// @ts-expect-error Omniscient replay must not be exported to live-information consumers.
export type ForbiddenReplay = PublicCore.OmniscientReplayView;
// @ts-expect-error Engine construction must not be exported to live-information consumers.
export type ForbiddenCreateEngine = typeof PublicCore.createGameEngine;
// @ts-expect-error Observation construction must stay on the authoritative core surface.
export type ForbiddenCreateObservation = typeof PublicCore.createPlayerObservation;
// @ts-expect-error Reducers must stay on the authoritative core surface.
export type ForbiddenReducer = typeof PublicCore.reduceGameEvent;
// @ts-expect-error Event replay must stay on the authoritative core surface.
export type ForbiddenReplayEvents = typeof PublicCore.replayEvents;
