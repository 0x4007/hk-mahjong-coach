import {
  canonicalJsonHash,
  getTileDefinition,
  type PlayerObservation,
  type StandardTileTypeId,
} from "@hk-mahjong/core/public";
import type { ResolvedRuleset } from "@hk-mahjong/hk-rules";
import { assertObservationRuleset, compareCodePoints, configuredFaan } from "./ruleset.js";
import { visibleStandardTileCounts } from "./visibility.js";
import type { AnalysisFact } from "./types.js";

const clamp = (value: number): number => Math.max(0, Math.min(1, value));

const fact = (
  kind: AnalysisFact["kind"],
  summary: string,
  data: Readonly<Record<string, unknown>>,
): AnalysisFact => ({
  id: `fact:${canonicalJsonHash({ kind, data })}`,
  kind,
  summary,
  data,
});

export interface RelativeRiskAnalysis {
  risk: number;
  facts: readonly AnalysisFact[];
}

type ObservedPlayer = PlayerObservation["players"][number];

const publicEstablishedFaan = (
  observation: PlayerObservation,
  opponent: ObservedPlayer,
  ruleset: ResolvedRuleset,
): number => {
  let faan = 0;
  for (const meld of opponent.melds) {
    if (meld.kind === "chow") {
      continue;
    }
    const typeId = meld.tileTypes[0];
    if (typeId === undefined) {
      continue;
    }
    const definition = getTileDefinition(typeId);
    if (definition.category === "dragon") {
      faan += configuredFaan(ruleset, "dragon_pung");
    } else if (definition.category === "wind") {
      const wind = typeId.slice("wind.".length);
      if (wind === opponent.seat) {
        faan += configuredFaan(ruleset, "seat_wind");
      }
      if (wind === observation.round.prevailingWind) {
        faan += configuredFaan(ruleset, "prevailing_wind");
      }
    }
  }
  if (opponent.melds.length !== 4) {
    return faan;
  }
  if (opponent.melds.every(({ kind }) => kind !== "chow")) {
    faan += configuredFaan(ruleset, "all_pungs");
  }
  const definitions = opponent.melds.flatMap(({ tileTypes }) =>
    tileTypes.slice(0, 1).map(getTileDefinition),
  );
  const suits = new Set(
    definitions.filter(({ rank }) => rank !== undefined).map(({ category }) => category),
  );
  const hasHonors = definitions.some(({ honor }) => honor);
  if (suits.size === 1) {
    faan += configuredFaan(ruleset, hasHonors ? "half_flush" : "full_flush");
  }
  return faan;
};

export const analyzeRelativeRisk = (
  observation: PlayerObservation,
  tileTypeId: StandardTileTypeId,
  ruleset: ResolvedRuleset,
): RelativeRiskAnalysis => {
  assertObservationRuleset(observation, ruleset);
  const definition = getTileDefinition(tileTypeId);
  const visibleCopies = visibleStandardTileCounts(observation).get(tileTypeId) ?? 0;
  let risk = (4 - visibleCopies) / 4;
  const reasons: string[] = [`${String(visibleCopies)} of 4 copies are visible.`];
  const opponents = observation.players.filter(
    ({ playerId }) => playerId !== observation.viewer.playerId,
  );
  const honorSupportedCommitmentIds = new Set<string>();
  const committedOpponents = opponents.filter((opponent) => {
    if (definition.rank === undefined) {
      return false;
    }
    const meldDefinitions = opponent.melds.map(({ tileTypes }) => getTileDefinition(tileTypes[0]!));
    const matchingSuitMelds = meldDefinitions.filter(
      ({ category, rank }) => rank !== undefined && category === definition.category,
    ).length;
    const exposedHonorMelds = meldDefinitions.filter(({ honor }) => honor).length;
    if (matchingSuitMelds >= 1 && exposedHonorMelds >= 1) {
      honorSupportedCommitmentIds.add(opponent.playerId);
    }
    return matchingSuitMelds >= 2 || (matchingSuitMelds >= 1 && exposedHonorMelds >= 1);
  });
  const minimumEstablishedOpponents = opponents.filter(
    (opponent) =>
      publicEstablishedFaan(observation, opponent, ruleset) >= observation.ruleset.minimumFaan,
  );
  if (committedOpponents.length > 0) {
    const middle = definition.rank !== undefined && definition.rank >= 3 && definition.rank <= 7;
    risk += middle ? 0.25 : 0.15;
    reasons.push(
      `${String(committedOpponents.length)} opponent${committedOpponents.length === 1 ? "" : "s"} show a public commitment toward this suit.`,
    );
  }
  const establishedAndCommitted = committedOpponents.filter((opponent) =>
    minimumEstablishedOpponents.some(({ playerId }) => playerId === opponent.playerId),
  );
  if (establishedAndCommitted.length > 0) {
    risk += 0.1;
    reasons.push(
      `${String(establishedAndCommitted.length)} visibly committed opponent${establishedAndCommitted.length === 1 ? " has" : "s have"} already established the minimum faan in public melds.`,
    );
  }

  const publiclyDiscarded = opponents.flatMap(({ discards }) => discards);
  const sameTypeDiscardCount = publiclyDiscarded.filter(
    ({ tileType }) => tileType === tileTypeId,
  ).length;
  if (sameTypeDiscardCount > 0) {
    risk -= Math.min(0.15, sameTypeDiscardCount * 0.05);
    reasons.push(
      "Prior discards lower relative concern, but they do not make this tile guaranteed safe.",
    );
  }

  const recentDiscardPatternOpponents = committedOpponents.filter((opponent) => {
    const recentDiscards = opponent.discards.slice(-3);
    if (recentDiscards.length < 2 || definition.rank === undefined) {
      return false;
    }
    const outsideDirectionCount = recentDiscards.filter(({ tileType }) => {
      const discarded = getTileDefinition(tileType);
      return discarded.rank === undefined || discarded.category !== definition.category;
    }).length;
    return outsideDirectionCount >= 2;
  });
  if (recentDiscardPatternOpponents.length > 0) {
    risk += 0.1;
    reasons.push(
      `${String(recentDiscardPatternOpponents.length)} committed opponent${recentDiscardPatternOpponents.length === 1 ? " has" : "s have"} recently shed tiles outside this public suit direction.`,
    );
  }

  if (definition.honor && sameTypeDiscardCount === 0 && observation.round.liveWallCount <= 24) {
    risk += 0.2;
    reasons.push("This is a fresh honor late in the hand.");
  }
  if (
    definition.rank !== undefined &&
    definition.rank >= 3 &&
    definition.rank <= 7 &&
    sameTypeDiscardCount === 0 &&
    observation.round.liveWallCount <= 20
  ) {
    risk += 0.1;
    reasons.push("Fresh middle tiles become relatively more dangerous late.");
  }

  const normalized = clamp(risk);
  return {
    risk: normalized,
    facts: [
      fact(
        "relative_risk",
        `This discard has relative risk ${normalized.toFixed(2)}; it is not labeled guaranteed safe.`,
        {
          tileTypeId,
          visibleCopies,
          liveWallCount: observation.round.liveWallCount,
          committedOpponentIds: committedOpponents
            .map(({ playerId }) => playerId)
            .sort(compareCodePoints),
          honorSupportedCommitmentIds: [...honorSupportedCommitmentIds].sort(compareCodePoints),
          recentDiscardPatternOpponentIds: recentDiscardPatternOpponents
            .map(({ playerId }) => playerId)
            .sort(compareCodePoints),
          minimumEstablishedOpponentIds: minimumEstablishedOpponents
            .map(({ playerId }) => playerId)
            .sort(compareCodePoints),
          priorOpponentDiscardCount: sameTypeDiscardCount,
          reasons,
        },
      ),
    ],
  };
};

export const createAnalysisFact = fact;
