/**
 * Render-side transport diagnostics. These values are descriptive only; they never participate in
 * authoritative movement, hit detection, scoring, or replay state.
 */
export interface FpsTransportTelemetrySnapshot {
  readonly rttMs: number | null;
  readonly jitterMs: number | null;
  readonly serverFramesReceived: number;
  readonly serverSequenceGaps: number;
  readonly serverPacketLossPercent: number;
  readonly resyncRequests: number;
  readonly correctionCount: number;
  readonly averageCorrectionDistance: number;
  readonly maxCorrectionDistance: number;
}

const isFiniteNonNegative = (value: number): boolean => Number.isFinite(value) && value >= 0;

/** Collect bounded, redaction-safe client transport observations for the local diagnostics HUD. */
export class FpsTransportTelemetry {
  private lastRttMs: number | null = null;
  private jitterTotalMs = 0;
  private jitterSamples = 0;
  private lastServerSequence = -1;
  private serverFramesReceived = 0;
  private serverSequenceGaps = 0;
  private resyncRequests = 0;
  private correctionCount = 0;
  private correctionTotal = 0;
  private maxCorrectionDistance = 0;

  public recordRtt(rttMs: number): void {
    if (!isFiniteNonNegative(rttMs)) return;
    if (this.lastRttMs !== null) {
      this.jitterTotalMs += Math.abs(rttMs - this.lastRttMs);
      this.jitterSamples += 1;
    }
    this.lastRttMs = rttMs;
  }

  /** Record the transport envelope sequence, ignoring duplicates and stale frames. */
  public recordServerSequence(sequence: number): void {
    if (!Number.isSafeInteger(sequence) || sequence < 0) return;
    if (sequence <= this.lastServerSequence) return;
    if (this.lastServerSequence >= 0 && sequence > this.lastServerSequence + 1) {
      this.serverSequenceGaps += sequence - this.lastServerSequence - 1;
    }
    this.lastServerSequence = sequence;
    this.serverFramesReceived += 1;
  }

  public recordResyncRequest(): void {
    this.resyncRequests += 1;
  }

  public recordCorrectionDistance(distance: number): void {
    if (!isFiniteNonNegative(distance)) return;
    this.correctionCount += 1;
    this.correctionTotal += distance;
    this.maxCorrectionDistance = Math.max(this.maxCorrectionDistance, distance);
  }

  public snapshot(): FpsTransportTelemetrySnapshot {
    const observedFrames = this.serverFramesReceived + this.serverSequenceGaps;
    return {
      rttMs: this.lastRttMs,
      jitterMs: this.jitterSamples === 0 ? null : this.jitterTotalMs / this.jitterSamples,
      serverFramesReceived: this.serverFramesReceived,
      serverSequenceGaps: this.serverSequenceGaps,
      serverPacketLossPercent:
        observedFrames === 0 ? 0 : (this.serverSequenceGaps / observedFrames) * 100,
      resyncRequests: this.resyncRequests,
      correctionCount: this.correctionCount,
      averageCorrectionDistance:
        this.correctionCount === 0 ? 0 : this.correctionTotal / this.correctionCount,
      maxCorrectionDistance: this.maxCorrectionDistance,
    };
  }

  public reset(): void {
    this.lastRttMs = null;
    this.jitterTotalMs = 0;
    this.jitterSamples = 0;
    this.lastServerSequence = -1;
    this.serverFramesReceived = 0;
    this.serverSequenceGaps = 0;
    this.resyncRequests = 0;
    this.correctionCount = 0;
    this.correctionTotal = 0;
    this.maxCorrectionDistance = 0;
  }
}
