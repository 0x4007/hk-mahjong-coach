/** The player's durable health pool. It does not regenerate during normal play. */
export const PLAYER_MAX_HEALTH = 100;

/** The player's rechargeable energy shield pool. */
export const PLAYER_MAX_SHIELD = 100;

/** The player's available oxygen pool. */
export const PLAYER_MAX_O2 = 100;

/** Time without damage before the shield starts to refill. */
export const SHIELD_RECHARGE_DELAY_SECONDS = 3.5;

/** Shield refill rate after the recharge delay. */
export const SHIELD_RECHARGE_RATE_PER_SECOND = 35;

/** Target full-speed sprint duration from a full oxygen pool. */
export const O2_SPRINT_DURATION_SECONDS = 30;

/** Oxygen used per second at full sprint speed. */
export const O2_SPRINT_DRAIN_PER_SECOND = PLAYER_MAX_O2 / O2_SPRINT_DURATION_SECONDS;

/** Oxygen recovered per second while standing still. */
export const O2_IDLE_RECOVERY_PER_SECOND = 12;

/** Oxygen recovered per second while walking. */
export const O2_WALKING_RECOVERY_PER_SECOND = 8;

/**
 * Walking-to-sprinting blend where walking recovery and sprint drain cancel.
 * A value of 0 is the configured walk speed and 1 is full sprint.
 */
export const O2_NEUTRAL_JOG_SPEED_BLEND =
  O2_WALKING_RECOVERY_PER_SECOND / (O2_WALKING_RECOVERY_PER_SECOND + O2_SPRINT_DRAIN_PER_SECOND);

/** Oxygen recovered per second while crouched and stationary. */
export const O2_CROUCHED_RECOVERY_PER_SECOND = 10;

/** Oxygen spent by one jump. */
export const O2_JUMP_COST = PLAYER_MAX_O2 * 0.05;

/**
 * Zero-cost launch blend for a mini hop when a full jump is unaffordable.
 *
 * This uses the same neutral-balance interpolation as the oxygen-neutral jog:
 * standing recovery offsets the full jump charge at the blend point.
 */
export const O2_MINI_HOP_SPEED_BLEND =
  O2_IDLE_RECOVERY_PER_SECOND / (O2_IDLE_RECOVERY_PER_SECOND + O2_JUMP_COST);

/** Oxygen spent by standing up from a crouch. */
export const O2_STAND_COST = PLAYER_MAX_O2 * 0.05;

/** Delay before recovery starts after sprinting stops. */
export const O2_SPRINT_RECOVERY_DELAY_SECONDS = 1.5;

/** Delay before recovery starts after crouch walking stops. */
export const O2_CROUCH_WALK_RECOVERY_DELAY_SECONDS = 0.5;

/** Delay before recovery starts after jumping. */
export const O2_JUMP_RECOVERY_DELAY_SECONDS = 0.25;

/** Oxygen used per second while holding breath. */
export const O2_HOLD_BREATH_DRAIN_PER_SECOND = 15;

/** Fraction of projectile damage charged against the shared Breath / O₂ Reserve. */
export const O2_PROJECTILE_DAMAGE_FACTOR = 0.25;

/** Minimum continuous-action slice needed to begin holding breath. */
export const O2_HOLD_BREATH_ACTION_SLICE_SECONDS = 1 / 60;
export const O2_HOLD_BREATH_ACTION_COST =
  O2_HOLD_BREATH_DRAIN_PER_SECOND * O2_HOLD_BREATH_ACTION_SLICE_SECONDS;

/** Oxygen that must be recovered before holding breath can be activated again. */
export const O2_HOLD_BREATH_REARM_THRESHOLD = PLAYER_MAX_O2 * 0.25;

export interface PlayerVitalsState {
  readonly health: number;
  readonly shield: number;
  readonly o2: number;
  /** Seconds remaining before non-strenuous oxygen recovery can begin. */
  readonly oxygenRecoveryDelaySeconds: number;
  /** Whether the player is currently holding their breath. */
  readonly holdingBreath: boolean;
  /** Whether holding breath is locked until the rearm reserve is recovered. */
  readonly holdBreathLocked: boolean;
  /** Seconds since the last non-zero damage event. */
  readonly timeSinceDamage: number;
  readonly isDead: boolean;
}

export interface PlayerVitalsActivity {
  /** Current exercise intensity, normalized from 0 (idle) to 1 (full speed). */
  readonly exerciseIntensity?: number;
  /** Horizontal input magnitude, normalized from 0 (none) to 1 (full input). */
  readonly movementMagnitude?: number;
  /** Speed blend from walking (0) to full sprint (1). */
  readonly locomotionBlend?: number;
  /** Whether the current movement is a sprint. */
  readonly sprinting?: boolean;
  /** Whether the current movement is a crouch walk. */
  readonly crouchWalking?: boolean;
  /** Whether the current non-crouched movement is a walk. */
  readonly walking?: boolean;
  /** Whether the player is crouched, including when stationary. */
  readonly crouched?: boolean;
  /** Whether the player is zoomed. */
  readonly aimingDownSights?: boolean;
}

export interface PlayerVitalsDamageResult {
  readonly state: PlayerVitalsState;
  readonly damage: number;
  readonly shieldDamage: number;
  readonly healthDamage: number;
  readonly shieldBroken: boolean;
  readonly killed: boolean;
}

const clampFinite = (value: number, min: number, max: number): number =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;

const normalizeDamage = (damage: number): number =>
  Number.isFinite(damage) ? Math.max(0, damage) : 0;

const normalizeProjectileCount = (projectileCount: number): number =>
  Number.isFinite(projectileCount) ? Math.max(0, Math.floor(projectileCount)) : 0;

/** Resolve the O₂ charge for one weapon event's projectiles. */
export const resolveProjectileO2Cost = (damage: number, projectileCount = 1): number =>
  normalizeDamage(damage) * O2_PROJECTILE_DAMAGE_FACTOR * normalizeProjectileCount(projectileCount);

/** Return whether a living player can pay an entire O₂ action cost. */
export const canAffordPlayerO2Cost = (state: PlayerVitalsState, oxygenCost: number): boolean =>
  !state.isDead && state.o2 >= normalizeDamage(oxygenCost);

const normalizeDelta = (deltaSeconds: number): number =>
  Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;

const makeState = (
  health: number,
  shield: number,
  o2: number,
  timeSinceDamage: number,
  oxygenRecoveryDelaySeconds = 0,
  holdingBreath = false,
  holdBreathLocked = false,
): PlayerVitalsState => {
  const normalizedHealth = clampFinite(health, 0, PLAYER_MAX_HEALTH);
  const normalizedShield = clampFinite(shield, 0, PLAYER_MAX_SHIELD);
  const normalizedO2 = clampFinite(o2, 0, PLAYER_MAX_O2);
  const normalizedHoldingBreath = holdingBreath && normalizedO2 > 0;
  return {
    health: normalizedHealth,
    shield: normalizedShield,
    o2: normalizedO2,
    oxygenRecoveryDelaySeconds: clampFinite(oxygenRecoveryDelaySeconds, 0, Number.MAX_SAFE_INTEGER),
    holdingBreath: normalizedHoldingBreath,
    holdBreathLocked: holdBreathLocked || (holdingBreath && normalizedO2 <= 0),
    timeSinceDamage: clampFinite(timeSinceDamage, 0, Number.MAX_SAFE_INTEGER),
    isDead: normalizedHealth <= 0,
  };
};

export const createPlayerVitals = (): PlayerVitalsState =>
  makeState(PLAYER_MAX_HEALTH, PLAYER_MAX_SHIELD, PLAYER_MAX_O2, 0);

/** Apply damage to shields first, then carry any remainder into health. */
export const applyPlayerDamage = (
  state: PlayerVitalsState,
  incomingDamage: number,
): PlayerVitalsDamageResult => {
  const damage = normalizeDamage(incomingDamage);
  if (damage <= 0 || state.isDead) {
    return {
      state,
      damage: 0,
      shieldDamage: 0,
      healthDamage: 0,
      shieldBroken: false,
      killed: state.isDead,
    };
  }

  const shieldDamage = Math.min(state.shield, damage);
  const healthDamage = Math.min(state.health, damage - shieldDamage);
  const nextState = makeState(
    state.health - healthDamage,
    state.shield - shieldDamage,
    state.o2,
    0,
    state.oxygenRecoveryDelaySeconds,
    state.holdingBreath,
    state.holdBreathLocked,
  );
  return {
    state: nextState,
    damage: shieldDamage + healthDamage,
    shieldDamage,
    healthDamage,
    shieldBroken: state.shield > 0 && nextState.shield <= 0,
    killed: nextState.isDead,
  };
};

/** Spend oxygen on a discrete action such as jumping or standing up. */
export const applyPlayerO2Cost = (
  state: PlayerVitalsState,
  oxygenCost: number,
  recoveryDelaySeconds = 0,
): PlayerVitalsState => {
  const cost = normalizeDamage(oxygenCost);
  if (cost <= 0 || !canAffordPlayerO2Cost(state, cost)) {
    return state;
  }
  return makeState(
    state.health,
    state.shield,
    state.o2 - cost,
    state.timeSinceDamage,
    Math.max(state.oxygenRecoveryDelaySeconds, normalizeDelta(recoveryDelaySeconds)),
    state.holdingBreath,
    state.holdBreathLocked,
  );
};

/**
 * Apply a firing fatigue charge. A shot may consume the final partial reserve;
 * firing itself is never rejected because the reserve cannot pay the full
 * charge.
 */
export const applyPlayerProjectileO2Cost = (
  state: PlayerVitalsState,
  damage: number,
  projectileCount = 1,
): PlayerVitalsState => {
  const cost = resolveProjectileO2Cost(damage, projectileCount);
  if (cost <= 0) {
    return state;
  }
  return applyPlayerO2Cost(state, Math.min(cost, state.o2));
};

/**
 * Request a hold-breath state transition. Desktop aim bindings stay outside
 * this pure model so another input map can replace them without changing the
 * oxygen rules.
 */
export const setPlayerHoldingBreath = (
  state: PlayerVitalsState,
  requested: boolean,
  aimingDownSights: boolean,
  actionSliceSeconds = O2_HOLD_BREATH_ACTION_SLICE_SECONDS,
): PlayerVitalsState => {
  const rearmed = state.o2 > O2_HOLD_BREATH_REARM_THRESHOLD;
  const holdBreathLocked = rearmed ? false : state.holdBreathLocked;
  const holdBreathActionCost = O2_HOLD_BREATH_DRAIN_PER_SECOND * normalizeDelta(actionSliceSeconds);
  if (
    !requested ||
    !aimingDownSights ||
    holdBreathLocked ||
    state.isDead ||
    !canAffordPlayerO2Cost(state, holdBreathActionCost)
  ) {
    return makeState(
      state.health,
      state.shield,
      state.o2,
      state.timeSinceDamage,
      state.oxygenRecoveryDelaySeconds,
      false,
      holdBreathLocked,
    );
  }
  return makeState(
    state.health,
    state.shield,
    state.o2,
    state.timeSinceDamage,
    state.oxygenRecoveryDelaySeconds,
    true,
    false,
  );
};

/** Advance shield recharge and oxygen recovery/consumption for one frame. */
export const tickPlayerVitals = (
  state: PlayerVitalsState,
  deltaSeconds: number,
  activity: PlayerVitalsActivity = {},
): PlayerVitalsState => {
  const delta = normalizeDelta(deltaSeconds);
  if (delta <= 0 || state.isDead) {
    return state;
  }

  const timeSinceDamage = state.timeSinceDamage + delta;
  let shield = state.shield;
  if (state.shield < PLAYER_MAX_SHIELD && timeSinceDamage > SHIELD_RECHARGE_DELAY_SECONDS) {
    // Only count the newly elapsed portion after the delay. The previous
    // implementation re-applied the entire post-delay duration every frame,
    // which made shields refill much faster than the configured rate.
    const previousRechargeSeconds = Math.max(
      0,
      state.timeSinceDamage - SHIELD_RECHARGE_DELAY_SECONDS,
    );
    const rechargeSeconds =
      timeSinceDamage - SHIELD_RECHARGE_DELAY_SECONDS - previousRechargeSeconds;
    shield = Math.min(
      PLAYER_MAX_SHIELD,
      state.shield + rechargeSeconds * SHIELD_RECHARGE_RATE_PER_SECOND,
    );
  }

  const exerciseIntensity =
    activity.exerciseIntensity === undefined
      ? activity.sprinting === true || activity.crouchWalking === true
        ? 1
        : 0
      : clampFinite(activity.exerciseIntensity, 0, 1);
  const movementMagnitude =
    activity.movementMagnitude === undefined
      ? exerciseIntensity
      : clampFinite(activity.movementMagnitude, 0, 1);
  const sprinting = activity.sprinting === true && exerciseIntensity > 0;
  const crouchWalking = activity.crouchWalking === true && exerciseIntensity > 0;
  const walking =
    !sprinting &&
    !crouchWalking &&
    (activity.walking === true || (activity.walking === undefined && exerciseIntensity > 0));
  const crouched = activity.crouched === true;
  const strenuousRecoveryDelay = sprinting
    ? O2_SPRINT_RECOVERY_DELAY_SECONDS
    : crouchWalking
      ? O2_CROUCH_WALK_RECOVERY_DELAY_SECONDS
      : 0;
  const previousRecoveryDelay = state.oxygenRecoveryDelaySeconds;
  const oxygenRecoveryDelaySeconds =
    strenuousRecoveryDelay > 0
      ? strenuousRecoveryDelay
      : Math.max(0, previousRecoveryDelay - delta);
  const recoverySeconds =
    strenuousRecoveryDelay > 0 ? 0 : Math.max(0, delta - previousRecoveryDelay);

  const holdingBreath = state.holdingBreath && activity.aimingDownSights !== false;
  const holdBreathDrain = holdingBreath ? O2_HOLD_BREATH_DRAIN_PER_SECOND * delta : 0;
  const hasLocomotionTelemetry = activity.locomotionBlend !== undefined && (sprinting || walking);
  const locomotionBlend = hasLocomotionTelemetry
    ? clampFinite(activity.locomotionBlend ?? 0, 0, 1)
    : sprinting
      ? 1
      : 0;
  const standingLocomotionRate =
    O2_WALKING_RECOVERY_PER_SECOND * (1 - locomotionBlend) -
    O2_SPRINT_DRAIN_PER_SECOND * locomotionBlend;
  const standingLocomotionDrain = hasLocomotionTelemetry
    ? Math.max(0, -standingLocomotionRate) * movementMagnitude * delta
    : 0;
  const standingLocomotionRecovery = hasLocomotionTelemetry
    ? Math.max(0, standingLocomotionRate) * movementMagnitude * recoverySeconds
    : 0;
  const movementDrain = hasLocomotionTelemetry
    ? standingLocomotionDrain
    : sprinting
      ? exerciseIntensity * O2_SPRINT_DRAIN_PER_SECOND * delta
      : 0;
  const recoveryRate = crouched
    ? O2_CROUCHED_RECOVERY_PER_SECOND
    : walking
      ? O2_WALKING_RECOVERY_PER_SECOND
      : O2_IDLE_RECOVERY_PER_SECOND;
  const oxygenRecovery =
    holdingBreath || crouchWalking
      ? 0
      : hasLocomotionTelemetry
        ? standingLocomotionRecovery
        : movementDrain > 0
          ? 0
          : recoveryRate * recoverySeconds;
  const o2 = Math.min(
    PLAYER_MAX_O2,
    Math.max(0, state.o2 - holdBreathDrain - movementDrain + oxygenRecovery),
  );
  const holdBreathLocked =
    o2 > O2_HOLD_BREATH_REARM_THRESHOLD
      ? false
      : state.holdBreathLocked || (holdingBreath && o2 <= 0);
  const nextHoldingBreath = holdingBreath && o2 > 0;

  return makeState(
    state.health,
    shield,
    o2,
    timeSinceDamage,
    oxygenRecoveryDelaySeconds,
    nextHoldingBreath,
    holdBreathLocked,
  );
};

export const resetPlayerVitals = (): PlayerVitalsState => createPlayerVitals();
