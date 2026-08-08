import * as THREE from "three";

/** Duration of the visible shield shell pulse after absorbed damage. */
export const SIMULANT_SHIELD_FLARE_LIFETIME_SECONDS = 0.48;
/** The shell's lower edge fades to zero across this local-space band. */
export const SIMULANT_SHIELD_FLARE_BOTTOM_FADE_HEIGHT = 0.26;

/** Vertex stage for the target shield shell. */
export const SHIELD_FLARE_VERTEX_SHADER = /* glsl */ `
  varying vec3 vShieldNormal;
  varying vec3 vShieldViewDirection;
  varying float vShieldHeight;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vShieldNormal = normalize(mat3(modelMatrix) * normal);
    vShieldViewDirection = normalize(cameraPosition - worldPosition.xyz);
    vShieldHeight = position.y;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

/** Fragment stage for the warm white-orange shield flare. */
export const SHIELD_FLARE_FRAGMENT_SHADER = /* glsl */ `
  uniform float uFlare;
  uniform float uShieldRatio;
  uniform float uTime;
  uniform float uBottom;
  uniform float uHeight;

  varying vec3 vShieldNormal;
  varying vec3 vShieldViewDirection;
  varying float vShieldHeight;

  void main() {
    float heightRatio = clamp((vShieldHeight - uBottom) / max(uHeight, 0.0001), 0.0, 1.0);
    // The shield is intentionally transparent at the feet and grows upward.
    float bottomMask = smoothstep(0.0, 0.24, heightRatio);
    float facing = abs(dot(normalize(vShieldNormal), normalize(vShieldViewDirection)));
    float rim = pow(1.0 - facing, 1.35);
    float scan = 0.9 + 0.1 * sin((heightRatio * 18.0) - uTime * 9.0);
    float flare = clamp(uFlare, 0.0, 1.0);
    float shield = clamp(uShieldRatio, 0.0, 1.0);
    float peak = clamp(flare * 0.82 + shield * 0.18, 0.0, 1.0);
    vec3 orange = vec3(1.0, 0.28, 0.035);
    vec3 warmWhite = vec3(1.0, 0.92, 0.7);
    vec3 colour = mix(orange, warmWhite, peak);
    float intensity = flare * (0.42 + shield * 0.58);
    float alpha = intensity * bottomMask * (0.22 + rim * 0.78) * scan;
    gl_FragColor = vec4(colour, alpha);
  }
`;

interface ShieldFlareUniforms {
  readonly uFlare: { value: number };
  readonly uShieldRatio: { value: number };
  readonly uTime: { value: number };
  readonly uBottom: { value: number };
  readonly uHeight: { value: number };
}

const getUniforms = (material: THREE.ShaderMaterial): ShieldFlareUniforms =>
  material.uniforms as unknown as ShieldFlareUniforms;

const clamp01 = (value: number): number =>
  Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;

/** Resolve the linear pulse envelope, bright at impact and clear at expiry. */
export const resolveShieldFlareOpacity = (remainingSeconds: number): number =>
  clamp01(remainingSeconds / SIMULANT_SHIELD_FLARE_LIFETIME_SECONDS);

/** Normalize the current shield reserve for the shader's colour/intensity mix. */
export const resolveShieldFlareShieldRatio = (shield: number, maximumShield: number): number =>
  clamp01(shield / Math.max(0.0001, Number.isFinite(maximumShield) ? maximumShield : 1));

/** Build the transparent shell material once for the simulant body. */
export const createShieldFlareMaterial = (): THREE.ShaderMaterial =>
  new THREE.ShaderMaterial({
    name: "SimulantShieldFlareShader",
    uniforms: {
      uFlare: { value: 0 },
      uShieldRatio: { value: 1 },
      uTime: { value: 0 },
      uBottom: { value: -0.57 },
      uHeight: { value: 1.14 },
    },
    vertexShader: SHIELD_FLARE_VERTEX_SHADER,
    fragmentShader: SHIELD_FLARE_FRAGMENT_SHADER,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });

/** Update the live shield reserve, pulse, and animated scanline uniforms. */
export const updateShieldFlareMaterial = (
  material: THREE.ShaderMaterial,
  shield: number,
  maximumShield: number,
  remainingSeconds: number,
  elapsedSeconds: number,
): void => {
  const uniforms = getUniforms(material);
  uniforms.uFlare.value = resolveShieldFlareOpacity(remainingSeconds);
  uniforms.uShieldRatio.value = resolveShieldFlareShieldRatio(shield, maximumShield);
  uniforms.uTime.value = Number.isFinite(elapsedSeconds) ? Math.max(0, elapsedSeconds) : 0;
};
