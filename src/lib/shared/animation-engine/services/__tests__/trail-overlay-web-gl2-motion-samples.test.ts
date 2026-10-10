// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { TrailOverlayWebGL2 } from "../trail-overlay-web-gl2";
import type { TrailOverlayRenderParams } from "../ITrailOverlayCanvas";
import {
  DEFAULT_TRAIL_SETTINGS,
  TrackingMode,
} from "../../domain/types/trail-types";
import type {
  RenderBackend,
  BackendStats,
} from "#lib/shared/render-graph/domain/backend.js";
import type { PropState } from "#lib/shared/foundation/domain/types/prop-state.js";
import type { MotionSubSample } from "../motion-sub-sampler";

/**
 * A slow live frame arrives with `motionSamples`: the poses the props passed
 * through since the previous frame. The overlay captures each one as its own
 * slice before the frame's pose, under the frame's gates, so the ring holds
 * the arc the prop really swept instead of one chord.
 */

function makeStubBackend(): RenderBackend {
  return {
    kind: "webgl2",
    initialize: async () => {},
    executeFrame: () => {},
    resize: () => {},
    clearScreen: () => {},
    dispose: () => {},
    getStats: (): BackendStats => ({
      lastFrameMs: 0,
      longestPassMs: 0,
      fboCount: 0,
    }),
  } as unknown as RenderBackend;
}

function makeOverlay(): TrailOverlayWebGL2 {
  const overlay = new TrailOverlayWebGL2();
  const internals = overlay as unknown as {
    canvas: HTMLCanvasElement | null;
    backend: RenderBackend | null;
    width: number;
    height: number;
    warmupFramesRemaining: number;
  };
  internals.canvas = document.createElement("canvas");
  internals.backend = makeStubBackend();
  internals.width = 500;
  internals.height = 500;
  internals.warmupFramesRemaining = 0;
  return overlay;
}

function propAt(angle: number): PropState {
  return { centerPathAngle: angle, staffRotationAngle: angle };
}

function sample(angle: number, timeMs: number): MotionSubSample {
  return { left: propAt(angle), right: propAt(-angle), layers: [], timeMs };
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
function leftRightRingOf(overlay: TrailOverlayWebGL2): Ring {
  return (overlay as unknown as { leftRightRing: Ring }).leftRightRing;
}
function leftRightTailOf(overlay: TrailOverlayWebGL2): {
  visibleCount: number;
} {
  return (overlay as unknown as { leftRightTail: { visibleCount: number } })
    .leftRightTail;
}
function layerLeftRightRingOf(overlay: TrailOverlayWebGL2): Ring {
  return (
    (overlay as unknown as { layerRings: Array<{ leftRight: Ring }> })
      .layerRings[0]?.leftRight ?? []
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

describe("TrailOverlayWebGL2 motion samples", () => {
  it("appends one ring point per sample, in time order, before the frame point", () => {
    const overlay = makeOverlay();
    overlay.renderFrame(baseParams({ leftProp: propAt(0), currentTime: 0 }));
    const samples = [1, 2, 3, 4, 5].map((i) =>
      sample((QUARTER * i) / 6, (100 * i) / 6)
    );
    overlay.renderFrame(
      baseParams({
        leftProp: propAt(QUARTER),
        currentTime: 100,
        deltaTime: 0.1,
        motionSamples: samples,
      })
    );
    const ring = leftRightRingOf(overlay);
    expect(ring.length).toBe(7);
    // Every point sits on the same circle: the tip swept an arc, not a chord.
    const radii = ring.map((p) => Math.hypot(p.x - 250, p.y - 250));
    expect(Math.max(...radii) - Math.min(...radii)).toBeLessThan(1e-6);
    for (let i = 1; i < ring.length; i++) {
      expect(ring[i]!.timestamp).toBeGreaterThan(ring[i - 1]!.timestamp);
    }
    expect(ring[6]!.timestamp).toBe(100);
  });

  it("advances the tail once per slice so it covers every appended point", () => {
    const overlay = makeOverlay();
    overlay.renderFrame(baseParams({ leftProp: propAt(0), currentTime: 0 }));
    overlay.renderFrame(
      baseParams({
        leftProp: propAt(QUARTER),
        currentTime: 100,
        deltaTime: 0.1,
        motionSamples: [1, 2, 3].map((i) =>
          sample((QUARTER * i) / 4, 25 * i)
        ),
      })
    );
    // A moving slice grows visibleCount by one, capped at the ring length.
    // Four points joined one frame, so the tail reaches the whole ring.
    const ring = leftRightRingOf(overlay);
    expect(ring.length).toBe(5);
    expect(leftRightTailOf(overlay).visibleCount).toBe(5);
  });

  it("obeys swap suppression and a finished hide per sample", () => {
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

    // A hidden hand keeps capturing while its envelope fades out, then stops.
    // The envelope runs on the overlay's virtual clock (the summed frame
    // deltas), so a few long frames finish the fade; after that, sub-samples
    // must not revive the capture.
    const hidden = makeOverlay();
    let t = 0;
    for (let i = 0; i < 6; i++) {
      hidden.renderFrame(
        baseParams({
          leftProp: propAt(i * 0.1),
          hasLeft: false,
          currentTime: t,
          deltaTime: 0.1,
        })
      );
      t += 100;
    }
    const afterFade = leftRightRingOf(hidden).length;
    hidden.renderFrame(
      baseParams({
        leftProp: propAt(QUARTER),
        hasLeft: false,
        currentTime: t,
        deltaTime: 0.1,
        motionSamples: [sample(QUARTER / 2, t - 50)],
      })
    );
    expect(leftRightRingOf(hidden).length).toBe(afterFade);
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
    // Layer: first frame, first sample, frame (the second sample was nulled).
    expect(layerLeftRightRingOf(overlay).length).toBe(3);
    // Base: first frame, both samples, frame.
    expect(leftRightRingOf(overlay).length).toBe(4);
  });
});
