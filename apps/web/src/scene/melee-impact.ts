import * as THREE from "three";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";

/** Damage at or above this value produces a fully white impact frame. */
export const MELEE_IMPACT_MAX_DAMAGE = 200;

/** Keep the white hit signal readable without hiding the scene for too long. */
export const MELEE_IMPACT_FLASH_DURATION_SECONDS = 0.42;

/** Hold the stronger depth-of-field response briefly after a melee hit. */
export const MELEE_IMPACT_DOF_BOOST_DURATION_SECONDS = 5;

/** Make the hit-induced depth-of-field response visibly obvious. */
export const MELEE_IMPACT_DOF_INTENSITY_MULTIPLIER = 2;

/** Maximum temporary near-focus shift produced by a melee hit. */
export const MELEE_IMPACT_MAX_FOCUS_SHIFT_METERS = 4;

/** A maximum melee impact intentionally drives the focus plane to zero. */
export const MELEE_IMPACT_MIN_FOCUS_DISTANCE_METERS = 0;

/** Convert applied melee damage to the requested white-screen opacity. */
export const resolveMeleeImpactFlashOpacity = (damage: number): number => {
  if (!Number.isFinite(damage) || damage <= 0) {
    return 0;
  }
  return THREE.MathUtils.clamp(damage / MELEE_IMPACT_MAX_DAMAGE, 0, 1);
};

/** Resolve the temporary near-focus shift. The same 200-point cap is used. */
export const resolveMeleeImpactFocusShiftMeters = (damage: number): number =>
  resolveMeleeImpactFlashOpacity(damage) * MELEE_IMPACT_MAX_FOCUS_SHIFT_METERS;

/** Move the focus plane toward zero in proportion to the capped hit severity. */
export const resolveMeleeImpactFocusDistance = (
  baseDistance: number,
  focusSeverity: number,
): number => {
  const safeBaseDistance = Number.isFinite(baseDistance) ? Math.max(0, baseDistance) : 12;
  const safeSeverity = Number.isFinite(focusSeverity)
    ? THREE.MathUtils.clamp(focusSeverity, 0, 1)
    : 0;
  return THREE.MathUtils.lerp(
    safeBaseDistance,
    MELEE_IMPACT_MIN_FOCUS_DISTANCE_METERS,
    safeSeverity,
  );
};

/** Fade one impact pulse without changing the opacity assigned to later hits. */
export const resolveMeleeImpactFlashOpacityAtTime = (
  initialOpacity: number,
  elapsedSeconds: number,
): number => {
  const opacity = Number.isFinite(initialOpacity) ? THREE.MathUtils.clamp(initialOpacity, 0, 1) : 0;
  const elapsed = Number.isFinite(elapsedSeconds) ? Math.max(0, elapsedSeconds) : 0;
  return opacity * Math.max(0, 1 - elapsed / MELEE_IMPACT_FLASH_DURATION_SECONDS);
};

export const MELEE_IMPACT_FLASH_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/** Blend the rendered frame toward display white while keeping the pulse linear. */
export const MELEE_IMPACT_FLASH_FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform float uOpacity;

  varying vec2 vUv;

  void main() {
    vec4 color = texture2D(tDiffuse, vUv);
    float opacity = clamp(uOpacity, 0.0, 1.0);
    gl_FragColor = vec4(mix(color.rgb, vec3(1.0), opacity), color.a);
  }
`;

export const createMeleeImpactFlashPass = (damage: number): ShaderPass =>
  new ShaderPass({
    name: "MeleeImpactFlash",
    uniforms: {
      tDiffuse: { value: null },
      uOpacity: { value: resolveMeleeImpactFlashOpacity(damage) },
    },
    vertexShader: MELEE_IMPACT_FLASH_VERTEX_SHADER,
    fragmentShader: MELEE_IMPACT_FLASH_FRAGMENT_SHADER,
  });

export const setMeleeImpactFlashOpacity = (pass: ShaderPass, opacity: number): void => {
  const uniform = pass.uniforms.uOpacity;
  if (typeof uniform?.value === "number") {
    uniform.value = Number.isFinite(opacity) ? THREE.MathUtils.clamp(opacity, 0, 1) : 0;
  }
  pass.enabled = Number.isFinite(opacity) && opacity > 0.0001;
};
