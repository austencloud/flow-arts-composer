import { describe, expect, it, vi } from "vitest";
import { AnimationRenderLoop } from "#lib/shared/animation-engine/services/animation-render-loop.js";
import type {
  RenderFrameParams,
  RenderLoopConfig,
} from "#lib/shared/animation-engine/services/IAnimationRenderLoop.js";
import type { IAnimationRenderer } from "#lib/shared/animation-engine/services/IAnimationRenderer.js";
import type { EffectRendererLike } from "#lib/shared/animation-engine/services/effects/effect-renderer.js";
import type {
  LedSampler,
  LedSamplerConfig,
} from "#lib/shared/animation-engine/services/led-sampler.js";
import {
  DEFAULT_LED_CONFIG,
  type LedFrameInput,
  type LedSample,
} from "#lib/shared/animation-engine/domain/types/led-types.js";
import { DEFAULT_TRAIL_SETTINGS } from "#lib/shared/animation-engine/domain/types/trail-types.js";
import type { PropState } from "#lib/shared/foundation/domain/types/prop-state.js";

function prop(angle: number): PropState {
  return {
    centerPathAngle: angle,
    staffRotationAngle: angle,
  } as PropState;
}

function ledSample(propIndex: number): LedSample {
  return {
    x: 100 + propIndex,
    y: 200 + propIndex,
    propIndex,
    ledIndex: 0,
    endpointIndex: 0,
    brightness: 1,
    r: 1,
    g: 1,
    b: 1,
  };
}

function frameParams({
  leftProp,
  rightProp,
  leftMotionVisible,
  rightMotionVisible,
  additionalLayers = [],
}: {
  leftProp: PropState | null;
  rightProp: PropState | null;
  leftMotionVisible: boolean;
  rightMotionVisible: boolean;
  additionalLayers?: Array<{
    leftProp: PropState | null;
    rightProp: PropState | null;
  }>;
}): RenderFrameParams {
  return {
    stepData: null,
    currentStep: 0,
    trailSettings: DEFAULT_TRAIL_SETTINGS,
    gridVisible: false,
    gridMode: null,
    letter: null,
    props: {
      leftProp,
      rightProp,
      additionalLayers,
      leftPropDimensions: { width: 252.8, height: 77.8 },
      rightPropDimensions: { width: 252.8, height: 77.8 },
      tunnelSpectrum: false,
    },
    visibility: {
      gridVisible: false,
      propsVisible: true,
      trailsVisible: false,
      leftMotionVisible,
      rightMotionVisible,
    },
    isPlaying: true,
    leftPropType: "staff",
    rightPropType: "staff",
    tipEffectMap: { "*": { effect: "led" } },
    ledConfig: { ...DEFAULT_LED_CONFIG, enabled: true },
  };
}

function createHarness() {
  const update = vi.fn(
    (
      leftProp: PropState | null,
      rightProp: PropState | null,
      config: LedSamplerConfig
    ): LedSample[] => {
      const leds: LedSample[] = [];
      if (leftProp) leds.push(ledSample(0));
      if (rightProp) leds.push(ledSample(1));
      config.additionalLayers?.forEach((layer, index) => {
        if (layer.leftProp) leds.push(ledSample(2 + index * 2));
        if (layer.rightProp) leds.push(ledSample(3 + index * 2));
      });
      return leds;
    }
  );
  const renderLeds = vi.fn<(input: LedFrameInput) => void>();
  const ledRenderer = {
    isInitialized: () => true,
    renderLeds,
  } as unknown as EffectRendererLike;
  const renderer = {
    renderScene: vi.fn(),
  } as unknown as IAnimationRenderer;
  const loop = new AnimationRenderLoop();

  loop.initialize({
    renderer,
    TrailCapturer: null,
    pathCache: null,
    canvasSize: 500,
    ledSampler: { update } as unknown as LedSampler,
    renderers: { led: ledRenderer },
  } satisfies RenderLoopConfig);

  return { loop, update, renderLeds };
}

describe("AnimationRenderLoop LED motion visibility", () => {
  it("removes a hidden hand and its tunnel copies from the LED frame", () => {
    const leftProp = prop(0);
    const rightProp = prop(Math.PI);
    const leftLayerProp = prop(0.5);
    const rightLayerProp = prop(2.5);
    const { loop, update, renderLeds } = createHarness();

    loop.renderSync(
      frameParams({
        leftProp,
        rightProp,
        leftMotionVisible: false,
        rightMotionVisible: true,
        additionalLayers: [{ leftProp: leftLayerProp, rightProp: rightLayerProp }],
      }),
      100,
      1 / 60
    );

    const [visibleLeft, visibleRight, samplerConfig] = update.mock.calls[0]!;
    expect(visibleLeft).toBeNull();
    expect(visibleRight).toBe(rightProp);
    expect(samplerConfig.additionalLayers).toEqual([
      { leftProp: null, rightProp: rightLayerProp },
    ]);
    expect(renderLeds).toHaveBeenCalledOnce();
    expect(
      renderLeds.mock.calls[0]![0].leds.map((led) => led.propIndex)
    ).toEqual([1, 3]);
  });

  it("submits an empty LED frame when the last visible source is hidden", () => {
    const { loop, renderLeds } = createHarness();

    loop.renderSync(
      frameParams({
        leftProp: prop(0),
        rightProp: null,
        leftMotionVisible: false,
        rightMotionVisible: true,
      }),
      100,
      1 / 60
    );

    expect(renderLeds).toHaveBeenCalledOnce();
    expect(renderLeds.mock.calls[0]![0].leds).toEqual([]);
  });
});
