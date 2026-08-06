import * as THREE from "three";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";

/** The optical power of the prototype sniper scope. */
export const SNIPER_SCOPE_MAGNIFICATION = 5;
/** Default lens radius used before the camera projects the real glass. */
export const SNIPER_SCOPE_DEFAULT_RADIUS = 0.18;
export const SNIPER_SCOPE_FEATHER = 0.018;
/** Render the square scope feed above its final lens diameter for crisp decals. */
export const SNIPER_SCOPE_RENDER_SUPERSAMPLE = 2;
export const SNIPER_SCOPE_MIN_RENDER_SIZE = 256;
export const SNIPER_SCOPE_MAX_RENDER_SIZE = 2048;

export interface SniperScopeProjection {
  readonly enabled: boolean;
  /** Lens centre in post-process UV coordinates (origin at the lower-left). */
  readonly center: {
    readonly x: number;
    readonly y: number;
  };
  /** Lens radius in UV units, measured vertically. */
  readonly radius: number;
  readonly resolution: {
    readonly x: number;
    readonly y: number;
  };
  /** Pixel dimensions of the square, tight-FOV world feed. */
  readonly sceneResolution: {
    readonly x: number;
    readonly y: number;
  };
  readonly magnification: number;
  readonly feather: number;
  readonly blend: number;
}

export interface ResolveSniperScopeProjectionInput {
  readonly enabled: boolean;
  readonly camera: THREE.PerspectiveCamera;
  readonly lensAnchor: THREE.Object3D | null;
  /** Radius of the scope glass in the anchor's local X/Y plane, in metres. */
  readonly lensRadius: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  /** Optional 0–1 transition amount for crouch presentation. */
  readonly blend?: number;
}

export interface SniperScopeActivationInput {
  readonly firstPersonActive: boolean;
  readonly seatView: boolean;
  readonly aimingDownSights: boolean;
  readonly lensAvailable: boolean;
}

/** The scope follows explicit zoom; crouching alone never activates the optic. */
export const shouldEnableSniperScope = (input: SniperScopeActivationInput): boolean =>
  input.firstPersonActive && input.seatView && input.aimingDownSights && input.lensAvailable;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : 0));

/**
 * Derive the vertical FOV for the hidden scope camera. Scaling the tangent,
 * rather than dividing degrees, preserves the same optical magnification at
 * every player FOV and gives the shader real geometry detail to resample.
 */
export const resolveSniperScopeCameraFov = (
  baseFov: number,
  magnification: number = SNIPER_SCOPE_MAGNIFICATION,
): number => {
  const safeFov = clamp(baseFov, 0.1, 179.9);
  const safeMagnification = Math.max(1, Number.isFinite(magnification) ? magnification : 1);
  return THREE.MathUtils.radToDeg(
    2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(safeFov) * 0.5) / safeMagnification),
  );
};

/** Keep weapon/UI overlays out of the scope feed while retaining world decals. */
export const shouldRenderSniperScopeObject = (
  userData: Readonly<Record<string, unknown>>,
  isSprite: boolean,
): boolean => {
  if (isSprite) {
    return false;
  }
  if (userData.bulletHoleRoot === true || userData.bulletHole === true) {
    return true;
  }
  return userData.weaponVisual !== true;
};

const safeViewportDimension = (value: number): number =>
  Math.max(1, Number.isFinite(value) ? value : 1);

const disabledProjection = (width: number, height: number): SniperScopeProjection => ({
  enabled: false,
  center: { x: 0.5, y: 0.5 },
  radius: SNIPER_SCOPE_DEFAULT_RADIUS,
  resolution: { x: width, y: height },
  sceneResolution: { x: 1, y: 1 },
  magnification: SNIPER_SCOPE_MAGNIFICATION,
  feather: SNIPER_SCOPE_FEATHER,
  blend: 0,
});

/**
 * Project the actual camera-child glass into the post-process buffer.
 *
 * The shader only magnifies pixels inside this projected circle. Keeping the
 * projection tied to the lens object means the effect follows viewmodel sway,
 * recoil, reloads, and the off-axis reticule zoom without inventing another
 * aim transform.
 */
export const resolveSniperScopeProjection = (
  input: ResolveSniperScopeProjectionInput,
): SniperScopeProjection => {
  const width = safeViewportDimension(input.viewportWidth);
  const height = safeViewportDimension(input.viewportHeight);
  const blend = clamp(input.blend ?? (input.enabled ? 1 : 0), 0, 1);
  if (!input.enabled || input.lensAnchor === null || blend <= 0) {
    return disabledProjection(width, height);
  }

  const radius = Math.max(
    0.001,
    Number.isFinite(input.lensRadius) ? Math.abs(input.lensRadius) : 0.001,
  );
  const centerWorld = input.lensAnchor.getWorldPosition(new THREE.Vector3());
  const edgeWorld = input.lensAnchor.localToWorld(new THREE.Vector3(radius, 0, 0));
  const centerNdc = centerWorld.project(input.camera);
  const edgeNdc = edgeWorld.project(input.camera);
  const centerX = Number.isFinite(centerNdc.x) ? (centerNdc.x + 1) * 0.5 : 0.5;
  const centerY = Number.isFinite(centerNdc.y) ? (centerNdc.y + 1) * 0.5 : 0.5;
  // NDC spans two units while post-process UVs span one. Measure the radius in
  // the same aspect-corrected metric used by the fragment shader so the mask
  // remains circular under both portrait and landscape viewports.
  const viewportAspect = width / height;
  const projectedRadius =
    Math.hypot((edgeNdc.x - centerNdc.x) * 0.5 * viewportAspect, (edgeNdc.y - centerNdc.y) * 0.5) ||
    SNIPER_SCOPE_DEFAULT_RADIUS;
  const resolvedRadius = clamp(
    Number.isFinite(projectedRadius) ? projectedRadius : SNIPER_SCOPE_DEFAULT_RADIUS,
    0.045,
    0.34,
  );
  const sceneSize = clamp(
    Math.ceil(resolvedRadius * 2 * height * SNIPER_SCOPE_RENDER_SUPERSAMPLE),
    SNIPER_SCOPE_MIN_RENDER_SIZE,
    SNIPER_SCOPE_MAX_RENDER_SIZE,
  );

  return {
    enabled: true,
    center: {
      x: clamp(centerX, -0.5, 1.5),
      y: clamp(centerY, -0.5, 1.5),
    },
    radius: resolvedRadius,
    resolution: { x: width, y: height },
    sceneResolution: { x: sceneSize, y: sceneSize },
    magnification: SNIPER_SCOPE_MAGNIFICATION,
    feather: SNIPER_SCOPE_FEATHER,
    blend,
  };
};

/** Vertex stage for the full-screen sniper-lens pass. */
export const SNIPER_SCOPE_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * A screen-space optical lens. `uScopeCenter` comes from the real glass mesh;
 * samples nearer the centre therefore cover a smaller source area and appear
 * magnified, while the feathered edge preserves the scope rim and DOF image.
 */
export const SNIPER_SCOPE_FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform sampler2D uScopeScene;
  uniform vec2 uScopeCenter;
  uniform vec2 uScopeResolution;
  uniform vec2 uScopeSceneResolution;
  uniform float uScopeRadius;
  uniform float uMagnification;
  uniform float uFeather;
  uniform float uBlend;

  varying vec2 vUv;

  vec4 scopeCubicWeights(float value) {
    float value2 = value * value;
    float value3 = value2 * value;
    return vec4(
      -0.5 * value + value2 - 0.5 * value3,
      1.0 - 2.5 * value2 + 1.5 * value3,
      0.5 * value + 2.0 * value2 - 1.5 * value3,
      -0.5 * value2 + 0.5 * value3
    );
  }

  /** Catmull-Rom reconstruction keeps the tight-FOV render sharp in the lens. */
  vec4 scopeBicubicSample(sampler2D source, vec2 uv, vec2 resolution) {
    vec2 texelSize = 1.0 / max(resolution, vec2(1.0));
    vec2 coord = uv / texelSize - 0.5;
    vec2 base = floor(coord);
    vec2 fraction = coord - base;
    vec4 weightsX = scopeCubicWeights(fraction.x);
    vec4 weightsY = scopeCubicWeights(fraction.y);
    vec2 origin = (base + vec2(-1.0, -1.0) + 0.5) * texelSize;
    vec2 xStep = vec2(texelSize.x, 0.0);
    vec2 yStep = vec2(0.0, texelSize.y);
    vec2 low = vec2(0.0);
    vec2 high = vec2(1.0);
    vec4 row0 =
      texture2D(source, clamp(origin, low, high)) * weightsX.x +
      texture2D(source, clamp(origin + xStep, low, high)) * weightsX.y +
      texture2D(source, clamp(origin + xStep * 2.0, low, high)) * weightsX.z +
      texture2D(source, clamp(origin + xStep * 3.0, low, high)) * weightsX.w;
    vec4 row1 =
      texture2D(source, clamp(origin + yStep, low, high)) * weightsX.x +
      texture2D(source, clamp(origin + yStep + xStep, low, high)) * weightsX.y +
      texture2D(source, clamp(origin + yStep + xStep * 2.0, low, high)) * weightsX.z +
      texture2D(source, clamp(origin + yStep + xStep * 3.0, low, high)) * weightsX.w;
    vec4 row2 =
      texture2D(source, clamp(origin + yStep * 2.0, low, high)) * weightsX.x +
      texture2D(source, clamp(origin + yStep * 2.0 + xStep, low, high)) * weightsX.y +
      texture2D(source, clamp(origin + yStep * 2.0 + xStep * 2.0, low, high)) * weightsX.z +
      texture2D(source, clamp(origin + yStep * 2.0 + xStep * 3.0, low, high)) * weightsX.w;
    vec4 row3 =
      texture2D(source, clamp(origin + yStep * 3.0, low, high)) * weightsX.x +
      texture2D(source, clamp(origin + yStep * 3.0 + xStep, low, high)) * weightsX.y +
      texture2D(source, clamp(origin + yStep * 3.0 + xStep * 2.0, low, high)) * weightsX.z +
      texture2D(source, clamp(origin + yStep * 3.0 + xStep * 3.0, low, high)) * weightsX.w;
    return row0 * weightsY.x + row1 * weightsY.y + row2 * weightsY.z + row3 * weightsY.w;
  }

  void main() {
    vec4 baseSample = texture2D(tDiffuse, vUv);
    vec2 delta = vUv - uScopeCenter;
    float aspect = uScopeResolution.x / max(uScopeResolution.y, 1.0);
    vec2 lensDelta = vec2(delta.x * aspect, delta.y);
    float distanceFromCentre = length(lensDelta);
    float lensMask = 1.0 - smoothstep(
      max(0.0, uScopeRadius - uFeather),
      uScopeRadius,
      distanceFromCentre
    );
    float blend = lensMask * clamp(uBlend, 0.0, 1.0);
    if (blend <= 0.0001) {
      gl_FragColor = baseSample;
      return;
    }

    // The hidden scope camera already renders the world at the tighter FOV.
    // Map that full-resolution feed into the projected glass instead of
    // stretching a few low-resolution player-viewport pixels.
    vec2 scopeUv = vec2(
      0.5 + lensDelta.x / max(2.0 * uScopeRadius, 0.001),
      0.5 + lensDelta.y / max(2.0 * uScopeRadius, 0.001)
    );
    // A small radial colour split sells the curved glass without changing the
    // ray used by the weapon or exposing another gameplay camera.
    vec2 aberration = normalize(lensDelta + vec2(0.00001)) * 0.0016 *
      smoothstep(0.0, max(uScopeRadius, 0.001), distanceFromCentre);
    vec3 magnifiedSample = vec3(
      scopeBicubicSample(
        uScopeScene,
        clamp(scopeUv + vec2(aberration.x / aspect, aberration.y), 0.0, 1.0),
        uScopeSceneResolution
      ).r,
      scopeBicubicSample(uScopeScene, clamp(scopeUv, 0.0, 1.0), uScopeSceneResolution).g,
      scopeBicubicSample(
        uScopeScene,
        clamp(scopeUv - vec2(aberration.x / aspect, aberration.y), 0.0, 1.0),
        uScopeSceneResolution
      ).b
    );
    float edge = smoothstep(0.55 * uScopeRadius, uScopeRadius, distanceFromCentre);
    magnifiedSample *= 1.0 - edge * 0.28;

    // Fine cyan X marks are deliberately inside the sampled lens and do not
    // replace the app's reticule or the weapon's authoritative aim ray.
    float lineWidth = max(0.0014, uScopeRadius * 0.018);
    float diagonalDown = 1.0 - smoothstep(
      lineWidth,
      lineWidth * 1.8,
      abs(lensDelta.y - lensDelta.x)
    );
    float diagonalUp = 1.0 - smoothstep(
      lineWidth,
      lineWidth * 1.8,
      abs(lensDelta.y + lensDelta.x)
    );
    float scopeMarks = max(diagonalDown, diagonalUp) *
      step(distanceFromCentre, uScopeRadius * 0.86) * 0.48 * clamp(uBlend, 0.0, 1.0);
    vec3 withMarks = mix(magnifiedSample, vec3(0.36, 0.92, 1.0), scopeMarks);

    gl_FragColor = vec4(mix(baseSample.rgb, withMarks, blend), baseSample.a);
  }
`;

/** Create the pass once and update its uniforms from the live lens projection. */
export const createSniperScopePass = (): ShaderPass =>
  new ShaderPass({
    name: "SniperScopeLensShader",
    uniforms: {
      tDiffuse: { value: null },
      uScopeScene: { value: null },
      uScopeCenter: { value: new THREE.Vector2(0.5, 0.5) },
      uScopeResolution: { value: new THREE.Vector2(1, 1) },
      uScopeSceneResolution: { value: new THREE.Vector2(1, 1) },
      uScopeRadius: { value: SNIPER_SCOPE_DEFAULT_RADIUS },
      uMagnification: { value: SNIPER_SCOPE_MAGNIFICATION },
      uFeather: { value: SNIPER_SCOPE_FEATHER },
      uBlend: { value: 0 },
    },
    vertexShader: SNIPER_SCOPE_VERTEX_SHADER,
    fragmentShader: SNIPER_SCOPE_FRAGMENT_SHADER,
  });

export const applySniperScopeProjection = (
  pass: ShaderPass,
  projection: SniperScopeProjection,
): void => {
  pass.enabled = projection.enabled;
  const uniforms = pass.uniforms as unknown as Record<string, { value?: unknown } | undefined>;
  const centerUniform = uniforms.uScopeCenter;
  const resolutionUniform = uniforms.uScopeResolution;
  const sceneResolutionUniform = uniforms.uScopeSceneResolution;
  const radiusUniform = uniforms.uScopeRadius;
  const magnificationUniform = uniforms.uMagnification;
  const featherUniform = uniforms.uFeather;
  const blendUniform = uniforms.uBlend;
  const center = centerUniform?.value;
  const resolution = resolutionUniform?.value;
  if (center instanceof THREE.Vector2) {
    center.set(projection.center.x, projection.center.y);
  }
  if (resolution instanceof THREE.Vector2) {
    resolution.set(projection.resolution.x, projection.resolution.y);
  }
  const sceneResolution = sceneResolutionUniform?.value;
  if (sceneResolution instanceof THREE.Vector2) {
    sceneResolution.set(projection.sceneResolution.x, projection.sceneResolution.y);
  }
  if (typeof radiusUniform?.value === "number") {
    radiusUniform.value = projection.radius;
  }
  if (typeof magnificationUniform?.value === "number") {
    magnificationUniform.value = projection.magnification;
  }
  if (typeof featherUniform?.value === "number") {
    featherUniform.value = projection.feather;
  }
  if (typeof blendUniform?.value === "number") {
    blendUniform.value = projection.blend;
  }
};

export const setSniperScopeSceneTexture = (pass: ShaderPass, texture: THREE.Texture): void => {
  const uniforms = pass.uniforms as unknown as Record<string, { value?: unknown } | undefined>;
  const scopeSceneUniform = uniforms.uScopeScene;
  if (scopeSceneUniform?.value !== undefined) {
    scopeSceneUniform.value = texture;
  }
};
