import * as THREE from "three";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";

/** Vertex stage for the small, fatigue-only full-screen blur. */
export const O2_BLUR_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * A nine-tap Gaussian-shaped blur and black radial vignette. The blur uniform
 * is in physical pixels, so the scene can keep its requested one-pixel normal
 * view and two-pixel zoom maximum on standard and high density displays. The
 * vignette is applied in scene-linear space before OutputPass.
 */
export const O2_BLUR_FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform vec2 uResolution;
  uniform vec2 uVignetteCenter;
  uniform float uBlurPixels;
  uniform float uVignetteStrength;

  varying vec2 vUv;

  void main() {
    vec2 blurStep = uBlurPixels / max(uResolution, vec2(1.0));
    vec4 color = texture2D(tDiffuse, vUv) * 0.25;
    color += texture2D(tDiffuse, vUv + vec2( blurStep.x, 0.0)) * 0.125;
    color += texture2D(tDiffuse, vUv + vec2(-blurStep.x, 0.0)) * 0.125;
    color += texture2D(tDiffuse, vUv + vec2(0.0,  blurStep.y)) * 0.125;
    color += texture2D(tDiffuse, vUv + vec2(0.0, -blurStep.y)) * 0.125;
    color += texture2D(tDiffuse, vUv + vec2( blurStep.x,  blurStep.y)) * 0.0625;
    color += texture2D(tDiffuse, vUv + vec2(-blurStep.x,  blurStep.y)) * 0.0625;
    color += texture2D(tDiffuse, vUv + vec2( blurStep.x, -blurStep.y)) * 0.0625;
    color += texture2D(tDiffuse, vUv + vec2(-blurStep.x, -blurStep.y)) * 0.0625;
    float aspect = uResolution.x / max(uResolution.y, 1.0);
    vec2 centeredUv = vUv - uVignetteCenter;
    centeredUv.x *= aspect;
    float radialDistance = length(centeredUv);
    vec2 farthestCorner = vec2(
      max(uVignetteCenter.x, 1.0 - uVignetteCenter.x) * aspect,
      max(uVignetteCenter.y, 1.0 - uVignetteCenter.y)
    );
    float cornerDistance = length(farthestCorner);
    float normalizedDistance = clamp(radialDistance / max(cornerDistance, 0.0001), 0.0, 1.0);

    // Ease from the reticule point to the corners. Normalizing against the
    // farthest corner removes the fixed-radius ring that was visible on some
    // aspect ratios and keeps the falloff continuous through the origin.
    float radialGradient = smoothstep(0.0, 1.0, normalizedDistance);
    float vignette = radialGradient * radialGradient;

    // Add deterministic interleaved-gradient noise only inside the transition
    // band. This breaks 8-bit colour steps without adding visible grain to the
    // untouched centre or the fully blended edge.
    float dither = fract(
      52.9829189 * fract(0.06711056 * gl_FragCoord.x + 0.00583715 * gl_FragCoord.y)
    ) - 0.5;
    float ditherWeight = radialGradient * (1.0 - radialGradient);
    float vignetteBlend = clamp(
      vignette * uVignetteStrength + dither * (1.0 / 255.0) * ditherWeight * uVignetteStrength,
      0.0,
      1.0
    );
    color.rgb = mix(color.rgb, vec3(0.0), vignetteBlend);
    gl_FragColor = color;
  }
`;

const getUniforms = (pass: ShaderPass): Record<string, { value?: unknown } | undefined> =>
  pass.uniforms;

/** Create the pass once and update its size and radius as the viewport changes. */
export const createO2BlurPass = (): ShaderPass =>
  new ShaderPass({
    name: "O2FatigueBlur",
    uniforms: {
      tDiffuse: { value: null },
      uResolution: { value: new THREE.Vector2(1, 1) },
      // The default matches the reticule's 50% horizontal / 60% top offset.
      uVignetteCenter: { value: new THREE.Vector2(0.5, 0.4) },
      uBlurPixels: { value: 0 },
      uVignetteStrength: { value: 0 },
    },
    vertexShader: O2_BLUR_VERTEX_SHADER,
    fragmentShader: O2_BLUR_FRAGMENT_SHADER,
  });

export const setO2BlurPassSize = (pass: ShaderPass, width: number, height: number): void => {
  const resolution = getUniforms(pass).uResolution?.value;
  if (resolution instanceof THREE.Vector2) {
    resolution.set(Math.max(1, width), Math.max(1, height));
  }
};

/** Keep the vignette origin aligned with the live reticule in screen UV space. */
export const setO2BlurPassCenter = (pass: ShaderPass, x: number, y: number): void => {
  const center = getUniforms(pass).uVignetteCenter?.value;
  if (center instanceof THREE.Vector2) {
    center.set(
      Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0.5,
      Number.isFinite(y) ? Math.min(1, Math.max(0, y)) : 0.4,
    );
  }
};

export const setO2BlurPassPixels = (pass: ShaderPass, blurPixels: number): void => {
  const uniforms = getUniforms(pass);
  const normalizedPixels = Number.isFinite(blurPixels) ? Math.max(0, blurPixels) : 0;
  if (typeof uniforms.uBlurPixels?.value === "number") {
    uniforms.uBlurPixels.value = normalizedPixels;
  }
  pass.enabled = normalizedPixels > 0.001;
};

export const setO2BlurPassVignette = (pass: ShaderPass, strength: number): void => {
  const uniform = getUniforms(pass).uVignetteStrength;
  if (typeof uniform?.value === "number") {
    uniform.value = Number.isFinite(strength) ? Math.min(1, Math.max(0, strength)) : 0;
  }
};
