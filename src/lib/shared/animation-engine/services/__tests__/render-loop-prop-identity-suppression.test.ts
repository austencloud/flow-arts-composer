import { describe, expect, it, vi } from "vitest";
import { AnimationRenderLoop } from "../animation-render-loop";
import type {
  RenderFrameParams,
  RenderLoopConfig,
} from "../IAnimationRenderLoop";
import type {
  ITrailOverlayCanvas,
  TrailOverlayRenderParams,
} from "../ITrailOverlayCanvas";
import {
  DEFAULT_TRAIL_SETTINGS,
  TrackingMode,
} from "../../domain/types/trail-types";
import type { IAnimationRenderer } from "../IAnimationRenderer";

function frameParams(propType: string): RenderFrameParams {
  return {
    stepData: null,
    currentStep: 0,
    trailSettings: {
      ...DEFAULT_TRAIL_SETTINGS,
      trackingMode: TrackingMode.BOTH_ENDS,
    },
    gridVisible: false,
    gridMode: null,
    letter: null,
    props: {
      leftProp: { centerPathAngle: 0, staffRotationAngle: 0 },
      rightProp: null,
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
      rightMotionVisible: false,
    },
    isPlaying: true,
    leftPropType: propType,
    rightPropType: "staff",
    tipEffectMap: { "*": { effect: "trails" } },
  };
}

describe("AnimationRenderLoop prop identity trail barrier", () => {
  it("suppresses the exact type-change frame even before async swap signals arrive", () => {
    const trailFrames: TrailOverlayRenderParams[] = [];
    const trailOverlay = {
      renderFrame: (params: TrailOverlayRenderParams) =>
        trailFrames.push(params),
      setVisible: vi.fn(),
      clear: vi.fn(),
      clearBuffers: vi.fn(),
      refreshStyle: vi.fn(),
      resize: vi.fn(),
      setCanvasZIndex: vi.fn(),
      dispose: vi.fn(),
    } as unknown as ITrailOverlayCanvas;
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
      renderers: { trails: trailOverlay as never },
    } satisfies RenderLoopConfig);

    loop.renderSync(frameParams("staff"), 100, 1 / 60);
    loop.renderSync(frameParams("fan"), 116, 1 / 60);
    loop.renderSync(frameParams("fan"), 132, 1 / 60);

    expect(trailFrames).toHaveLength(3);
    expect(trailFrames[0]?.leftPropSwapSuppressed).toBe(false);
    expect(trailFrames[1]?.leftPropSwapSuppressed).toBe(true);
    expect(trailFrames[1]?.rightPropSwapSuppressed).toBe(false);
    expect(trailFrames[2]?.leftPropSwapSuppressed).toBe(false);
  });

  it("repaints a paused trail style edit without stamping unchanged frames", () => {
    const renderFrame = vi.fn();
    const refreshStyle = vi.fn();
    const trailOverlay = {
      renderFrame,
      refreshStyle,
      setVisible: vi.fn(),
    } as unknown as ITrailOverlayCanvas;
    const loop = new AnimationRenderLoop();
    loop.initialize({
      renderer: {
        renderScene: vi.fn(),
        isLeftPropCrossfadeInProgress: () => false,
        isRightPropCrossfadeInProgress: () => false,
      } as unknown as IAnimationRenderer,
      TrailCapturer: null,
      pathCache: null,
      canvasSize: 500,
      renderers: { trails: trailOverlay as never },
    } satisfies RenderLoopConfig);

    const original = { ...frameParams("staff"), isPlaying: false };
    loop.renderSync(original, 100, 1 / 60);
    loop.renderSync(original, 100, 1 / 60);
    expect(renderFrame).toHaveBeenCalledTimes(1);
    expect(refreshStyle).not.toHaveBeenCalled();

    loop.renderSync(
      {
        ...original,
        trailSettings: { ...original.trailSettings, lineWidth: 12 },
      },
      100,
      1 / 60
    );
    expect(refreshStyle).toHaveBeenCalledOnce();
    expect(renderFrame).toHaveBeenCalledTimes(2);
    expect(renderFrame.mock.calls[1]?.[0].trailSettings.lineWidth).toBe(12);
  });
});
