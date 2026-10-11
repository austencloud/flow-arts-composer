
import { describe, it, expect, beforeEach } from "vitest";
import { VideoTipAdapter } from "#lib/features/video/video-trails/services/video-tip-adapter.js";
import type { DetectedEndpoint } from "#lib/features/video/video-trails/domain/types.js";

function makeEndpoint(overrides: Partial<DetectedEndpoint> = {}): DetectedEndpoint {
  return {
    x: 100, y: 100, brightness: 1.0, confidence: 1.0,
    propIndex: 0, tipIndex: 0, frameIndex: 0,
    ...overrides,
  };
}

describe("VideoTipAdapter", () => {
  let adapter: VideoTipAdapter;

  beforeEach(() => {
    adapter = new VideoTipAdapter();
  });

  describe("mapToFireTips", () => {
    it("returns zero velocity on first frame", () => {
      const tips = adapter.mapToFireTips([makeEndpoint()], 500, 0);
      expect(tips.length).toBe(1);
      expect(tips[0].velocityX).toBe(0);
      expect(tips[0].velocityY).toBe(0);
    });

    it("calculates velocity from position delta", () => {
      adapter.mapToFireTips([makeEndpoint({ x: 100, y: 100 })], 500, 0);
      const tips = adapter.mapToFireTips([makeEndpoint({ x: 200, y: 100 })], 500, 1000);
      expect(tips[0].velocityX).toBeCloseTo(100, 0);
      expect(tips[0].velocityY).toBeCloseTo(0, 0);
    });

    it("clamps dt to prevent division by zero", () => {
      adapter.mapToFireTips([makeEndpoint({ x: 100 })], 500, 1000);
      const tips = adapter.mapToFireTips([makeEndpoint({ x: 200 })], 500, 1000);
      expect(Number.isFinite(tips[0].velocityX)).toBe(true);
    });

    it("maps brightness to flameScale", () => {
      const tips = adapter.mapToFireTips([makeEndpoint({ brightness: 0.7 })], 500, 0);
      expect(tips[0].flameScale).toBe(0.7);
    });
  });

  describe("mapToTrailPoints", () => {
    it("converts endpoints to TrailPoint format", () => {
      const points = adapter.mapToTrailPoints([makeEndpoint({ x: 50, y: 75, propIndex: 1 })], 1234);
      expect(points.length).toBe(1);
      expect(points[0]).toEqual({ x: 50, y: 75, timestamp: 1234, propIndex: 1, tipIndex: 0 });
    });
  });

  describe("stabilizeEndpoints", () => {
    it("keeps each physical tip's identity when detector labels and order flip", () => {
      adapter.stabilizeEndpoints([
        makeEndpoint({ x: 100, propIndex: 0, tipIndex: 0 }),
        makeEndpoint({ x: 250, propIndex: 0, tipIndex: 1 }),
        makeEndpoint({ x: 500, propIndex: 1, tipIndex: 0 }),
      ], 0, 640);

      const result = adapter.stabilizeEndpoints([
        makeEndpoint({ x: 505, propIndex: 0, tipIndex: 0 }),
        makeEndpoint({ x: 245, propIndex: 1, tipIndex: 0 }),
        makeEndpoint({ x: 105, propIndex: 1, tipIndex: 1 }),
      ], 3, 640);

      expect(result.endpoints.map(({ propIndex, tipIndex }) => `${propIndex}-${tipIndex}`))
        .toEqual(["1-0", "0-1", "0-0"]);
      expect(result.breaks).toEqual([]);
    });

    it("reconnects the same tip after a brief occlusion", () => {
      adapter.stabilizeEndpoints([makeEndpoint({ x: 100 })], 0, 640);
      expect(adapter.stabilizeEndpoints([], 3, 640).endpoints).toEqual([]);
      const result = adapter.stabilizeEndpoints([
        makeEndpoint({ x: 125, propIndex: 1, tipIndex: 1 }),
      ], 6, 640);
      expect(result.endpoints[0]).toMatchObject({ propIndex: 0, tipIndex: 0, x: 125 });
      expect(result.breaks).toEqual([]);
    });

    it("uses an occlusion correction instead of a false point to predict recovery", () => {
      adapter.stabilizeEndpoints([makeEndpoint({ x: 100 })], 0, 640);
      adapter.stabilizeEndpoints([makeEndpoint({ x: 205 })], 3, 640);
      adapter.reconcileCorrections([], 3);

      const recovered = adapter.stabilizeEndpoints([
        makeEndpoint({ x: 105, propIndex: 1, tipIndex: 1 }),
      ], 6, 640);
      expect(recovered.endpoints[0]).toMatchObject({ propIndex: 0, tipIndex: 0 });
    });

    it("does not connect a distant detection to the old tip and breaks after a long gap", () => {
      adapter.stabilizeEndpoints([makeEndpoint({ x: 100 })], 0, 640);
      const falseMatch = adapter.stabilizeEndpoints([
        makeEndpoint({ x: 600 }),
      ], 3, 640);
      expect(falseMatch.endpoints).not.toContainEqual(
        expect.objectContaining({ propIndex: 0, tipIndex: 0 }),
      );

      const recovered = adapter.stabilizeEndpoints([
        makeEndpoint({ x: 140 })
      ], 13, 640);
      expect(recovered.endpoints[0]).toMatchObject({ propIndex: 0, tipIndex: 0 });
      expect(recovered.breaks).toEqual(["0-0"]);
    });
  });

  describe("reset", () => {
    it("clears velocity tracking state", () => {
      adapter.mapToFireTips([makeEndpoint({ x: 100 })], 500, 0);
      adapter.reset();
      const tips = adapter.mapToFireTips([makeEndpoint({ x: 200 })], 500, 1000);
      expect(tips[0].velocityX).toBe(0);
    });
  });
});
