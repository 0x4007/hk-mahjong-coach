import { describe, expect, it } from "vitest";
import { FpsTransportTelemetry } from "./telemetry.js";

describe("FPS transport telemetry", () => {
  it("summarizes RTT, jitter, sequence gaps, resyncs, and corrections", () => {
    const telemetry = new FpsTransportTelemetry();
    telemetry.recordRtt(40);
    telemetry.recordRtt(50);
    telemetry.recordRtt(44);
    telemetry.recordServerSequence(0);
    telemetry.recordServerSequence(2);
    telemetry.recordServerSequence(2);
    telemetry.recordServerSequence(3);
    telemetry.recordResyncRequest();
    telemetry.recordCorrectionDistance(1.5);
    telemetry.recordCorrectionDistance(0.5);

    expect(telemetry.snapshot()).toEqual({
      rttMs: 44,
      jitterMs: 8,
      serverFramesReceived: 3,
      serverSequenceGaps: 1,
      serverPacketLossPercent: 25,
      resyncRequests: 1,
      correctionCount: 2,
      averageCorrectionDistance: 1,
      maxCorrectionDistance: 1.5,
    });
  });

  it("ignores invalid samples and clears all state on reset", () => {
    const telemetry = new FpsTransportTelemetry();
    telemetry.recordRtt(Number.NaN);
    telemetry.recordServerSequence(-1);
    telemetry.recordServerSequence(Number.MAX_SAFE_INTEGER + 1);
    telemetry.recordCorrectionDistance(-1);
    expect(telemetry.snapshot()).toMatchObject({
      rttMs: null,
      jitterMs: null,
      serverFramesReceived: 0,
      serverSequenceGaps: 0,
      correctionCount: 0,
    });

    telemetry.recordRtt(10);
    telemetry.recordServerSequence(2);
    telemetry.recordResyncRequest();
    telemetry.reset();
    expect(telemetry.snapshot()).toEqual({
      rttMs: null,
      jitterMs: null,
      serverFramesReceived: 0,
      serverSequenceGaps: 0,
      serverPacketLossPercent: 0,
      resyncRequests: 0,
      correctionCount: 0,
      averageCorrectionDistance: 0,
      maxCorrectionDistance: 0,
    });
  });
});
