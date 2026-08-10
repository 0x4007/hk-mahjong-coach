import {
  getTileDefinition,
  tileTypeFromInstanceId,
  type PlayerObservation,
  type StandardTileTypeId,
  type TileTypeId,
} from "@hk-mahjong/core/public";
import type { ResolvedRuleset } from "@hk-mahjong/hk-rules";
import { STANDARD_TILE_TYPES } from "./distance.js";
import { assertObservationRuleset, compareCodePoints, configuredFaan } from "./ruleset.js";
import type { DistanceToReady, FaanPath, FaanPathStatus } from "./types.js";

const statusForSpecialDistance = (distance: number | null): FaanPathStatus =>
  distance === null
    ? "impossible"
    : distance === 0
      ? "likely"
      : distance <= 2
        ? "speculative"
        : "impossible";

const dominantSuit = (tileTypes: readonly TileTypeId[]): { suit: string | null; count: number } => {
  const counts = new Map<string, number>();
  for (const typeId of tileTypes) {
    const definition = getTileDefinition(typeId);
    if (definition.rank !== undefined) {
      counts.set(definition.category, (counts.get(definition.category) ?? 0) + 1);
    }
  }
  const dominant = [...counts.entries()].sort(
    ([leftSuit, leftCount], [rightSuit, rightCount]) =>
      rightCount - leftCount || compareCodePoints(leftSuit, rightSuit),
  )[0];
  return dominant === undefined
    ? { suit: null, count: 0 }
    : { suit: dominant[0], count: dominant[1] };
};

const standardCounts = (
  tileTypes: readonly TileTypeId[],
): ReadonlyMap<StandardTileTypeId, number> => {
  const counts = new Map<StandardTileTypeId, number>();
  for (const typeId of tileTypes) {
    const definition = getTileDefinition(typeId);
    if (definition.bonus) {
      throw new TypeError("Faan paths cannot include bonus tiles in the concealed hand");
    }
    const standardType = typeId as StandardTileTypeId;
    const next = (counts.get(standardType) ?? 0) + 1;
    if (next > 4) {
      throw new RangeError(`Faan paths cannot include five copies of ${standardType}`);
    }
    counts.set(standardType, next);
  }
  return counts;
};

const adjust = (
  counts: Map<StandardTileTypeId, number>,
  typeId: StandardTileTypeId,
  amount: number,
): void => {
  const next = (counts.get(typeId) ?? 0) + amount;
  if (next < 0) {
    throw new Error(`Faan-path count underflow for ${typeId}`);
  }
  if (next === 0) {
    counts.delete(typeId);
  } else {
    counts.set(typeId, next);
  }
};

const firstCountedType = (
  counts: ReadonlyMap<StandardTileTypeId, number>,
): StandardTileTypeId | null =>
  STANDARD_TILE_TYPES.find((typeId) => (counts.get(typeId) ?? 0) > 0) ?? null;

const removeSequences = (
  counts: Map<StandardTileTypeId, number>,
  sequencesNeeded: number,
): boolean => {
  if (sequencesNeeded === 0) {
    return counts.size === 0;
  }
  const typeId = firstCountedType(counts);
  if (typeId === null) {
    return false;
  }
  const definition = getTileDefinition(typeId);
  if (definition.rank === undefined || definition.rank > 7) {
    return false;
  }
  const second = `${definition.category}.${String(definition.rank + 1)}` as StandardTileTypeId;
  const third = `${definition.category}.${String(definition.rank + 2)}` as StandardTileTypeId;
  if ((counts.get(second) ?? 0) === 0 || (counts.get(third) ?? 0) === 0) {
    return false;
  }
  adjust(counts, typeId, -1);
  adjust(counts, second, -1);
  adjust(counts, third, -1);
  const result = removeSequences(counts, sequencesNeeded - 1);
  adjust(counts, typeId, 1);
  adjust(counts, second, 1);
  adjust(counts, third, 1);
  return result;
};

const isAllChowsComplete = (
  tileTypes: readonly TileTypeId[],
  declaredChowCount: number,
): boolean => {
  const source = standardCounts(tileTypes);
  for (const pairType of STANDARD_TILE_TYPES) {
    const definition = getTileDefinition(pairType);
    if (definition.rank === undefined || (source.get(pairType) ?? 0) < 2) {
      continue;
    }
    const counts = new Map(source);
    adjust(counts, pairType, -2);
    if (removeSequences(counts, 4 - declaredChowCount)) {
      return true;
    }
  }
  return false;
};

const isAllPungsComplete = (
  tileTypes: readonly TileTypeId[],
  declaredPungCount: number,
): boolean => {
  const source = standardCounts(tileTypes);
  for (const pairType of STANDARD_TILE_TYPES) {
    if ((source.get(pairType) ?? 0) < 2) {
      continue;
    }
    const counts = new Map(source);
    adjust(counts, pairType, -2);
    const triplets = [...counts.values()].reduce((total, count) => total + count / 3, 0);
    if (triplets === 4 - declaredPungCount && [...counts.values()].every((count) => count === 3)) {
      return true;
    }
  }
  return false;
};

const completionAvailable = (
  tileTypes: readonly TileTypeId[],
  declaredMeldCount: number,
  predicate: (completeTiles: readonly TileTypeId[], declaredCount: number) => boolean,
): boolean => {
  const afterDiscardCount = 13 - declaredMeldCount * 3;
  const beforeDiscardCount = afterDiscardCount + 1;
  if (tileTypes.length === beforeDiscardCount) {
    return predicate(tileTypes, declaredMeldCount);
  }
  if (tileTypes.length !== afterDiscardCount) {
    return false;
  }
  const counts = standardCounts(tileTypes);
  return STANDARD_TILE_TYPES.some(
    (typeId) =>
      (counts.get(typeId) ?? 0) < 4 && predicate([...tileTypes, typeId], declaredMeldCount),
  );
};

const isNineGatesReady = (tileTypes: readonly TileTypeId[]): boolean => {
  if (tileTypes.length !== 13) {
    return false;
  }
  const definitions = tileTypes.map(getTileDefinition);
  const suit = definitions[0]?.category;
  if (
    suit === undefined ||
    !["characters", "dots", "bamboo"].includes(suit) ||
    definitions.some(({ category, rank }) => category !== suit || rank === undefined)
  ) {
    return false;
  }
  const rankCounts = Array.from({ length: 9 }, () => 0);
  for (const { rank } of definitions) {
    rankCounts[rank! - 1] = rankCounts[rank! - 1]! + 1;
  }
  return rankCounts.every((count, index) => count === (index === 0 || index === 8 ? 3 : 1));
};

const valueTileFaan = (
  typeId: TileTypeId,
  observation: PlayerObservation,
  ruleset: ResolvedRuleset,
  ownerSeat: PlayerObservation["viewer"]["seat"],
): number => {
  const definition = getTileDefinition(typeId);
  if (definition.category === "dragon") {
    return configuredFaan(ruleset, "dragon_pung");
  }
  if (definition.category !== "wind") {
    return 0;
  }
  const wind = typeId.slice("wind.".length);
  return (
    (wind === ownerSeat ? configuredFaan(ruleset, "seat_wind") : 0) +
    (wind === observation.round.prevailingWind ? configuredFaan(ruleset, "prevailing_wind") : 0)
  );
};

const securedBonusFaan = (
  observation: PlayerObservation,
  ruleset: ResolvedRuleset,
  bonusTypes: readonly TileTypeId[],
): number => {
  const bonusSet = new Set(bonusTypes);
  const flowers = bonusTypes
    .filter(({ length }) => length > 0)
    .filter((typeId) => getTileDefinition(typeId).category === "flower");
  const seasons = bonusTypes.filter((typeId) => getTileDefinition(typeId).category === "season");
  const seatMapping = ruleset.definition.bonusRules.seatMapping.find(
    ({ seat }) => seat === observation.viewer.seat,
  );
  if (seatMapping === undefined) {
    throw new Error(`Ruleset omits bonus mapping for ${observation.viewer.seat}`);
  }
  return (
    (flowers.length === 4
      ? configuredFaan(ruleset, "all_flowers")
      : bonusSet.has(seatMapping.flower)
        ? configuredFaan(ruleset, "seat_flower")
        : 0) +
    (seasons.length === 4
      ? configuredFaan(ruleset, "all_seasons")
      : bonusSet.has(seatMapping.season)
        ? configuredFaan(ruleset, "seat_season")
        : 0)
  );
};

export const estimateFaanPaths = (
  observation: PlayerObservation,
  concealedTileTypes: readonly TileTypeId[],
  distance: DistanceToReady,
  ruleset: ResolvedRuleset,
): readonly FaanPath[] => {
  assertObservationRuleset(observation, ruleset);
  const viewer = observation.players.find(
    ({ playerId }) => playerId === observation.viewer.playerId,
  );
  if (viewer === undefined) {
    throw new Error("Observation omits its viewer from the public player list");
  }
  const meldKinds = viewer.melds.map(({ kind }) => kind);
  const allKnownTypes = [
    ...concealedTileTypes,
    ...viewer.melds.flatMap(({ tileTypes }) => tileTypes),
  ];
  const suitedTypes = allKnownTypes.filter(
    (typeId) => getTileDefinition(typeId).rank !== undefined,
  );
  const concealedHonors = concealedTileTypes.filter(
    (typeId) => getTileDefinition(typeId).honor,
  ).length;
  const { suit: dominantSuitId, count: dominantCount } = dominantSuit(allKnownTypes);
  const declaredSuits = new Set(
    viewer.melds
      .flatMap(({ tileTypes }) => tileTypes)
      .map(getTileDefinition)
      .filter(({ rank }) => rank !== undefined)
      .map(({ category }) => category),
  );
  const declaredHonorMeld = viewer.melds.some(({ tileTypes }) =>
    tileTypes.some((typeId) => getTileDefinition(typeId).honor),
  );
  const concealedCounts = standardCounts(concealedTileTypes);
  const pairOrTripletCount = [...concealedCounts.values()].filter((count) => count >= 2).length;

  const allChowsReady =
    meldKinds.every((kind) => kind === "chow") &&
    completionAvailable(concealedTileTypes, viewer.melds.length, isAllChowsComplete);
  const allChowsStatus: FaanPathStatus = meldKinds.some((kind) => kind !== "chow")
    ? "impossible"
    : allChowsReady
      ? "likely"
      : suitedTypes.length < 7 || concealedHonors > 4
        ? "impossible"
        : "speculative";

  const allPungsReady =
    !meldKinds.includes("chow") &&
    completionAvailable(concealedTileTypes, viewer.melds.length, isAllPungsComplete);
  const allPungsStatus: FaanPathStatus = meldKinds.includes("chow")
    ? "impossible"
    : allPungsReady || pairOrTripletCount + viewer.melds.length >= 4
      ? "likely"
      : "speculative";

  const flushMeldConflict = declaredSuits.size > 1;
  const suitShare = allKnownTypes.length === 0 ? 0 : dominantCount / allKnownTypes.length;
  const halfFlushStatus: FaanPathStatus = flushMeldConflict
    ? "impossible"
    : dominantSuitId !== null && suitShare >= 0.65 && concealedHonors > 0
      ? "likely"
      : "speculative";
  const fullFlushStatus: FaanPathStatus =
    flushMeldConflict || declaredHonorMeld
      ? "impossible"
      : dominantSuitId !== null && suitShare >= 0.75 && concealedHonors <= 2
        ? "likely"
        : "speculative";

  const securedValueFaan = viewer.melds.reduce((total, meld) => {
    const firstType = meld.tileTypes[0];
    return firstType === undefined
      ? total
      : total + valueTileFaan(firstType, observation, ruleset, viewer.seat);
  }, 0);
  const potentialValueFaan = Math.max(
    0,
    ...[...concealedCounts.entries()]
      .filter(([, count]) => count >= 2)
      .map(([typeId]) => valueTileFaan(typeId, observation, ruleset, viewer.seat)),
  );
  const valueStatus: FaanPathStatus =
    securedValueFaan > 0 ? "secured" : potentialValueFaan > 0 ? "likely" : "speculative";

  const bonusFaan = securedBonusFaan(observation, ruleset, viewer.bonusTiles);
  const noBonusFaan =
    viewer.bonusTiles.length === 0 ? configuredFaan(ruleset, "no_bonus_tiles") : 0;
  const bonusStatus: FaanPathStatus =
    bonusFaan > 0 ? "secured" : noBonusFaan > 0 ? "likely" : "impossible";

  const nineGatesEnabled = configuredFaan(ruleset, "nine_gates") > 0;
  const nineGatesReady =
    nineGatesEnabled && viewer.melds.length === 0 && isNineGatesReady(concealedTileTypes);
  const nineGatesPlausible =
    viewer.melds.length === 0 &&
    dominantSuitId !== null &&
    dominantCount >= 10 &&
    concealedHonors === 0;
  const nineGatesStatus: FaanPathStatus =
    !nineGatesEnabled || viewer.melds.length > 0
      ? "impossible"
      : nineGatesReady
        ? "likely"
        : nineGatesPlausible
          ? "speculative"
          : "impossible";

  return [
    {
      id: "fast_mixed",
      label: "Fast mixed hand",
      status: distance.minimum <= 1 ? "likely" : "speculative",
      estimatedFaan: 0,
      reason: `The hand is ${String(distance.minimum)} tile${distance.minimum === 1 ? "" : "s"} from ready without requiring a narrow suit commitment.`,
    },
    {
      id: "all_chows",
      label: "All Chows",
      status: allChowsStatus,
      estimatedFaan: configuredFaan(ruleset, "all_chows"),
      reason:
        allChowsStatus === "impossible"
          ? "The current public commitments or honor-heavy shape do not support an All Chows path."
          : allChowsReady
            ? "A visible-information completion exists using only chows and a suited pair."
            : "The hand retains enough suited sequence structure to keep All Chows available.",
    },
    {
      id: "all_pungs",
      label: "All Pungs",
      status: allPungsStatus,
      estimatedFaan: configuredFaan(ruleset, "all_pungs"),
      reason:
        allPungsStatus === "impossible"
          ? "A declared chow prevents All Pungs."
          : allPungsReady
            ? "A visible-information completion exists using only pungs and a pair."
            : `${String(pairOrTripletCount)} concealed tile types currently have at least two copies.`,
    },
    {
      id: "half_flush",
      label: "Half Flush",
      status: halfFlushStatus,
      estimatedFaan: configuredFaan(ruleset, "half_flush"),
      reason:
        halfFlushStatus === "impossible"
          ? "Declared melds already commit to more than one numbered suit."
          : `The dominant visible suit is ${dominantSuitId ?? "not established"}; concealed off-suit tiles remain changeable.`,
    },
    {
      id: "full_flush",
      label: "Full Flush",
      status: fullFlushStatus,
      estimatedFaan: configuredFaan(ruleset, "full_flush"),
      reason:
        fullFlushStatus === "impossible"
          ? "A public honor meld or incompatible declared suits block Full Flush."
          : `About ${String(Math.round(suitShare * 100))}% of known hand tiles use the dominant suit; concealed honors can still be discarded.`,
    },
    {
      id: "dragon_or_wind",
      label: "Dragon or wind value",
      status: valueStatus,
      estimatedFaan: securedValueFaan > 0 ? securedValueFaan : potentialValueFaan,
      reason:
        securedValueFaan > 0
          ? `Public value melds secure ${String(securedValueFaan)} faan under the active seat and round winds.`
          : potentialValueFaan > 0
            ? "A concealed value pair can still become a scoring pung."
            : "No dragon, seat-wind, or prevailing-wind value is secured yet.",
    },
    {
      id: "bonus_value",
      label: "Flower and season value",
      status: bonusStatus,
      estimatedFaan: bonusFaan > 0 ? bonusFaan : noBonusFaan,
      reason:
        bonusFaan > 0
          ? `Exposed bonus tiles secure ${String(bonusFaan)} faan.`
          : noBonusFaan > 0
            ? "No bonus tile is exposed, so No Flowers or Seasons remains possible."
            : "The exposed bonus tiles do not currently secure a configured bonus.",
    },
    {
      id: "seven_pairs",
      label: "Seven Pairs",
      status:
        viewer.melds.length > 0 ? "impossible" : statusForSpecialDistance(distance.sevenPairs),
      estimatedFaan: configuredFaan(ruleset, "seven_pairs"),
      reason:
        viewer.melds.length > 0
          ? "A declared meld prevents Seven Pairs."
          : distance.sevenPairs === null
            ? "Seven Pairs is disabled by the active ruleset."
            : `Seven Pairs is ${String(distance.sevenPairs)} tile${distance.sevenPairs === 1 ? "" : "s"} from ready.`,
    },
    {
      id: "thirteen_orphans",
      label: "Thirteen Orphans",
      status:
        viewer.melds.length > 0 ? "impossible" : statusForSpecialDistance(distance.thirteenOrphans),
      estimatedFaan: configuredFaan(ruleset, "thirteen_orphans"),
      reason:
        viewer.melds.length > 0
          ? "A declared meld prevents Thirteen Orphans."
          : distance.thirteenOrphans === null
            ? "Thirteen Orphans is disabled by the active ruleset."
            : `The orphan shape is ${String(distance.thirteenOrphans)} tile${distance.thirteenOrphans === 1 ? "" : "s"} from ready.`,
    },
    {
      id: "nine_gates",
      label: "Nine Gates",
      status: nineGatesStatus,
      estimatedFaan: configuredFaan(ruleset, "nine_gates"),
      reason: nineGatesReady
        ? "The strict single-suit Nine Gates predecessor is complete."
        : nineGatesPlausible
          ? "The hand has a strong single-suit terminal-heavy base, but the path is still speculative."
          : "The current shape is not a plausible strict Nine Gates pursuit.",
    },
  ];
};

export const concealedTypesFromObservation = (
  observation: PlayerObservation,
): readonly TileTypeId[] => observation.private.concealedTiles.map(tileTypeFromInstanceId);
