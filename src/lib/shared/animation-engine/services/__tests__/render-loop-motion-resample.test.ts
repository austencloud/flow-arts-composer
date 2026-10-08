// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { AnimationRenderLoop } from "../animation-render-loop";
import type {
  RenderFrameParams,
  RenderLoopConfig,
} from "../IAnimationRenderLoop";
import type { IAnimationRenderer } from "../IAnimationRenderer";
import type {
  ITrailOverlayCanvas,
  TrailOverlayRenderParams,
} from "../ITrailOverlayCanvas";
import type { MotionSampleSource } from "../motion-sub-sampler";
import type { PropState } from "$lib/shared/foundation/domain/types/prop-state";
import { DEFAULT_TRAIL_SETTINGS } from "../../domain/types/trail-types";

/**
 * The render loop fills a slow live frame with poses sampled from the frame's
 * `motionSampleSource` and hands them to the trail overlay. The GL overlays
 * cannot run under jsdom, so a fake records what the loop passed; the overlay
 * side is covered by the overlay motion-sample tests.
 */

function pose(step: number): { left: PropState; right: PropState } {
  return {
    left: { centerPathAngle: step, staffRotationAngle: 0 },
    right: { centerPathAngle: -step, staffRotationAngle: 0 },
  };
}

function source(): MotionSampleSource {
  return {
    totalBeats: 4,
    sampleAt(step, l, r) {
      const p = pose(step);
      l.centerPathAngle = p.left.centerPathAngle;
      l.staffRotationAngle = 0;
      l.x = undefined;
      l.y = undefined;
      r.centerPathAngle = p.right.centerPathAngle;
      r.staffRotationAngle = 0;
      r.x = undefined;
      r.y = undefined;
      return true;
    },
  };
}

class FakeTrailOverlay implements ITrailOverlayCanvas {
  readonly frames: TrailOverlayRenderParams[] = [];
  initialize(): void {}
  resize(): void {}
  renderFrame(params: TrailOverlayRenderParams): void {
    // The sample list is pooled; copy what this frame saw.
    this.frames.push({
      ...params,
      motionSamples: params.motionSamples
        ? params.motionSamples.map((s) => ({
            left: { ...s.left },
            right: { ...s.right },
            layers: s.layers.map((l) => ({ ...l })),
            timeMs: s.timeMs,
          }))
        : undefined,
    });
  }
  clear(): void {}
  clearBuffers(): void {}
  refreshStyle(): void {}
  setVisible(): void {}
  setCanvasZIndex(): void {}
  dispose(): void {}
}

function params(
  step: number,
  overrides: Partial<RenderFrameParams> = {}
): RenderFrameParams {
  const p = pose(step);
  return {
    stepData: null,
    currentStep: step,
    trailSettings: { ...DEFAULT_TRAIL_SETTINGS },
    gridVisible: false,
    gridMode: null,
    letter: null,
    props: {
      leftProp: p.left,
      rightProp: p.right,
      additionalLayers: [],
      leftPropDimensions: { width: 252.8, height: 77.8 },
      rightPropDimensions: { width: 252.8, height: 77.8 },
      tunnelSpectrum: false,
    },
    visibility: {
      gridVisible: false,
      propsVisible: true,
      trailsVisible: true,
      leftMotionVisible: true,
      rightMotionVisible: true,
    },
    isPlaying: true,
    leftPropType: "staff",
    rightPropType: "staff",
    tipEffectMap: { "*": { effect: "trails" } },
    motionSampleSource: source(),
    ...overrides,
  } as RenderFrameParams;
}

interface LoopInternals {
  render(p: RenderFrameParams, t: number, dt?: number): void;
  renderSync(p: RenderFrameParams, t: number, dt: number): void;
  getDiagnostics(): Record<string, unknown>;
}

function createLoop(trails: FakeTrailOverlay): LoopInternals {
  const renderer = {
    renderScene: vi.fn(),
    isLeftPropCrossfadeInProgress: () => false,
    isRightPropCrossfadeInProgress: () => false,
  } as unknown as IAnimationRenderer;
  const loop = new AnimationRenderLoop();
  loop.initialize({
    renderer,
    TrailCapturer: null,
    pathCache: null,
    canvasSize: 500,
    renderers: { trails } as never,
  } satisfies RenderLoopConfig);
  // `render` is private; it is the one method both the rAF loop and the
  // export driver share, and the rAF loop needs a browser clock.
  return loop as unknown as LoopInternals;
}

function lastSamples(trails: FakeTrailOverlay) {
  return trails.frames.at(-1)!.motionSamples ?? [];
}

describe("AnimationRenderLoop motion resampling", () => {
  it("passes sub-samples to the trail overlay on a slow live frame", () => {
    const trails = new FakeTrailOverlay();
    const loop = createLoop(trails);
    loop.render(params(1), 1000);
    loop.render(params(1.1), 1016);
    expect(lastSamples(trails).length).toBe(0);

    loop.render(params(1.7), 1116);
    const samples = lastSamples(trails);
    expect(samples.length).toBe(5);
    expect(samples[0]!.left.centerPathAngle).toBeCloseTo(1.2, 6);
    expect(samples[4]!.left.centerPathAngle).toBeCloseTo(1.6, 6);
    expect(samples[0]!.timeMs).toBeCloseTo(1016 + 100 / 6, 6);

    const diag = loop.getDiagnostics().motionResample as {
      samplesInserted: number;
      lastFrameSamples: number;
    };
    expect(diag.samplesInserted).toBe(5);
    expect(diag.lastFrameSamples).toBe(5);
  });

  it("skips samples when paused, on a guard mismatch, and under renderSync", () => {
    const trails = new FakeTrailOverlay();
    const loop = createLoop(trails);
    loop.render(params(1), 1000);
    loop.render(params(1.7, { isPlaying: false }), 1100);
    expect(lastSamples(trails).length).toBe(0);

    const shifted = params(2.4);
    shifted.props.leftProp = { centerPathAngle: 0.3, staffRotationAngle: 0 };
    loop.render(shifted, 1200);
    expect(lastSamples(trails).length).toBe(0);
    const diag = loop.getDiagnostics().motionResample as {
      guardRejections: number;
    };
    expect(diag.guardRejections).toBe(1);

    loop.renderSync(params(3.1), 1300, 0.1);
    expect(lastSamples(trails).length).toBe(0);
  });

  it("honours the window kill switch", () => {
    const trails = new FakeTrailOverlay();
    const loop = createLoop(trails);
    const w = window as { __TKA_MOTION_RESAMPLE?: boolean };
    w.__TKA_MOTION_RESAMPLE = false;
    try {
      loop.render(params(1), 1000);
      loop.render(params(1.7), 1100);
      expect(lastSamples(trails).length).toBe(0);
    } finally {
      delete w.__TKA_MOTION_RESAMPLE;
    }
    loop.render(params(2.3), 1200);
    expect(lastSamples(trails).length).toBe(5);
  });
});
