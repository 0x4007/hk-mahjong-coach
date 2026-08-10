import clipAsset from "./motionbricks-clip-data.json" with { type: "json" };

export type MotionBricksVector3 = readonly [number, number, number];

export interface MotionBricksClipFrame {
  readonly pelvis: MotionBricksVector3;
  readonly leftHip: MotionBricksVector3;
  readonly leftKnee: MotionBricksVector3;
  readonly leftAnkle: MotionBricksVector3;
  readonly leftShoulder: MotionBricksVector3;
  readonly leftElbow: MotionBricksVector3;
  readonly leftHand: MotionBricksVector3;
  readonly rightHip: MotionBricksVector3;
  readonly rightKnee: MotionBricksVector3;
  readonly rightAnkle: MotionBricksVector3;
  readonly rightShoulder: MotionBricksVector3;
  readonly rightElbow: MotionBricksVector3;
  readonly rightHand: MotionBricksVector3;
  readonly waist: MotionBricksVector3;
}

export interface MotionBricksClip {
  readonly frameCount: number;
  readonly frames: readonly MotionBricksClipFrame[];
}

export type MotionBricksClipName =
  | "idle"
  | "slow_walk"
  | "walk"
  | "hand_crawling"
  | "walk_boxing"
  | "elbow_crawling"
  | "stealth_walk"
  | "injured_walk"
  | "walk_stealth"
  | "walk_happy_dance"
  | "walk_zombie"
  | "walk_gun"
  | "walk_scared"
  | "walk_left"
  | "walk_right";

export interface MotionBricksClipAsset {
  readonly source: {
    readonly repository: string;
    readonly subproject: string;
    readonly commit: string;
    readonly checkpoint: string;
    readonly checkpointOid: string;
    readonly skeleton: string;
    readonly representation: string;
  };
  readonly fps: number;
  readonly jointOrder: readonly string[];
  readonly clips: Readonly<Record<MotionBricksClipName, MotionBricksClip>>;
}

export interface MotionBricksSample extends MotionBricksClipFrame {
  readonly rootHeightOffset: number;
}

const asset = clipAsset as unknown as MotionBricksClipAsset;

export const MOTIONBRICKS_SOURCE = asset.source;
export const MOTIONBRICKS_FPS = asset.fps;

const finite = (value: number, fallback = 0): number => (Number.isFinite(value) ? value : fallback);

const positiveModulo = (value: number, divisor: number): number => {
  const remainder = value % divisor;
  return remainder < 0 ? remainder + divisor : remainder;
};

const interpolate = (
  from: MotionBricksVector3,
  to: MotionBricksVector3,
  amount: number,
): MotionBricksVector3 => [
  from[0] + (to[0] - from[0]) * amount,
  from[1] + (to[1] - from[1]) * amount,
  from[2] + (to[2] - from[2]) * amount,
];

const interpolateFrame = (
  from: MotionBricksClipFrame,
  to: MotionBricksClipFrame,
  amount: number,
): MotionBricksClipFrame => ({
  pelvis: interpolate(from.pelvis, to.pelvis, amount),
  leftHip: interpolate(from.leftHip, to.leftHip, amount),
  leftKnee: interpolate(from.leftKnee, to.leftKnee, amount),
  leftAnkle: interpolate(from.leftAnkle, to.leftAnkle, amount),
  leftShoulder: interpolate(from.leftShoulder, to.leftShoulder, amount),
  leftElbow: interpolate(from.leftElbow, to.leftElbow, amount),
  leftHand: interpolate(from.leftHand, to.leftHand, amount),
  rightHip: interpolate(from.rightHip, to.rightHip, amount),
  rightKnee: interpolate(from.rightKnee, to.rightKnee, amount),
  rightAnkle: interpolate(from.rightAnkle, to.rightAnkle, amount),
  rightShoulder: interpolate(from.rightShoulder, to.rightShoulder, amount),
  rightElbow: interpolate(from.rightElbow, to.rightElbow, amount),
  rightHand: interpolate(from.rightHand, to.rightHand, amount),
  waist: interpolate(from.waist, to.waist, amount),
});

/** Sample a loop from the exported MotionBricks G1 playback checkpoint. */
export const sampleMotionBricksClip = (
  name: MotionBricksClipName,
  phaseSeconds: number,
  playbackRate = 1,
): MotionBricksSample => {
  const clip = asset.clips[name];
  if (clip.frames.length === 0 || clip.frameCount <= 0) {
    throw new Error(`MotionBricks clip ${name} has no frames`);
  }
  const frameCount = Math.min(clip.frameCount, clip.frames.length);
  const safePhase = finite(phaseSeconds);
  const safeRate = finite(playbackRate, 1);
  const framePosition = positiveModulo(safePhase * MOTIONBRICKS_FPS * safeRate, frameCount);
  const frameIndex = Math.floor(framePosition);
  const nextFrameIndex = (frameIndex + 1) % frameCount;
  const amount = framePosition - frameIndex;
  const firstFrame = clip.frames[0];
  if (firstFrame === undefined) {
    throw new Error(`MotionBricks clip ${name} has no first frame`);
  }
  const fromFrame = clip.frames[frameIndex] ?? firstFrame;
  const toFrame = clip.frames[nextFrameIndex] ?? firstFrame;
  const frame = interpolateFrame(fromFrame, toFrame, amount);
  return {
    ...frame,
    rootHeightOffset: frame.pelvis[1] - firstFrame.pelvis[1],
  };
};
