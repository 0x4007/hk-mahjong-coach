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
  /** Whether the player is currently zoomed. */
  readonly aimingDownSights?: boolean;
  /** Whether the player is currently holding breath. */
  readonly holdingBreath?: boolean;
  /** Whether the crouched posture is providing free aim support. */
  readonly crouching?: boolean;
  /** Whether a wall is providing free aim and breathing support. */
  readonly stabilizedByWall?: boolean;
}

export interface O2StabilityResponse {
  readonly oxygenRatio: number;
  /** Smooth fatigue value used by all presentation effects. */
  readonly breathlessness: number;
  /** Full-screen fatigue blur radius in CSS pixels before device-pixel scaling. */
  readonly screenBlurPixels: number;
  /** Radial vignette strength for the low-O₂ vision effect. */
  readonly screenVignetteStrength: number;
  /** Multiplicative contrast response, kept neutral for the vignette effect. */
  readonly screenContrastMultiplier: number;
  /** Reticle angular sway amplitude in radians. */
  readonly reticleSwayRadians: number;
  /** Multiplicative weapon spread/accuracy response. */
  readonly accuracyMultiplier: number;
}

export const O2_STABILITY_CURVE_EXPONENT = 1.25;
/** Shared fatigue emphasis applied to every breathing-sway axis. */
export const O2_BREATHING_DESTABILIZATION_MULTIPLIER = 2;
/** Keep the exhausted normal view readable while still making zero O₂ noticeable. */
export const O2_SCREEN_BLUR_MAX_PIXELS = 1;
/** Zoom magnifies the fatigue response without changing the normal-view cap. */
export const O2_SCREEN_BLUR_ZOOM_MAX_PIXELS = 2;
/** Maximum radial vignette strength at complete O₂ depletion. */
export const O2_SCREEN_VIGNETTE_MAX_STRENGTH = 1;
/** Contrast remains neutral; low O₂ uses the vignette instead. */
export const O2_SCREEN_CONTRAST_MAX_MULTIPLIER = 1;
export const O2_RETICLE_SWAY_BASE_RADIANS = 0.00035;
export const O2_RETICLE_SWAY_MAX_RADIANS = 0.012;
export const O2_ACCURACY_PENALTY_MAX = 1.35;
/** Zoom keeps the same base sway as hip fire; crouch, breath, or wall support reduces it. */
export const O2_AIM_SWAY_FACTOR = 1;
/** Each free crouch/wall-brace or paid breath-control input leaves half of normal instability. */
export const O2_BRACED_STABILITY_FACTOR = 0.5;
export const O2_HOLD_BREATH_STABILITY_FACTOR = O2_BRACED_STABILITY_FACTOR;
export const O2_HOLD_BREATH_ACCURACY_FACTOR = O2_BRACED_STABILITY_FACTOR;
export const O2_CROUCH_STABILITY_FACTOR = O2_BRACED_STABILITY_FACTOR;
/** Wall bracing uses the same reduced instability as holding breath; the factors stack. */
export const O2_WALL_BRACE_STABILITY_FACTOR = O2_BRACED_STABILITY_FACTOR;

const clamp01 = (value: number): number =>
  Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;

/** Resolve smooth O₂-driven stability values for camera and weapon output. */
export const resolveO2Stability = (input: O2StabilityInput): O2StabilityResponse => {
  const oxygenRatio = clamp01(input.oxygenRatio);
  const breathlessness = 1 - oxygenRatio;
  const fatigue = breathlessness ** O2_STABILITY_CURVE_EXPONENT;
  const aimingDownSights = input.aimingDownSights === true;
  const screenBlurMaxPixels = aimingDownSights
    ? O2_SCREEN_BLUR_ZOOM_MAX_PIXELS
    : O2_SCREEN_BLUR_MAX_PIXELS;
  // The vitals model drops holdingBreath as soon as the reserve is empty.
  // Keep this boundary here too so callers cannot retain a paid stabilised
  // reticle by passing a stale hold flag after O₂ reaches zero. Wall support
  // is separate and remains free even when the reserve is empty.
  const holdingBreath = input.holdingBreath === true && oxygenRatio > 0;
  const crouching = input.crouching === true;
  const stabilizedByWall = input.stabilizedByWall === true;
  const postureFactor = aimingDownSights ? O2_AIM_SWAY_FACTOR : 1;
  const holdBreathStabilityFactor = holdingBreath ? O2_HOLD_BREATH_STABILITY_FACTOR : 1;
  const crouchStabilityFactor = crouching ? O2_CROUCH_STABILITY_FACTOR : 1;
  const wallBraceStabilityFactor = stabilizedByWall ? O2_WALL_BRACE_STABILITY_FACTOR : 1;
  const breathControlFactor =
    holdBreathStabilityFactor * crouchStabilityFactor * wallBraceStabilityFactor;
  const accuracyFatigue =
    fatigue *
    (holdingBreath ? O2_HOLD_BREATH_ACCURACY_FACTOR : 1) *
    (crouching ? O2_CROUCH_STABILITY_FACTOR : 1) *
    (stabilizedByWall ? O2_WALL_BRACE_STABILITY_FACTOR : 1);
  // Holding breath deliberately removes the reserve-driven breathing sway. O₂
  // still drains and the hold still releases at zero; only this presentation
  // destabilisation is suppressed so the control does not feed back on itself.
  const destabilization = holdingBreath ? 0 : fatigue * O2_BREATHING_DESTABILIZATION_MULTIPLIER;

  return {
    oxygenRatio,
    breathlessness,
    screenBlurPixels: screenBlurMaxPixels * fatigue,
    screenVignetteStrength: O2_SCREEN_VIGNETTE_MAX_STRENGTH * fatigue,
    screenContrastMultiplier: O2_SCREEN_CONTRAST_MAX_MULTIPLIER,
    reticleSwayRadians:
      (O2_RETICLE_SWAY_BASE_RADIANS * breathlessness +
        O2_RETICLE_SWAY_MAX_RADIANS * destabilization) *
      postureFactor *
      breathControlFactor,
    accuracyMultiplier:
      1 + O2_ACCURACY_PENALTY_MAX * accuracyFatigue * (aimingDownSights ? 0.82 : 1),
  };
};
