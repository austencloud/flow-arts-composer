// @vitest-environment jsdom

import { afterEach, describe, it, expect } from "vitest";
import { TrailOverlayWebGL2 } from "../trail-overlay-web-gl2";
import type { TrailOverlayRenderParams } from "../ITrailOverlayCanvas";
import {
  DEFAULT_TRAIL_SETTINGS,
  TrackingMode,
} from "../../domain/types/trail-types";
import { setTrailPointOverrideProvider } from "../../domain/types/trail-point-types";
import type {
  RenderBackend,
  BackendStats,
} from "#lib/shared/render-graph/domain/backend.js";
import type { FrameGraph } from "#lib/shared/render-graph/domain/frame-graph.js";
import type {
  TrailPassPayload,
  TrailTipState,
} from "#lib/shared/render-graph/domain/trail-pass.js";
import type { PropState } from "#lib/shared/foundation/domain/types/prop-state.js";

/**
 * Regression guard for the hero-act prop swap: without suppression, the trail
 * effect jumps from one endpoint to another and creates a
 * straight line." Root cause: getTipPoints/getTrailPointConfig return
 * different tip geometry per prop type (e.g. staff has two tips at
 * dx=±135, club has one at dx=130), so a capture during the prop-type
 * hot-swap or its crossfade stamps a straight line connecting the
 * old prop's tip to the new prop's differently-located tip.
 *
 * TrailOverlayWebGL2.renderFrame is the ACTIVE trail path in normal
 * operation (canvas-lifecycle-manager always registers the "trails" effect
 * renderer, so skipTrailRendering is always true and the legacy Canvas2D
 * draw + TrailCapturer never run) — this is what these tests target.
 *
 * initialize() needs a real WebGL2 context (createBackend), unavailable in
 * jsdom, so these tests bypass it: poke the private canvas/backend fields
 * with a stub RenderBackend and zero the warmup counter. renderFrame()
 * only branches on canvas/backend truthiness and calls backend methods
 * that don't need a GPU for these assertions. Tests inspect both the overlay's
 * source state and the graph payload handed to the backend.
 */

function makeStubBackend(
  onExecuteFrame?: (graph: FrameGraph) => void
): RenderBackend {
  return {
    kind: "webgl2",
    initialize: async () => {},
    executeFrame: (graph) => onExecuteFrame?.(graph),
    resize: () => {},
    clearScreen: () => {},
    dispose: () => {},
    getStats: (): BackendStats => ({
      lastFrameMs: 0,
      longestPassMs: 0,
      fboCount: 0,
    }),
  };
}

function makeOverlay(
  onExecuteFrame?: (graph: FrameGraph) => void
): TrailOverlayWebGL2 {
  const overlay = new TrailOverlayWebGL2();
  const overlayInternals = overlay as unknown as {
    canvas: HTMLCanvasElement | null;
    backend: RenderBackend | null;
    width: number;
    height: number;
    warmupFramesRemaining: number;
  };
  overlayInternals.canvas = document.createElement("canvas");
  overlayInternals.backend = makeStubBackend(onExecuteFrame);
  overlayInternals.width = 500;
  overlayInternals.height = 500;
  overlayInternals.warmupFramesRemaining = 0;
  return overlay;
}

function trailTipsFrom(graph: FrameGraph): TrailTipState[] {
  const pass = graph.passes.find((candidate) => candidate.kind === "trail");
  return (pass?.payload as TrailPassPayload | undefined)?.tips ?? [];
}

/** A staff-type PropState at a given center-path angle (radians). Constant
 *  staffRotationAngle=0 keeps the per-tip offset math trivial (cosA=1, sinA=0). */
function propAt(centerPathAngle: number): PropState {
  return { centerPathAngle, staffRotationAngle: 0 };
}

afterEach(() => {
  setTrailPointOverrideProvider(null);
});

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

/** Reach into the private ring/tail fields the same way the production
 *  suppression logic does — there is no public accessor, and adding one
 *  purely for this test would be a bigger surface change than the fix itself. */
function leftLeftRingOf(overlay: TrailOverlayWebGL2): unknown[] {
  return (overlay as unknown as { leftLeftRing: unknown[] }).leftLeftRing;
}
function leftRightRingOf(overlay: TrailOverlayWebGL2): Array<{
  x: number;
  y: number;
  tipIndex: number;
}> {
  return (
    overlay as unknown as {
      leftRightRing: Array<{ x: number; y: number; tipIndex: number }>;
    }
  ).leftRightRing;
}

function layerLeftRingOf(overlay: TrailOverlayWebGL2): unknown[] {
  return (
    (
      overlay as unknown as {
        layerRings: Array<{ leftLeft: unknown[] }>;
      }
    ).layerRings[0]?.leftLeft ?? []
  );
}
function leftLeftTailOf(overlay: TrailOverlayWebGL2): {
  prog: number;
  visibleCount: number;
  speedPxPerMs: number;
} {
  return (
    overlay as unknown as {
      leftLeftTail: {
        prog: number;
        visibleCount: number;
        speedPxPerMs: number;
      };
    }
  ).leftLeftTail;
}
function leftRightTailOf(overlay: TrailOverlayWebGL2): {
  prog: number;
  visibleCount: number;
  speedPxPerMs: number;
} {
  return (
    overlay as unknown as {
      leftRightTail: {
        prog: number;
        visibleCount: number;
        speedPxPerMs: number;
      };
    }
  ).leftRightTail;
}

describe("TrailOverlayWebGL2 prop-swap suppression", () => {
  it("keeps prop-end tracking off the hand when a legacy center assignment exists", () => {
    setTrailPointOverrideProvider(() => ({
      left: { type: "custom", dx: 0, dy: 0 },
      right: { type: "custom", dx: 0, dy: 0 },
    }));

    const propEndOverlay = makeOverlay();
    propEndOverlay.renderFrame(
      baseParams({
        leftProp: propAt(0),
        trailSettings: {
          ...DEFAULT_TRAIL_SETTINGS,
          trackingMode: TrackingMode.RIGHT_END,
        },
      })
    );

    const handOverlay = makeOverlay();
    handOverlay.renderFrame(
      baseParams({
        leftProp: propAt(0),
        trailSettings: {
          ...DEFAULT_TRAIL_SETTINGS,
          trackingMode: TrackingMode.HAND,
        },
      })
    );

    const [propEndPoint] = leftRightRingOf(propEndOverlay);
    const [handPoint] = leftRightRingOf(handOverlay);
    expect(propEndPoint).toBeDefined();
    expect(handPoint).toBeDefined();

    const separation = Math.hypot(
      propEndPoint!.x - handPoint!.x,
      propEndPoint!.y - handPoint!.y
    );
    expect(separation).toBeGreaterThan(50);
  });

  it("captures a fan from its canonical center rib", () => {
    const overlay = makeOverlay();
    overlay.renderFrame(
      baseParams({
        leftProp: propAt(0),
        leftPropType: "fan",
        currentTime: 0,
      })
    );

    expect(leftLeftRingOf(overlay)).toHaveLength(0);
    const [point] = leftRightRingOf(overlay);
    expect(point?.tipIndex).toBe(2);
    // hand orbit + the fan's outer rib on the pictograph artwork (130, the club's reach)
    expect(point?.x).toBeCloseTo(250 + ((150 + 130) * 500) / 950, 8);
    expect(point?.y).toBeCloseTo(250, 8);
  });

  it("resolves per-tip effect assignments against the fan's actual tip index", () => {
    const overlay = makeOverlay();
    overlay.renderFrame(
      baseParams({
        leftProp: propAt(0),
        leftPropType: "fan",
        currentTime: 0,
        tipEffectMap: { "0-2": { effect: "trails" } },
      })
    );

    expect(leftRightRingOf(overlay)).toHaveLength(1);
  });

  it("captures normally when never suppressed (baseline, zero behavior change)", () => {
    const overlay = makeOverlay();
    overlay.renderFrame(baseParams({ leftProp: propAt(0), currentTime: 0 }));
    overlay.renderFrame(
      baseParams({ leftProp: propAt(0.05), currentTime: 16 })
    );
    expect(leftLeftRingOf(overlay).length).toBe(2);
  });

  it("freezes the ring while leftPropSwapSuppressed is true", () => {
    const overlay = makeOverlay();
    overlay.renderFrame(baseParams({ leftProp: propAt(0), currentTime: 0 }));
    overlay.renderFrame(
      baseParams({ leftProp: propAt(0.05), currentTime: 16 })
    );
    const ringSizeBeforeSuppression = leftLeftRingOf(overlay).length;
    expect(ringSizeBeforeSuppression).toBe(2);

    // Prop keeps moving (as it does mid-motion in the live hero act) but the
    // ring must not grow while suppressed — a capture here would use the
    // swap target's tip geometry while the wrong sprite is still on screen.
    overlay.renderFrame(
      baseParams({
        leftProp: propAt(0.1),
        currentTime: 32,
        leftPropSwapSuppressed: true,
      })
    );
    overlay.renderFrame(
      baseParams({
        leftProp: propAt(0.3),
        currentTime: 48,
        leftPropSwapSuppressed: true,
      })
    );
    expect(leftLeftRingOf(overlay).length).toBe(ringSizeBeforeSuppression);
  });

  it("keeps the outgoing prop trail in decay-only passes while the replacement starts fresh", () => {
    const trailFrames: TrailTipState[][] = [];
    const overlay = makeOverlay((graph) => {
      trailFrames.push(trailTipsFrom(graph));
    });

    // Two moving staff frames establish both per-tip accumulator FBOs.
    overlay.renderFrame(baseParams({ leftProp: propAt(0), currentTime: 0 }));
    overlay.renderFrame(
      baseParams({ leftProp: propAt(0.05), currentTime: 16 })
    );
    expect(trailFrames.at(-1)?.map((tip) => tip.tipId)).toEqual([
      "left-left",
      "left-right",
    ]);

    // The reroll changes to a one-ended fan. Both outgoing staff identities
    // remain in the graph with no stamp path, so the backend decays and blits
    // their existing pixels instead of dropping them on the mask change.
    overlay.renderFrame(
      baseParams({
        leftProp: propAt(0.2),
        leftPropType: "fan",
        currentTime: 32,
        leftPropSwapSuppressed: true,
      })
    );
    const duringSwap = trailFrames.at(-1) ?? [];
    expect(duringSwap.map((tip) => tip.tipId)).toEqual([
      "left-left",
      "left-right",
    ]);
    expect(duringSwap.every((tip) => tip.path.length === 0)).toBe(true);

    // Once suppression lifts, the fan needs two captures to form a drawable
    // path. It uses the next epoch while both staff FBOs keep fading beside it.
    overlay.renderFrame(
      baseParams({
        leftProp: propAt(0.2),
        leftPropType: "fan",
        currentTime: 48,
        leftPropSwapSuppressed: false,
      })
    );
    overlay.renderFrame(
      baseParams({
        leftProp: propAt(0.25),
        leftPropType: "fan",
        currentTime: 64,
        leftPropSwapSuppressed: false,
      })
    );

    const replacementFrame = trailFrames.at(-1) ?? [];
    expect(
      replacementFrame.find((tip) => tip.tipId === "left-right-e1")?.path.length
    ).toBeGreaterThanOrEqual(2);
    expect(
      replacementFrame
        .filter(
          (tip) => tip.tipId === "left-left" || tip.tipId === "left-right"
        )
        .every((tip) => tip.path.length === 0)
    ).toBe(true);

    // Retirement is bounded by the configured fade duration. Once that time
    // has elapsed, the old identities leave the graph and backend GC owns the
    // now-invisible FBOs.
    for (let frame = 0; frame < 40; frame++) {
      overlay.renderFrame(
        baseParams({
          leftProp: propAt(0.3),
          leftPropType: "fan",
          currentTime: 164 + frame * 100,
          deltaTime: 0.1,
          leftPropSwapSuppressed: false,
        })
      );
    }
    expect(
      (trailFrames.at(-1) ?? []).some(
        (tip) => tip.tipId === "left-left" || tip.tipId === "left-right"
      )
    ).toBe(false);
  });

  it("resets the ring and tail when suppression lifts without connecting pre- and post-swap points", () => {
    const overlay = makeOverlay();
    overlay.renderFrame(baseParams({ leftProp: propAt(0), currentTime: 0 }));
    overlay.renderFrame(
      baseParams({ leftProp: propAt(0.05), currentTime: 16 })
    );
    expect(leftLeftRingOf(overlay).length).toBe(2);
    // Movement gave the tail a nonzero speed memory — reset must clear it too,
    // or the post-swap tail would recede at the pre-swap prop's speed.
    expect(leftLeftTailOf(overlay).speedPxPerMs).toBeGreaterThan(0);

    overlay.renderFrame(
      baseParams({
        leftProp: propAt(0.1),
        currentTime: 32,
        leftPropSwapSuppressed: true,
      })
    );
    overlay.renderFrame(
      baseParams({
        leftProp: propAt(0.3),
        currentTime: 900,
        leftPropSwapSuppressed: true,
      })
    );

    // Lift, now on the new prop type — this is the frame the old code would
    // have stamped a straight line on (old frozen point -> new geometry point).
    overlay.renderFrame(
      baseParams({
        leftProp: propAt(0.3),
        leftPropType: "club",
        currentTime: 916,
        leftPropSwapSuppressed: false,
      })
    );

    // Club is single-ended, so its fresh segment belongs to the right/source
    // ring. The old staff left ring is gone and the new ring has one point,
    // which proves no pre-swap point survived to connect across the boundary.
    expect(leftLeftRingOf(overlay)).toHaveLength(0);
    expect(leftRightRingOf(overlay)).toHaveLength(1);
    expect(leftRightTailOf(overlay).speedPxPerMs).toBe(0);
  });

  it("keeps capturing normally once suppression stays lifted", () => {
    const overlay = makeOverlay();
    overlay.renderFrame(
      baseParams({
        leftProp: propAt(0),
        currentTime: 0,
        leftPropSwapSuppressed: true,
      })
    );
    overlay.renderFrame(
      baseParams({
        leftProp: propAt(0.05),
        currentTime: 916,
        leftPropSwapSuppressed: false,
      })
    );
    overlay.renderFrame(
      baseParams({
        leftProp: propAt(0.1),
        currentTime: 932,
        leftPropSwapSuppressed: false,
      })
    );
    // Suppressed frame captured nothing; the two lifted frames captured
    // normally (first point on the reset ring, second point extends it).
    expect(leftLeftRingOf(overlay).length).toBe(2);
  });

  it("keeps right-hand suppression independent of left", () => {
    const overlay = makeOverlay();
    const params = (overrides: Partial<TrailOverlayRenderParams>) =>
      baseParams({ hasRight: true, rightPropType: "staff", ...overrides });

    overlay.renderFrame(
      params({ leftProp: propAt(0), rightProp: propAt(0), currentTime: 0 })
    );
    overlay.renderFrame(
      params({
        leftProp: propAt(0.05),
        rightProp: propAt(0.05),
        currentTime: 16,
        leftPropSwapSuppressed: true,
        rightPropSwapSuppressed: false,
      })
    );
    overlay.renderFrame(
      params({
        leftProp: propAt(0.1),
        rightProp: propAt(0.1),
        currentTime: 32,
        leftPropSwapSuppressed: true,
        rightPropSwapSuppressed: false,
      })
    );

    const leftRing = leftLeftRingOf(overlay);
    const rightRing = (overlay as unknown as { rightLeftRing: unknown[] })
      .rightLeftRing;
    // Left: 1 point from the unsuppressed first frame, frozen after that.
    expect(leftRing.length).toBe(1);
    // Right: never suppressed, captures every frame.
    expect(rightRing.length).toBe(3);
  });
});

describe("TrailOverlayWebGL2 Tunnel formation suppression", () => {
  const layer = (
    angle: number,
    trailCaptureSuppressed: boolean,
    formationTransitionActive = trailCaptureSuppressed
  ) => ({
    leftProp: propAt(angle),
    rightProp: null,
    leftTrailPoints: [],
    rightTrailPoints: [],
    hasLeft: true,
    hasRight: false,
    opacity: 1,
    leftColor: "#8b5cf6",
    rightColor: "#f97316",
    trailCaptureSuppressed,
    formationTransitionActive,
  });

  it("keeps formation travel out of the ring and restarts disconnected", () => {
    const overlay = makeOverlay();
    overlay.renderFrame(
      baseParams({ additionalLayers: [layer(0, false)], currentTime: 0 })
    );
    overlay.renderFrame(
      baseParams({ additionalLayers: [layer(0.05, false)], currentTime: 16 })
    );
    expect(layerLeftRingOf(overlay)).toHaveLength(2);

    overlay.renderFrame(
      baseParams({ additionalLayers: [layer(0.2, true)], currentTime: 32 })
    );
    overlay.renderFrame(
      baseParams({ additionalLayers: [layer(0.4, true)], currentTime: 48 })
    );
    expect(layerLeftRingOf(overlay)).toHaveLength(0);

    overlay.renderFrame(
      baseParams({ additionalLayers: [layer(0.4, false)], currentTime: 64 })
    );
    expect(layerLeftRingOf(overlay)).toHaveLength(1);
  });
});
