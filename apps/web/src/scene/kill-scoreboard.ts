/** The two player-like actors shown in the local match scoreboard. */
export type KillScoreActor = "player" | "simulant";

/** Immutable kill totals for the current scene match. */
export interface KillScoreSnapshot {
  readonly playerKills: number;
  readonly simulantKills: number;
  readonly lastKiller: KillScoreActor | null;
}

export const createKillScoreSnapshot = (): KillScoreSnapshot => ({
  playerKills: 0,
  simulantKills: 0,
  lastKiller: null,
});

/** Record one authoritative player-like kill without mutating the previous snapshot. */
export const recordKill = (
  snapshot: KillScoreSnapshot,
  killer: KillScoreActor,
): KillScoreSnapshot => {
  if (killer === "player") {
    return {
      ...snapshot,
      playerKills: snapshot.playerKills + 1,
      lastKiller: killer,
    };
  }
  return {
    ...snapshot,
    simulantKills: snapshot.simulantKills + 1,
    lastKiller: killer,
  };
};
