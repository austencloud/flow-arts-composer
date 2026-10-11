import { afterEach, describe, expect, it, vi } from "vitest";
import { AnimationRenderLoop } from "#lib/shared/animation-engine/services/animation-render-loop.js";
import { Canvas2DAnimationRenderer } from "#lib/shared/animation-engine/services/canvas-2d-animation-renderer.js";
import { Canvas2DApplicationManager } from "#lib/shared/animation-engine/services/canvas2d/canvas-2d-application-manager.js";
import { Canvas2DImageLoader } from "#lib/shared/animation-engine/services/canvas2d/canvas-2d-image-loader.js";
import { DEFAULT_TRAIL_SETTINGS } from "#lib/shared/animation-engine/domain/types/trail-types.js";
import type { RenderFrameParams } from "#lib/shared/animation-engine/services/IAnimationRenderLoop.js";

afterEach(() => vi.restoreAllMocks());

function harness(virtualTime: number | undefined) {
  const grid = new Image();
  const prop = new Image();
  const painted: Array<{ image: unknown; alpha: number }> = [];
  const ctx = {
    globalAlpha: 1,
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    drawImage(image: unknown) {
      painted.push({ image, alpha: this.globalAlpha });
    },
  } as unknown as CanvasRenderingContext2D;
  vi.spyOn(Canvas2DApplicationManager.prototype, "getContext").mockReturnValue(
    ctx
  );
  vi.spyOn(Canvas2DApplicationManager.prototype, "isReady").mockReturnValue(
    true
  );
  vi.spyOn(
    Canvas2DApplicationManager.prototype,
    "getCurrentSize"
  ).mockReturnValue(500);
  vi.spyOn(Canvas2DApplicationManager.prototype, "clear").mockImplementation(
    () => {}
  );
  vi.spyOn(Canvas2DImageLoader.prototype, "getGridImage").mockReturnValue(grid);
  vi.spyOn(Canvas2DImageLoader.prototype, "getLeftPropImage").mockReturnValue(
    prop
  );

  const renderer = new Canvas2DAnimationRenderer();
  const loop = new AnimationRenderLoop();
  loop.initialize({
    renderer,
    TrailCapturer: null,
    pathCache: null,
    canvasSize: 500,
  });
  const params: RenderFrameParams = {
    stepData: null,
    currentStep: 2.5,
    trailSettings: DEFAULT_TRAIL_SETTINGS,
    gridVisible: true,
    gridMode: null,
    letter: null,
    virtualTime,
    isPlaying: false,
    props: {
      leftProp: { centerPathAngle: 0, staffRotationAngle: 0 },
      rightProp: null,
      additionalLayers: [],
      tunnelSpectrum: false,
      leftPropDimensions: { width: 250, height: 75 },
      rightPropDimensions: { width: 250, height: 75 },
    },
    visibility: {
      gridVisible: true,
      propsVisible: true,
      trailsVisible: false,
      leftMotionVisible: true,
      rightMotionVisible: true,
    },
  };
  const render = (time = virtualTime ?? 100) => {
    painted.length = 0;
    loop.renderSync(params, time, 0);
    return [...painted];
  };
  return { params, render, grid, prop };
}

describe("virtual-time visibility toggles", () => {
  it("hides and restores grid and props at the same paused timeline time", () => {
    const { params, render, grid, prop } = harness(38380);
    expect(render().map((draw) => draw.image)).toEqual([grid, prop]);

    params.gridVisible = false;
    params.visibility.gridVisible = false;
    params.visibility.propsVisible = false;
    expect(render()).toEqual([]);
    expect(render()).toEqual([]);

    params.gridVisible = true;
    params.visibility.gridVisible = true;
    params.visibility.propsVisible = true;
    expect(render()).toEqual([
      { image: grid, alpha: 1 },
      { image: prop, alpha: 1 },
    ]);

    params.visibility.leftMotionVisible = false;
    expect(render()).toEqual([{ image: grid, alpha: 1 }]);
  });

  it("applies hidden settings on the first virtual frame at time zero", () => {
    const { params, render } = harness(0);
    params.visibility.gridVisible = false;
    params.visibility.propsVisible = false;
    expect(render()).toEqual([]);
  });

  it("keeps ordinary live visibility fades on the advancing render clock", () => {
    const { params, render, grid, prop } = harness(undefined);
    render(100);
    params.visibility.gridVisible = false;
    params.visibility.propsVisible = false;
    expect(render(100)).toEqual([
      { image: grid, alpha: 1 },
      { image: prop, alpha: 1 },
    ]);
    const fading = render(200);
    expect(fading).toHaveLength(2);
    expect(fading.every((draw) => draw.alpha > 0 && draw.alpha < 1)).toBe(true);
    expect(render(300)).toEqual([]);
  });
});
