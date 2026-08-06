/**
 * Continuous presentation response for the player's Breath / O₂ Reserve.
 *
 * This is deliberately separate from the vitals rules. The vitals model owns
 * the reserve and its costs; this module maps the current reserve to smooth
 * aim, reticle, and weapon responses without percentage threshold states.
 */

export interface O2StabilityInput {
  /** Current reserve ratio, where 1 is rested and 0 is empty. */
  readonly oxygenRatio: number;
  /** Whether the player is currently aiming down sights. */
  readonly aimingDownSights?: boolean;
  /** Whether the player is currently holding breath. */
  readonly holdingBreath?: boolean;
}

export interface O2StabilityResponse {
  readonly oxygenRatio: number;
  /** Smooth fatigue value used by all presentation effects. */
  readonly breathlessness: number;
  /** Reticle angular sway amplitude in radians. */
  readonly reticleSwayRadians: number;
  /** First-person weapon angular sway amplitude in radians. */
  readonly weaponSwayRadians: number;
  /** Multiplicative weapon spread/accuracy response. */
  readonly accuracyMultiplier: number;
}

export const O2_STABILITY_CURVE_EXPONENT = 1.25;
export const O2_RETICLE_SWAY_BASE_RADIANS = 0.00035;
export const O2_RETICLE_SWAY_MAX_RADIANS = 0.012;
export const O2_WEAPON_SWAY_BASE_RADIANS = 0.0012;
export const O2_WEAPON_SWAY_MAX_RADIANS = 0.034;
export const O2_ACCURACY_PENALTY_MAX = 1.35;
export const O2_AIM_SWAY_FACTOR = 0.72;
/** Holding breath removes the reserve-driven aim drift while O₂ remains. */
export const O2_HOLD_BREATH_STABILITY_FACTOR = 0;
export const O2_HOLD_BREATH_ACCURACY_FACTOR = 0.2;

const clamp01 = (value: number): number =>
  Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;

/** Resolve smooth O₂-driven stability values for camera and weapon output. */
export const resolveO2Stability = (input: O2StabilityInput): O2StabilityResponse => {
  const oxygenRatio = clamp01(input.oxygenRatio);
  const breathlessness = 1 - oxygenRatio;
  const fatigue = breathlessness ** O2_STABILITY_CURVE_EXPONENT;
  const aimingDownSights = input.aimingDownSights === true;
  // The vitals model drops holdingBreath as soon as the reserve is empty.
  // Keep this boundary here too so callers cannot retain a free stabilised
  // reticle by passing a stale hold flag after O₂ reaches zero.
  const holdingBreath = input.holdingBreath === true && oxygenRatio > 0;
  const postureFactor = aimingDownSights ? O2_AIM_SWAY_FACTOR : 1;
  const breathControlFactor = holdingBreath ? O2_HOLD_BREATH_STABILITY_FACTOR : 1;
  const accuracyFatigue = holdingBreath ? fatigue * O2_HOLD_BREATH_ACCURACY_FACTOR : fatigue;

  return {
    oxygenRatio,
    breathlessness,
    reticleSwayRadians:
      (O2_RETICLE_SWAY_BASE_RADIANS + O2_RETICLE_SWAY_MAX_RADIANS * fatigue) *
      postureFactor *
      breathControlFactor,
    weaponSwayRadians:
      (O2_WEAPON_SWAY_BASE_RADIANS + O2_WEAPON_SWAY_MAX_RADIANS * fatigue) *
      postureFactor *
      breathControlFactor,
    accuracyMultiplier:
      1 + O2_ACCURACY_PENALTY_MAX * accuracyFatigue * (aimingDownSights ? 0.82 : 1),
  };
};
