// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import type { PropState } from "$lib/shared/foundation/domain/types/prop-state";
import {
  DEFAULT_TRAIL_SETTINGS,
  TrackingMode,
} from "../../domain/types/trail-types";
import type { TrailOverlayRenderParams } from "../ITrailOverlayCanvas";
import { TrailOverlayCanvas } from "../trail-overlay-canvas";
import type { MotionSubSample } from "../motion-sub-sampler";

/**
 * Canvas2D fallback of the trail overlay: a slow live frame's `motionSamples`
 * are captured as their own slices before the frame's pose, under the frame's
 * gates, so the ring holds the arc instead of one chord.
 */

function propAt(angle: number): PropState {
  return { centerPathAngle: angle, staffRotationAngle: angle };
}

function sample(angle: number, timeMs: number): MotionSubSample {
  return { left: propAt(angle), right: propAt(-angle), layers: [], timeMs };
}

function makeOverlay(): TrailOverlayCanvas {
  const overlay = new TrailOverlayCanvas();
  const internals = overlay as unknown as {
    ctx: CanvasRenderingContext2D | null;
    width: number;
    height: number;
    warmupFramesRemaining: number;
  };
  internals.ctx = {
    clearRect: () => {},
  } as unknown as CanvasRenderingContext2D;
  internals.width = 500;
  internals.height = 500;
  internals.warmupFramesRemaining = 0;
  return overlay;
}

function baseParams(
  overrides: Partial<TrailOverlayRenderParams>
): TrailOverlayRenderParams {
  return {
    leftTrailPoints: [],
    rightTrailPoints: [],
    trailSettings: {
      ...DEFAULT_TRAIL_SETTINGS,
      trackingMode: TrackingMode.BOTH_ENDS,
    },
    deltaTime: 1 / 60,
    currentTime: 0,
    canvasSize: 500,
    hasLeft: true,
    hasRight: false,
    leftPropType: "staff",
    ...overrides,
  };
}

type Ring = Array<{ x: number; y: number; timestamp: number }>;
function leftRightRingOf(overlay: TrailOverlayCanvas): Ring {
  return (overlay as unknown as { leftRightRing: Ring }).leftRightRing;
}
function layerLeftRightRingOf(overlay: TrailOverlayCanvas): Ring {
  return (
    (overlay as unknown as { leftLayerRings: Array<{ right: Ring }> })
      .leftLayerRings[0]?.right ?? []
  );
}

const QUARTER = Math.PI / 2;

function tunnelLayer(angle: number) {
  return {
    leftProp: propAt(angle + 1),
    rightProp: null,
    leftTrailPoints: [],
    rightTrailPoints: [],
    hasLeft: true,
    hasRight: false,
    opacity: 1,
    leftColor: "#ffffff",
    rightColor: "#ffffff",
  };
}

describe("TrailOverlayCanvas motion samples", () => {
  it("appends one ring point per sample, in time order, before the frame point", () => {
    const overlay = makeOverlay();
    overlay.renderFrame(baseParams({ leftProp: propAt(0), currentTime: 0 }));
    overlay.renderFrame(
      baseParams({
        leftProp: propAt(QUARTER),
        currentTime: 100,
        deltaTime: 0.1,
        motionSamples: [1, 2, 3, 4, 5].map((i) =>
          sample((QUARTER * i) / 6, (100 * i) / 6)
        ),
      })
    );
    const ring = leftRightRingOf(overlay);
    expect(ring.length).toBe(7);
    const radii = ring.map((p) => Math.hypot(p.x - 250, p.y - 250));
    expect(Math.max(...radii) - Math.min(...radii)).toBeLessThan(1e-6);
    for (let i = 1; i < ring.length; i++) {
      expect(ring[i]!.timestamp).toBeGreaterThan(ring[i - 1]!.timestamp);
    }
    expect(ring[6]!.timestamp).toBe(100);
  });

  it("obeys swap suppression per sample", () => {
    const overlay = makeOverlay();
    overlay.renderFrame(baseParams({ leftProp: propAt(0), currentTime: 0 }));
    overlay.renderFrame(
      baseParams({
        leftProp: propAt(QUARTER),
        currentTime: 100,
        deltaTime: 0.1,
        leftPropSwapSuppressed: true,
        motionSamples: [sample(QUARTER / 2, 50)],
      })
    );
    expect(leftRightRingOf(overlay).length).toBe(1);
  });

  it("captures tunnel layers from each sample's layer pose", () => {
    const overlay = makeOverlay();
    overlay.renderFrame(
      baseParams({
        leftProp: propAt(0),
        currentTime: 0,
        additionalLayers: [tunnelLayer(0)],
      })
    );
    overlay.renderFrame(
      baseParams({
        leftProp: propAt(QUARTER),
        currentTime: 100,
        deltaTime: 0.1,
        additionalLayers: [tunnelLayer(QUARTER)],
        motionSamples: [
          {
            ...sample(QUARTER / 2, 50),
            layers: [{ left: propAt(QUARTER / 2 + 1), right: null }],
          },
          {
            ...sample(QUARTER * 0.75, 75),
            layers: [{ left: null, right: null }],
          },
        ],
      })
    );
    expect(layerLeftRightRingOf(overlay).length).toBe(3);
    expect(leftRightRingOf(overlay).length).toBe(4);
  });
});
