import { type CoreGameRules } from "@hk-mahjong/core";
import { type ResolvedRuleset } from "./ruleset.js";

/** Projects a validated historical ruleset into the transition settings understood by core. */
export const toCoreGameRules = (ruleset: ResolvedRuleset): CoreGameRules => {
  const { definition, hash } = ruleset;
  return {
    id: definition.id,
    version: definition.version,
    hash,
    minimumFaan: definition.winRules.minimumFaan,
    capFaan: definition.winRules.capFaan,
    bonusTilesEnabled: definition.tileSet.bonusTilesEnabled,
    multipleWinners: definition.winRules.multipleWinners,
    sameTileWinLockUntilNextDraw: definition.winRules.sameTileWinLockUntilNextDraw,
    passedWinLockTriggers: definition.winRules.passedWinLockTriggers,
    passedWinLockIncludesKongRobbery: definition.winRules.passedWinLockIncludesKongRobbery,
    robAddedKong: definition.kongRules.robAddedKong,
    robConcealedKong: definition.kongRules.robConcealedKong,
    concealedKongRobberyForms: definition.kongRules.concealedKongRobberyForms,
    allowKongImmediatelyAfterChowOrPung: definition.kongRules.allowKongImmediatelyAfterChowOrPung,
    initialDealWinsEnabled: definition.winRules.initialDealWinsEnabled,
    dealerRepeatsOnWin: definition.roundRules.dealerRepeatsOnWin,
    dealerRepeatsOnDraw: definition.roundRules.dealerRepeatsOnDraw,
    dealerRepeatsWhenAmongMultipleWinners:
      definition.roundRules.dealerRepeatsWhenAmongMultipleWinners,
    prevailingWinds: definition.roundRules.prevailingWinds,
  };
};
