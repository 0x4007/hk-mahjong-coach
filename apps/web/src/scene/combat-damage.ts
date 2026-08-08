import {
  applyPlayerDamage,
  type PlayerVitalsDamageResult,
  type PlayerVitalsState,
} from "./player-vitals.js";

/** Stable identity used by every damageable player or bot in the scene. */
export type CombatActorId = string;

/** The two actor classes that share the same shield/health rules. */
export type CombatActorKind = "player" | "bot";

/** Origin of a damage event. All damage must carry an explicit source. */
export type CombatDamageSourceKind = "weapon" | "melee" | "impact" | "oxygen";

/** Anatomical hit zone used by player-like scene combat. */
export type CombatHitZone = "head" | "body";

/** Minimum per-projectile damage required for an unshielded headshot kill. */
export const HEADSHOT_DAMAGE_THRESHOLD = 25;

export interface CombatDamageSource {
  readonly kind: CombatDamageSourceKind;
  readonly id?: string;
}

export interface CombatDamageEvent {
  readonly targetId: CombatActorId;
  readonly amount: number;
  readonly source: CombatDamageSource;
  readonly attackerId?: CombatActorId;
  readonly hitZone?: CombatHitZone;
}

export interface CombatDamageApplicationResult extends PlayerVitalsDamageResult {
  readonly targetId: CombatActorId;
  readonly targetKind: CombatActorKind;
  readonly source: CombatDamageSource;
  readonly attackerId: CombatActorId | null;
}

export interface CombatDamageTarget {
  readonly id: CombatActorId;
  readonly kind: CombatActorKind;
  readonly getVitals: () => PlayerVitalsState;
  readonly setVitals: (nextVitals: PlayerVitalsState) => void;
  readonly onDamage?: (result: CombatDamageApplicationResult) => void;
  readonly onKilled?: (result: CombatDamageApplicationResult) => void;
}

export interface CombatDamageRouter {
  readonly register: (target: CombatDamageTarget) => void;
  readonly unregister: (targetId: CombatActorId) => boolean;
  readonly hasTarget: (targetId: CombatActorId) => boolean;
  readonly apply: (event: CombatDamageEvent) => CombatDamageApplicationResult;
}

const normalizeActorId = (actorId: CombatActorId): CombatActorId => {
  const normalized = actorId.trim();
  if (normalized.length === 0) {
    throw new TypeError("Combat actor IDs must not be empty");
  }
  return normalized;
};

const normalizeHitZone = (hitZone: unknown): CombatHitZone | undefined => {
  if (hitZone === undefined) {
    return undefined;
  }
  if (hitZone === "head" || hitZone === "body") {
    return hitZone;
  }
  throw new TypeError("Unknown combat hit zone");
};

const normalizeDamageEvent = (event: CombatDamageEvent): CombatDamageEvent => {
  const hitZone = normalizeHitZone(event.hitZone);
  const normalized: CombatDamageEvent = {
    targetId: normalizeActorId(event.targetId),
    amount: event.amount,
    source: event.source,
    ...(hitZone === undefined ? {} : { hitZone }),
  };
  if (event.attackerId !== undefined) {
    return { ...normalized, attackerId: normalizeActorId(event.attackerId) };
  }
  return normalized;
};

/**
 * Resolve one projectile's damage against a player-like target.
 *
 * Headshots are only lethal when the hit is a weapon projectile, the target
 * has no shield remaining, and the projectile is strictly above the damage
 * threshold. Other hits retain the ordinary shield-before-health amount.
 */
export const resolveCombatDamageAmount = (
  state: Pick<PlayerVitalsState, "health" | "shield">,
  amount: number,
  source: CombatDamageSource,
  hitZone?: CombatHitZone,
): number => {
  const damage = Number.isFinite(amount) ? Math.max(0, amount) : 0;
  if (
    source.kind !== "weapon" ||
    hitZone !== "head" ||
    damage <= HEADSHOT_DAMAGE_THRESHOLD ||
    !Number.isFinite(state.shield) ||
    state.shield > 0
  ) {
    return damage;
  }
  return Number.isFinite(state.health) ? Math.max(0, state.health) : damage;
};

/**
 * Central damage seam for every player-like actor.
 *
 * The router owns target lookup and lifecycle callbacks; the pure vitals
 * reducer remains the only place that resolves shield-before-health damage.
 * An unregistered target throws instead of silently dropping a hit, so adding
 * a new bot requires explicit registration before its render marker can take
 * damage.
 */
export const createCombatDamageRouter = (): CombatDamageRouter => {
  const targets = new Map<CombatActorId, CombatDamageTarget>();

  const register = (target: CombatDamageTarget): void => {
    const targetId = normalizeActorId(target.id);
    if (targets.has(targetId)) {
      throw new Error(`Combat damage target is already registered: ${targetId}`);
    }
    targets.set(targetId, { ...target, id: targetId });
  };

  const unregister = (targetId: CombatActorId): boolean =>
    targets.delete(normalizeActorId(targetId));

  const hasTarget = (targetId: CombatActorId): boolean => targets.has(normalizeActorId(targetId));

  const apply = (rawEvent: CombatDamageEvent): CombatDamageApplicationResult => {
    const event = normalizeDamageEvent(rawEvent);
    const target = targets.get(event.targetId);
    if (target === undefined) {
      throw new Error(`No combat damage target is registered for: ${event.targetId}`);
    }

    const previousVitals = target.getVitals();
    const damageResult = applyPlayerDamage(
      previousVitals,
      resolveCombatDamageAmount(previousVitals, event.amount, event.source, event.hitZone),
    );
    const result: CombatDamageApplicationResult = {
      ...damageResult,
      targetId: event.targetId,
      targetKind: target.kind,
      source: event.source,
      attackerId: event.attackerId ?? null,
    };
    if (damageResult.damage <= 0) {
      return result;
    }

    target.setVitals(damageResult.state);
    target.onDamage?.(result);
    if (!previousVitals.isDead && damageResult.killed) {
      target.onKilled?.(result);
    }
    return result;
  };

  return { register, unregister, hasTarget, apply };
};
