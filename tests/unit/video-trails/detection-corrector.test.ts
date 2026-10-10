
import { describe, it, expect } from "vitest";
import { applyCorrections } from "#lib/features/video/video-trails/services/detection-corrector.js";
import type { DetectedEndpoint, EndpointCorrection } from "#lib/features/video/video-trails/domain/types.js";

function makeEndpoint(overrides: Partial<DetectedEndpoint> = {}): DetectedEndpoint {
  return { x: 100, y: 100, brightness: 1, confidence: 0.9, propIndex: 0, tipIndex: 0, frameIndex: 5, ...overrides };
}

describe("DetectionCorrector", () => {
  it("returns original endpoints when no corrections exist", () => {
    const detected = [makeEndpoint()];
    const result = applyCorrections(5, detected, {});
    expect(result).toEqual(detected);
  });

  it("overrides position with corrected values", () => {
    const detected = [makeEndpoint({ x: 100, y: 100, propIndex: 0, tipIndex: 0 })];
    const corrections: Record<number, EndpointCorrection[]> = {
      5: [{ propIndex: 0, tipIndex: 0, detected: { x: 100, y: 100, confidence: 0.9 }, corrected: { x: 150, y: 160 }, status: "corrected" }],
    };
    const result = applyCorrections(5, detected, corrections);
    expect(result[0].x).toBe(150);
    expect(result[0].y).toBe(160);
    expect(result[0].confidence).toBe(1);
  });

  it("removes occluded endpoints", () => {
    const detected = [makeEndpoint({ propIndex: 0, tipIndex: 0 }), makeEndpoint({ propIndex: 1, tipIndex: 0, x: 200 })];
    const corrections: Record<number, EndpointCorrection[]> = {
      5: [{ propIndex: 0, tipIndex: 0, detected: null, corrected: null, status: "occluded" }],
    };
    const result = applyCorrections(5, detected, corrections);
    expect(result.length).toBe(1);
    expect(result[0].propIndex).toBe(1);
  });
});
