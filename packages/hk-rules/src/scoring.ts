import {
  canonicalJson,
  getTileDefinition,
  tileTypeFromInstanceId,
  type AppliedScoringRule,
  type CoreGameRules,
  type PaymentSettlement,
  type PaymentSettlementInput,
  type PlayerId,
  type PlayerPayment,
  type ScoringAssessment,
  type ScoringAssessmentInput,
  type ScoringBreakdown,
  type ScoringPreview,
  type ScoringRuleValue,
  type ScoringSuppressionReason,
  type ScoringSystem,
  type StandardScoringComparison,
  type StandardTileTypeId,
  type SuppressedScoringRule,
  type TileTypeId,
  type WinningDecomposition,
  type WinningDecompositionSummary,
} from "@hk-mahjong/core";
import { getBundledRuleset } from "./bundled.js";
import { type ResolvedRuleset, type ScoringRuleId } from "./ruleset.js";
import { solveWinningHand } from "./solver.js";

interface ScoringGroup {
  kind: "chow" | "pung" | "kong" | "pair";
  tileTypes: readonly StandardTileTypeId[];
  concealed: boolean;
}

interface PredicateContext {
  ruleset: ResolvedRuleset;
  input: ScoringAssessmentInput;
  decomposition: WinningDecomposition;
  groups: readonly ScoringGroup[];
  meldGroups: readonly ScoringGroup[];
  pair: ScoringGroup | null;
  standardTileTypes: readonly StandardTileTypeId[];
  bonusTileTypes: readonly TileTypeId[];
}

type ResolvedScoringRuleDefinition = ResolvedRuleset["definition"]["scoringRules"][number];

interface RuleMatch {
  definition: ResolvedScoringRuleDefinition;
  occurrences: number;
  evidence: readonly string[];
  impliedByRuleIds: string[];
}

interface Suppression {
  reason: ScoringSuppressionReason;
  byRuleIds: Set<string>;
}

interface ScoredDecomposition {
  decomposition: WinningDecomposition;
  applied: readonly AppliedScoringRule[];
  suppressed: readonly SuppressedScoringRule[];
  rawFaan: number;
  cappedFaan: number;
  minimumRequired: number;
  missingFaan: number;
  legalWin: boolean;
  basePoints: number;
}

const DRAGONS = ["dragon.red", "dragon.green", "dragon.white"] as const;
const WINDS = ["wind.east", "wind.south", "wind.west", "wind.north"] as const;
const FLOWERS = ["flower.plum", "flower.orchid", "flower.chrysanthemum", "flower.bamboo"] as const;
const SEASONS = ["season.spring", "season.summer", "season.autumn", "season.winter"] as const;

const isPungLike = (group: ScoringGroup): boolean => group.kind === "pung" || group.kind === "kong";

const groupType = (group: ScoringGroup): StandardTileTypeId => {
  const typeId = group.tileTypes[0];
  /* v8 ignore next -- solver and meld invariants prohibit empty scoring groups */
  if (typeId === undefined) {
    throw new Error("A scoring group has no tile type");
  }
  return typeId;
};

const standardType = (tileId: string): StandardTileTypeId => {
  const typeId = tileTypeFromInstanceId(tileId);
  if (getTileDefinition(typeId).bonus) {
    throw new TypeError("Scoring standard-tile zones cannot contain bonus tiles");
  }
  return typeId as StandardTileTypeId;
};

const buildContext = (
  ruleset: ResolvedRuleset,
  input: ScoringAssessmentInput,
  decomposition: WinningDecomposition,
): PredicateContext => {
  const meldById = new Map(input.player.melds.map((meld) => [meld.id, meld] as const));
  const concealedGroups: ScoringGroup[] = decomposition.concealedGroups.map((group) => ({
    kind: group.kind,
    tileTypes: group.tileTypes,
    concealed: true,
  }));
  const declaredGroups = decomposition.declaredMeldIds.map((meldId): ScoringGroup => {
    const meld = meldById.get(meldId);
    if (meld === undefined) {
      throw new Error(`Winning decomposition references unknown meld ${meldId}`);
    }
    return {
      kind: meld.kind,
      tileTypes: meld.tileIds.map(standardType),
      concealed: !meld.exposed,
    };
  });
  const groups = [...concealedGroups, ...declaredGroups];
  const pair = groups.find(({ kind }) => kind === "pair") ?? null;
  return {
    ruleset,
    input,
    decomposition,
    groups,
    meldGroups: groups.filter(({ kind }) => kind !== "pair"),
    pair,
    standardTileTypes: [
      ...input.player.concealedTileIds.map(standardType),
      ...input.player.melds.flatMap(({ tileIds }) => tileIds.map(standardType)),
    ],
    bonusTileTypes: input.player.bonusTileIds.map(tileTypeFromInstanceId),
  };
};

const matched = (evidence: string, occurrences = 1): Omit<RuleMatch, "definition"> => ({
  occurrences,
  evidence: [evidence],
  impliedByRuleIds: [],
});

const pungTypes = (context: PredicateContext): readonly StandardTileTypeId[] =>
  context.meldGroups.filter(isPungLike).map(groupType);

const pairType = (context: PredicateContext): StandardTileTypeId | null =>
  context.pair === null ? null : groupType(context.pair);

const suitComposition = (
  context: PredicateContext,
): { suitedCategories: Set<string>; honors: number } => {
  const suitedCategories = new Set<string>();
  let honors = 0;
  for (const typeId of context.standardTileTypes) {
    const definition = getTileDefinition(typeId);
    if (definition.honor) {
      honors += 1;
    } else {
      suitedCategories.add(definition.category);
    }
  }
  return { suitedCategories, honors };
};

const allStandardGroups = (context: PredicateContext): boolean =>
  context.decomposition.form === "standard" &&
  context.meldGroups.length === 4 &&
  context.pair !== null;

const coloredDragonMatches = (
  context: PredicateContext,
  suit: "characters" | "dots" | "bamboo",
  dragon: (typeof DRAGONS)[number],
): boolean => {
  if (!allStandardGroups(context)) {
    return false;
  }
  const dragonGroups = context.meldGroups.filter(
    (group) => isPungLike(group) && groupType(group) === dragon,
  );
  const suitedGroups = context.meldGroups.filter((group) => {
    const definition = getTileDefinition(groupType(group));
    return definition.category === suit;
  });
  const semantics = context.ruleset.definition.patternSemantics.coloredDragons;
  return (
    dragonGroups.length === 1 &&
    suitedGroups.length === 3 &&
    (!semantics.requireAllPungsOrKongs || suitedGroups.every(isPungLike)) &&
    (!semantics.requireMatchingSuitPair ||
      (context.pair !== null && getTileDefinition(groupType(context.pair)).category === suit))
  );
};

const evaluateRule = (
  ruleId: ScoringRuleId,
  context: PredicateContext,
): Omit<RuleMatch, "definition"> | null => {
  const { input, ruleset } = context;
  const pungs = pungTypes(context);
  const pair = pairType(context);
  switch (ruleId) {
    case "no_bonus_tiles":
      return ruleset.definition.tileSet.bonusTilesEnabled && context.bonusTileTypes.length === 0
        ? matched("The winner owns no Flowers or Seasons")
        : null;
    case "seat_flower": {
      const mapping = ruleset.definition.bonusRules.seatMapping.find(
        ({ seat }) => seat === input.player.seat,
      );
      return mapping !== undefined && context.bonusTileTypes.includes(mapping.flower)
        ? matched(`The winner owns the ${input.player.seat} seat Flower`)
        : null;
    }
    case "seat_season": {
      const mapping = ruleset.definition.bonusRules.seatMapping.find(
        ({ seat }) => seat === input.player.seat,
      );
      return mapping !== undefined && context.bonusTileTypes.includes(mapping.season)
        ? matched(`The winner owns the ${input.player.seat} seat Season`)
        : null;
    }
    case "all_chows":
      return allStandardGroups(context) &&
        context.meldGroups.every(({ kind }) => kind === "chow") &&
        pair !== null &&
        !getTileDefinition(pair).honor
        ? matched("All four melds are chows and the pair is suited")
        : null;
    case "concealed_hand":
      return input.player.melds.every(({ exposed }) => !exposed)
        ? matched("No meld was exposed by claiming another player's discard")
        : null;
    case "dragon_pung": {
      const occurrences = new Set(pungs.filter((typeId) => DRAGONS.includes(typeId as never))).size;
      return occurrences > 0
        ? matched(`${String(occurrences)} distinct Dragon pung or kong group(s)`, occurrences)
        : null;
    }
    case "seat_wind":
      return pungs.includes(`wind.${input.player.seat}`)
        ? matched(`A pung or kong matches the winner's ${input.player.seat} seat`)
        : null;
    case "prevailing_wind":
      return pungs.includes(`wind.${input.prevailingWind}`)
        ? matched(`A pung or kong matches the ${input.prevailingWind} prevailing wind`)
        : null;
    case "self_draw":
      return input.winSource === "self_draw" || input.winSource === "replacement"
        ? matched("The winning tile was drawn by the winner")
        : null;
    case "last_tile_draw":
      return input.winSource === "self_draw" && input.winningTileWasFinalLiveTile
        ? matched("The winning tile was the final ordinary live-wall draw")
        : null;
    case "last_tile_discard":
      return input.winSource === "discard" && input.discardFollowedFinalLiveDraw
        ? matched("The winning discard followed the final live-wall draw")
        : null;
    case "robbing_kong":
      return input.winSource === "robbing_kong" && input.robbedKongKind === "added"
        ? matched("The winning tile robbed an added kong")
        : null;
    case "replacement_win":
      return input.winSource === "replacement" && input.replacementReason !== null
        ? matched(`The winning tile was a ${input.replacementReason} replacement`)
        : null;
    case "all_flowers":
      return FLOWERS.every((typeId) => context.bonusTileTypes.includes(typeId))
        ? matched("The winner owns all four Flowers")
        : null;
    case "all_seasons":
      return SEASONS.every((typeId) => context.bonusTileTypes.includes(typeId))
        ? matched("The winner owns all four Seasons")
        : null;
    case "all_pungs":
      return allStandardGroups(context) && context.meldGroups.every(isPungLike)
        ? matched("All four melds are pungs or kongs")
        : null;
    case "half_flush": {
      const composition = suitComposition(context);
      return composition.suitedCategories.size === 1 && composition.honors > 0
        ? matched("Every tile is from one numbered suit or the honors")
        : null;
    }
    case "little_three_dragons": {
      const dragonPungs = new Set(pungs.filter((typeId) => DRAGONS.includes(typeId as never)));
      return allStandardGroups(context) &&
        dragonPungs.size === 2 &&
        pair !== null &&
        DRAGONS.includes(pair as never) &&
        !dragonPungs.has(pair)
        ? matched("Two Dragon types form pung/kong groups and the third is the pair")
        : null;
    }
    case "seven_pairs":
      return context.decomposition.form === "seven_pairs"
        ? matched("The selected decomposition is Seven Pairs")
        : null;
    case "full_flush": {
      const composition = suitComposition(context);
      return composition.suitedCategories.size === 1 && composition.honors === 0
        ? matched("Every tile belongs to one numbered suit")
        : null;
    }
    case "four_concealed_pungs": {
      const semantics = ruleset.definition.patternSemantics.fourConcealedPungs;
      const allowedDraw = input.winSource === "self_draw" || input.winSource === "replacement";
      return allStandardGroups(context) &&
        allowedDraw &&
        context.meldGroups.every(
          (group) =>
            isPungLike(group) &&
            group.concealed &&
            (group.kind !== "kong" || semantics.concealedKongsCount),
        )
        ? matched("Four concealed pung groups completed on the winner's own draw")
        : null;
    }
    case "big_three_dragons":
      return new Set(pungs.filter((typeId) => DRAGONS.includes(typeId as never))).size === 3
        ? matched("All three Dragon types form pungs or kongs")
        : null;
    case "little_four_winds": {
      const windPungs = new Set(pungs.filter((typeId) => WINDS.includes(typeId as never)));
      return allStandardGroups(context) &&
        windPungs.size === 3 &&
        pair !== null &&
        WINDS.includes(pair as never) &&
        !windPungs.has(pair)
        ? matched("Three Winds form pung/kong groups and the fourth is the pair")
        : null;
    }
    case "big_four_winds":
      return new Set(pungs.filter((typeId) => WINDS.includes(typeId as never))).size === 4
        ? matched("All four Winds form pungs or kongs")
        : null;
    case "all_honors":
      return context.standardTileTypes.length > 0 &&
        context.standardTileTypes.every((typeId) => getTileDefinition(typeId).honor)
        ? matched("Every non-bonus tile is an honor")
        : null;
    case "all_terminals":
      return context.standardTileTypes.length > 0 &&
        context.standardTileTypes.every((typeId) => getTileDefinition(typeId).terminal)
        ? matched("Every non-bonus tile is a suited terminal")
        : null;
    case "nine_gates":
      return context.decomposition.form === "nine_gates"
        ? matched("The selected decomposition is the configured Nine Gates form")
        : null;
    case "thirteen_orphans":
      return context.decomposition.form === "thirteen_orphans"
        ? matched("The selected decomposition is Thirteen Orphans")
        : null;
    case "all_kongs":
      return allStandardGroups(context) &&
        context.meldGroups.length === 4 &&
        context.meldGroups.every(({ kind }) => kind === "kong")
        ? matched("All four declared melds are kongs")
        : null;
    case "jade_dragon":
      return coloredDragonMatches(context, "bamboo", "dragon.green")
        ? matched("Three Bamboo melds, Green Dragon pung/kong, and the configured pair")
        : null;
    case "ruby_dragon":
      return coloredDragonMatches(context, "characters", "dragon.red")
        ? matched("Three Characters melds, Red Dragon pung/kong, and the configured pair")
        : null;
    case "pearl_dragon":
      return coloredDragonMatches(context, "dots", "dragon.white")
        ? matched("Three Dots melds, White Dragon pung/kong, and the configured pair")
        : null;
    case "heavenly_hand": {
      const semantics = ruleset.definition.patternSemantics.heavenlyHand;
      const openingKongAllowed =
        semantics.kongBeforeWinAllowed &&
        input.openingKongOccurred &&
        input.winSource === "replacement";
      return input.player.id === input.dealerPlayerId &&
        !input.firstDiscardCompleted &&
        (input.isInitialDeal || openingKongAllowed) &&
        (!input.initialBonusReplacementOccurred || semantics.initialBonusReplacementsAllowed) &&
        (!input.callsOccurred || openingKongAllowed)
        ? matched("The dealer completed the hand before the opening discard")
        : null;
    }
    case "earthly_hand": {
      const semantics = ruleset.definition.patternSemantics.earthlyHand;
      const callsAllowed =
        !input.callsOccurred || (semantics.kongBeforeWinAllowed && input.openingKongOccurred);
      return input.player.id !== input.dealerPlayerId &&
        input.winSource === "discard" &&
        input.fromPlayerId === input.dealerPlayerId &&
        input.isDealerFirstDiscard &&
        callsAllowed &&
        (!input.initialBonusReplacementOccurred || semantics.initialBonusReplacementsAllowed)
        ? matched("A non-dealer won on the dealer's first discard")
        : null;
    }
  }
};

const ruleFaan = (value: ScoringRuleValue, occurrences: number, capFaan: number): number =>
  value.type === "limit" ? capFaan : value.amount * occurrences;

const referenceTargets = (
  rules: ResolvedRuleset["definition"]["scoringRules"],
  matches: ReadonlyMap<ScoringRuleId, RuleMatch>,
  reference: ResolvedScoringRuleDefinition["suppresses"][number],
): readonly ScoringRuleId[] => {
  if (reference.target === "rule") {
    return matches.has(reference.id as ScoringRuleId) ? [reference.id as ScoringRuleId] : [];
  }
  return rules
    .filter(({ stackingGroup, id }) => stackingGroup === reference.id && matches.has(id))
    .map(({ id }) => id);
};

const exclusionPreference = (left: RuleMatch, right: RuleMatch, capFaan: number): RuleMatch => {
  const leftLimit = left.definition.value.type === "limit" ? 1 : 0;
  const rightLimit = right.definition.value.type === "limit" ? 1 : 0;
  if (leftLimit !== rightLimit) {
    return leftLimit > rightLimit ? left : right;
  }
  const leftFaan = ruleFaan(left.definition.value, left.occurrences, capFaan);
  const rightFaan = ruleFaan(right.definition.value, right.occurrences, capFaan);
  if (leftFaan !== rightFaan) {
    return leftFaan > rightFaan ? left : right;
  }
  return left.definition.id.localeCompare(right.definition.id) <= 0 ? left : right;
};

const suppressionPriority: Readonly<Record<ScoringSuppressionReason, number>> = {
  excluded_by_rule: 0,
  suppressed_by_stacking_group: 1,
  suppressed_by_rule: 2,
  limit_aggregation: 3,
};

const recordSuppression = (
  suppressions: Map<ScoringRuleId, Suppression>,
  target: ScoringRuleId,
  reason: ScoringSuppressionReason,
  byRuleId: string,
): void => {
  const existing = suppressions.get(target);
  if (
    existing === undefined ||
    suppressionPriority[reason] > suppressionPriority[existing.reason]
  ) {
    suppressions.set(target, { reason, byRuleIds: new Set([byRuleId]) });
  } else if (existing.reason === reason) {
    existing.byRuleIds.add(byRuleId);
  }
};

export const basePointsForFaan = (
  payment: ResolvedRuleset["definition"]["payment"],
  faan: number,
): number => {
  if (!Number.isSafeInteger(faan) || faan < 0) {
    throw new TypeError("Payment faan must be a non-negative safe integer");
  }
  const bucket = payment.basePointBuckets.find(
    ({ minimumFaan, maximumFaan }) =>
      faan >= minimumFaan && (maximumFaan === null || faan <= maximumFaan),
  );
  /* v8 ignore next -- resolved rulesets require contiguous buckets with an unbounded final entry */
  if (bucket === undefined) {
    throw new Error(`No payment bucket covers ${String(faan)} faan`);
  }
  return bucket.basePoints;
};

const scoreDecomposition = (
  ruleset: ResolvedRuleset,
  input: ScoringAssessmentInput,
  decomposition: WinningDecomposition,
): ScoredDecomposition => {
  const rules = ruleset.definition.scoringRules;
  const context = buildContext(ruleset, input, decomposition);
  const matches = new Map<ScoringRuleId, RuleMatch>();
  for (const definition of rules) {
    if (!definition.enabled) {
      continue;
    }
    const result = evaluateRule(definition.evaluator, context);
    if (result !== null) {
      matches.set(definition.id, { definition, ...result });
    }
  }

  for (const source of [...matches.values()]) {
    for (const reference of source.definition.implies) {
      for (const targetId of referenceTargets(rules, matches, reference)) {
        const target = matches.get(targetId);
        target?.impliedByRuleIds.push(source.definition.id);
      }
      if (reference.target === "rule" && !matches.has(reference.id as ScoringRuleId)) {
        const target = rules.find(({ id }) => id === reference.id);
        if (target?.enabled === true) {
          matches.set(target.id, {
            definition: target,
            ...matched(`Implied by ${source.definition.id}`),
            impliedByRuleIds: [source.definition.id],
          });
        }
      }
    }
  }

  const suppressions = new Map<ScoringRuleId, Suppression>();
  const exclusionPairs = new Set<string>();
  for (const source of matches.values()) {
    for (const reference of source.definition.excludes) {
      for (const targetId of referenceTargets(rules, matches, reference)) {
        if (targetId === source.definition.id) {
          continue;
        }
        const pair = [source.definition.id, targetId].sort().join(":");
        if (exclusionPairs.has(pair)) {
          continue;
        }
        exclusionPairs.add(pair);
        const target = matches.get(targetId);
        /* v8 ignore next -- referenceTargets returns only matched target IDs */
        if (target === undefined) {
          continue;
        }
        const winner = exclusionPreference(source, target, ruleset.definition.winRules.capFaan);
        const loser = winner === source ? target : source;
        recordSuppression(
          suppressions,
          loser.definition.id,
          "excluded_by_rule",
          winner.definition.id,
        );
      }
    }
  }

  for (const source of matches.values()) {
    for (const reference of source.definition.suppresses) {
      for (const targetId of referenceTargets(rules, matches, reference)) {
        if (targetId !== source.definition.id) {
          recordSuppression(
            suppressions,
            targetId,
            reference.target === "rule" ? "suppressed_by_rule" : "suppressed_by_stacking_group",
            source.definition.id,
          );
        }
      }
    }
  }

  const trueLimits = [...matches.values()].filter(
    ({ definition }) => definition.value.type === "limit",
  );
  if (
    trueLimits.length > 0 &&
    ruleset.definition.patternSemantics.suppressNonLimitRulesWhenLimitMatches
  ) {
    const limitIds = trueLimits.map(({ definition }) => definition.id);
    for (const match of matches.values()) {
      if (match.definition.value.type === "faan") {
        for (const limitId of limitIds) {
          recordSuppression(suppressions, match.definition.id, "limit_aggregation", limitId);
        }
      }
    }
  }

  const applied: AppliedScoringRule[] = [];
  const suppressed: SuppressedScoringRule[] = [];
  for (const definition of rules) {
    const match = matches.get(definition.id);
    if (match === undefined) {
      continue;
    }
    const faan = ruleFaan(definition.value, match.occurrences, ruleset.definition.winRules.capFaan);
    const suppression = suppressions.get(definition.id);
    if (suppression === undefined) {
      applied.push({
        ruleId: definition.id,
        name: definition.names.en,
        value: definition.value,
        occurrences: match.occurrences,
        faanContribution: faan,
        evidence: match.evidence,
        impliedByRuleIds: [...new Set(match.impliedByRuleIds)].sort(),
      });
    } else {
      suppressed.push({
        ruleId: definition.id,
        name: definition.names.en,
        value: definition.value,
        occurrences: match.occurrences,
        wouldAddFaan: faan,
        reason: suppression.reason,
        byRuleIds: [...suppression.byRuleIds].sort(),
        evidence: match.evidence,
      });
    }
  }

  const appliedLimit = applied.some(({ value }) => value.type === "limit");
  const rawFaan = appliedLimit
    ? ruleset.definition.winRules.capFaan
    : applied.reduce((total, rule) => total + rule.faanContribution, 0);
  const cappedFaan = Math.min(rawFaan, ruleset.definition.winRules.capFaan);
  const minimumRequired = ruleset.definition.winRules.minimumFaan;
  const missingFaan = Math.max(0, minimumRequired - cappedFaan);
  return {
    decomposition,
    applied,
    suppressed,
    rawFaan,
    cappedFaan,
    minimumRequired,
    missingFaan,
    legalWin: missingFaan === 0,
    basePoints: basePointsForFaan(ruleset.definition.payment, cappedFaan),
  };
};

const compareScores = (left: ScoredDecomposition, right: ScoredDecomposition): number => {
  if (left.legalWin !== right.legalWin) {
    return left.legalWin ? -1 : 1;
  }
  if (left.cappedFaan !== right.cappedFaan) {
    return right.cappedFaan - left.cappedFaan;
  }
  if (left.rawFaan !== right.rawFaan) {
    return right.rawFaan - left.rawFaan;
  }
  return canonicalJson(left.decomposition).localeCompare(canonicalJson(right.decomposition));
};

const previewFor = (breakdown: ScoringBreakdown): ScoringPreview => ({
  shapeComplete: true,
  legalWin: breakdown.legalWin,
  rawFaan: breakdown.rawFaan,
  cappedFaan: breakdown.cappedFaan,
  minimumRequired: breakdown.minimumRequired,
  missingFaan: breakdown.missingFaan,
  appliedRuleIds: breakdown.applied.map(({ ruleId }) => ruleId),
  winningForm: breakdown.decomposition.form,
  reason: breakdown.legalWin ? "legal" : "below_minimum_faan",
});

const incompleteAssessment = (ruleset: ResolvedRuleset): ScoringAssessment => ({
  preview: {
    shapeComplete: false,
    legalWin: false,
    rawFaan: 0,
    cappedFaan: 0,
    minimumRequired: ruleset.definition.winRules.minimumFaan,
    missingFaan: ruleset.definition.winRules.minimumFaan,
    appliedRuleIds: [],
    winningForm: null,
    reason: "shape_incomplete",
  },
  breakdown: null,
});

const solveOptions = (ruleset: ResolvedRuleset) => ({
  allowSevenPairs: ruleset.definition.winRules.allowSevenPairs,
  sevenPairsAllowsQuadAsTwoPairs: ruleset.definition.winRules.sevenPairsAllowsQuadAsTwoPairs,
  allowThirteenOrphans: ruleset.definition.winRules.allowThirteenOrphans,
  thirteenOrphansRequireThirteenSidedWait:
    ruleset.definition.patternSemantics.thirteenOrphans.requireThirteenSidedWait,
  allowNineGates: ruleset.definition.winRules.allowNineGates,
  nineGatesDeclaredKongsAllowed: ruleset.definition.patternSemantics.nineGates.declaredKongsAllowed,
});

const scoreResolvedHand = (
  ruleset: ResolvedRuleset,
  input: ScoringAssessmentInput,
): ScoringAssessment => {
  const decompositions = solveWinningHand({
    concealedTileIds: input.player.concealedTileIds,
    melds: input.player.melds,
    winningTileId: input.winningTileId,
    options: solveOptions(ruleset),
  });
  if (decompositions.length === 0) {
    return incompleteAssessment(ruleset);
  }
  const scores = decompositions
    .map((decomposition) => scoreDecomposition(ruleset, input, decomposition))
    .sort(compareScores);
  const best = scores[0];
  /* v8 ignore next -- a non-empty decomposition list always produces one score */
  if (best === undefined) {
    throw new Error("Winning solver produced no score candidate");
  }
  const alternatives: WinningDecompositionSummary[] = scores.slice(1).map((score) => ({
    decomposition: score.decomposition,
    rawFaan: score.rawFaan,
    cappedFaan: score.cappedFaan,
    legalWin: score.legalWin,
    appliedRuleIds: score.applied.map(({ ruleId }) => ruleId),
  }));
  const breakdown: ScoringBreakdown = {
    rulesetId: ruleset.definition.id,
    rulesetVersion: ruleset.definition.version,
    rulesetHash: ruleset.hash,
    winnerId: input.player.id,
    winningTileId: input.winningTileId,
    winSource: input.winSource,
    decomposition: best.decomposition,
    alternatives,
    applied: best.applied,
    suppressed: best.suppressed,
    rawFaan: best.rawFaan,
    cappedFaan: best.cappedFaan,
    minimumRequired: best.minimumRequired,
    missingFaan: best.missingFaan,
    legalWin: best.legalWin,
    basePoints: best.basePoints,
    standardComparison: null,
  };
  return { preview: previewFor(breakdown), breakdown };
};

const comparisonFor = (
  comparisonRuleset: ResolvedRuleset,
  input: ScoringAssessmentInput,
): StandardScoringComparison | null => {
  const comparison = scoreResolvedHand(comparisonRuleset, input);
  if (comparison.breakdown === null) {
    return null;
  }
  return {
    rulesetId: comparison.breakdown.rulesetId,
    rulesetVersion: comparison.breakdown.rulesetVersion,
    rulesetHash: comparison.breakdown.rulesetHash,
    rawFaan: comparison.breakdown.rawFaan,
    cappedFaan: comparison.breakdown.cappedFaan,
    minimumRequired: comparison.breakdown.minimumRequired,
    missingFaan: comparison.breakdown.missingFaan,
    legalWin: comparison.breakdown.legalWin,
    appliedRuleIds: comparison.breakdown.applied.map(({ ruleId }) => ruleId),
  };
};

/** Scores every legal decomposition and returns the deterministic highest-value interpretation. */
export const scoreHand = (
  ruleset: ResolvedRuleset,
  input: ScoringAssessmentInput,
  standardComparisonRuleset?: ResolvedRuleset,
): ScoringAssessment => {
  const assessment = scoreResolvedHand(ruleset, input);
  if (assessment.breakdown === null) {
    return assessment;
  }
  const comparison =
    standardComparisonRuleset === undefined
      ? null
      : comparisonFor(standardComparisonRuleset, input);
  const breakdown: ScoringBreakdown = {
    ...assessment.breakdown,
    standardComparison: comparison,
  };
  return { preview: previewFor(breakdown), breakdown };
};

const paymentPlayers = (
  input: PaymentSettlementInput,
): ReadonlyMap<PlayerId, PaymentSettlementInput["players"][number]> =>
  new Map(input.players.map((player) => [player.id, player]));

const checkedAdd = (left: number, right: number, label: string): number => {
  const result = left + right;
  if (
    !Number.isSafeInteger(left) ||
    !Number.isSafeInteger(right) ||
    !Number.isSafeInteger(result)
  ) {
    throw new RangeError(`${label} exceeds safe-integer arithmetic`);
  }
  return result;
};

const checkedMultiply = (left: number, right: number, label: string): number => {
  const result = left * right;
  if (
    !Number.isSafeInteger(left) ||
    !Number.isSafeInteger(right) ||
    !Number.isSafeInteger(result)
  ) {
    throw new RangeError(`${label} exceeds safe-integer arithmetic`);
  }
  return result;
};

/** Settles configured abstract-point payments and proves the resulting deltas are zero-sum. */
export const settlePayments = (
  payment: ResolvedRuleset["definition"]["payment"],
  input: PaymentSettlementInput,
): PaymentSettlement => {
  const players = paymentPlayers(input);
  if (
    players.size !== input.players.length ||
    players.size !== 4 ||
    !players.has(input.dealerPlayerId)
  ) {
    throw new TypeError("Payment settlement requires four distinct players and a valid dealer");
  }
  const winnerIds = new Set(input.winners.map(({ playerId }) => playerId));
  if (
    winnerIds.size !== input.winners.length ||
    input.winners.length === 0 ||
    [...winnerIds].some((playerId) => !players.has(playerId))
  ) {
    throw new TypeError("Payment settlement requires distinct existing winners");
  }

  const payments: PlayerPayment[] = [];
  for (const winner of input.winners) {
    if (
      !winner.breakdown.legalWin ||
      winner.breakdown.winnerId !== winner.playerId ||
      winner.breakdown.winSource !== winner.source ||
      !Number.isSafeInteger(winner.breakdown.basePoints) ||
      winner.breakdown.basePoints < 1
    ) {
      throw new TypeError("Payment settlement accepts only legal winner scoring breakdowns");
    }
    const selfDraw =
      winner.source === "self_draw" ||
      winner.source === "replacement" ||
      winner.source === "initial_deal";
    if (
      (selfDraw && winner.fromPlayerId !== null) ||
      (!selfDraw &&
        (winner.fromPlayerId === null ||
          !players.has(winner.fromPlayerId) ||
          winnerIds.has(winner.fromPlayerId)))
    ) {
      throw new TypeError("Winner source-player provenance is invalid");
    }
    for (const payer of input.players) {
      if (winnerIds.has(payer.id)) {
        continue;
      }
      let multiplier: number;
      const reasons: PlayerPayment["reasons"][number][] = [];
      if (selfDraw) {
        multiplier = payment.selfDraw.loserMultiplier;
        reasons.push("self_draw");
      } else if (payer.id === winner.fromPlayerId) {
        multiplier = payment.discard.discarderMultiplier;
        reasons.push("discarder");
      } else {
        multiplier = payment.discard.otherLoserMultiplier;
        reasons.push("other_loser");
      }
      if (payer.id === input.dealerPlayerId || winner.playerId === input.dealerPlayerId) {
        multiplier = checkedMultiply(
          multiplier,
          payment.dealerMultiplier,
          "Dealer payment multiplier",
        );
        if (payment.dealerMultiplier !== 1) {
          reasons.push("dealer");
        }
      }
      if (multiplier === 0) {
        continue;
      }
      payments.push({
        fromPlayerId: payer.id,
        toPlayerId: winner.playerId,
        points: checkedMultiply(winner.breakdown.basePoints, multiplier, "Payment points"),
        basePoints: winner.breakdown.basePoints,
        multiplier,
        reasons,
      });
    }
  }

  const scoreDeltas: Record<PlayerId, number> = Object.fromEntries(
    input.players.map(({ id }) => [id, 0]),
  );
  for (const transfer of payments) {
    scoreDeltas[transfer.fromPlayerId] = checkedAdd(
      scoreDeltas[transfer.fromPlayerId]!,
      -transfer.points,
      "Payer score delta",
    );
    scoreDeltas[transfer.toPlayerId] = checkedAdd(
      scoreDeltas[transfer.toPlayerId]!,
      transfer.points,
      "Winner score delta",
    );
  }
  const total = Object.values(scoreDeltas).reduce(
    (sum, delta) => checkedAdd(sum, delta, "Payment total"),
    0,
  );
  /* v8 ignore next -- every transfer is applied once negatively and once positively */
  if (total !== 0) {
    throw new Error("Payment settlement is not zero-sum");
  }
  return { payments, scoreDeltas };
};

const assertRulesetIdentity = (ruleset: ResolvedRuleset, rules: CoreGameRules): void => {
  if (
    rules.id !== ruleset.definition.id ||
    rules.version !== ruleset.definition.version ||
    rules.hash !== ruleset.hash
  ) {
    throw new Error("Scoring ruleset identity does not match the configured scoring system");
  }
};

/** Creates the complete ruleset-bound scoring and payment authority used by the core engine. */
export const createHongKongScoringSystem = (
  ruleset: ResolvedRuleset,
  comparisonRuleset?: ResolvedRuleset,
): ScoringSystem => {
  const comparisonId = ruleset.definition.standardComparisonRulesetId;
  const resolvedComparison =
    comparisonRuleset ?? (comparisonId === null ? undefined : getBundledRuleset(comparisonId));
  if (
    (comparisonId === null && resolvedComparison !== undefined) ||
    (comparisonId !== null && resolvedComparison?.definition.id !== comparisonId)
  ) {
    throw new TypeError("Scoring comparison ruleset does not match the profile definition");
  }
  return {
    assess: (input) => {
      assertRulesetIdentity(ruleset, input.rules);
      return scoreHand(ruleset, input, resolvedComparison);
    },
    settle: (input) => {
      if (
        input.winners.some(
          ({ breakdown }) =>
            breakdown.rulesetId !== ruleset.definition.id ||
            breakdown.rulesetVersion !== ruleset.definition.version ||
            breakdown.rulesetHash !== ruleset.hash,
        )
      ) {
        throw new TypeError("Payment scoring identity does not match the configured ruleset");
      }
      return settlePayments(ruleset.definition.payment, input);
    },
  };
};
