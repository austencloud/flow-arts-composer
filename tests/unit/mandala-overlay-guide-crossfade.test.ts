import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_MANDALA_OVERLAY_CONFIG } from "#lib/shared/mandala/domain/mandala-overlay-types.js";
import {
  MandalaOverlayCanvas,
  scaleGuideForOverlay,
} from "#lib/shared/mandala/services/mandala-overlay-canvas.js";
import type { PreparedMandalaPaths } from "#lib/shared/mandala/services/types.js";
import { DURATION } from "#lib/shared/transitions/transitions.js";

// The overlay drives its guide crossfade with DURATION.dramatic. Read it from
// the same token rather than restating a number, so a retuned fade moves both.
const GUIDE_FADE_MS = DURATION.dramatic;

interface DrawCall {
  source: unknown;
  alpha: number;
}

function createContext(drawCalls: DrawCall[] = []) {
  const context = {
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    lineDashOffset: 0,
    scale: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    translate: vi.fn(),
    setLineDash: vi.fn(),
    stroke: vi.fn(),
    drawImage: vi.fn((source: unknown) => {
      drawCalls.push({ source, alpha: context.globalAlpha });
    }),
  };
  return context;
}

function preparedPaths(id: number): PreparedMandalaPaths {
  return {
    paths: [],
    scale: 1,
    totalSteps: id,
  };
}

describe("MandalaOverlayCanvas guide transitions", () => {
  it.each([1, 1.2, 2, 3])(
    "matches the prop path on screen at DPR %s",
    (dpr) => {
      // Reproduce the lazy overlay's 500px logical frame and the already-sized
      // props buffer. The painter applies DPR, then CSS fits both to 421px.
      const rendererSize = 505;
      const overlayWidth = 500;
      const displayWidth = 421;
      const point = 150;
      const guideScale = scaleGuideForOverlay(
        rendererSize / 950,
        overlayWidth,
        rendererSize
      );
      const guideOnScreen =
        (point * guideScale * dpr * displayWidth) / (overlayWidth * dpr);
      const propOnScreen =
        (point * (rendererSize / 950) * displayWidth) / rendererSize;
      expect(guideOnScreen).toBeCloseTo(propOnScreen, 12);
    }
  );

  const offscreenCanvases: FakeOffscreenCanvas[] = [];
  const mainDrawCalls: DrawCall[] = [];
  const mainContext = createContext(mainDrawCalls);
  const mainCanvas = {
    width: 0,
    height: 0,
    style: {},
    parentElement: null as HTMLElement | null,
    setAttribute: vi.fn(),
    getContext: vi.fn(() => mainContext),
  };
  const container = {
    firstChild: null,
    insertBefore: vi.fn((canvas: typeof mainCanvas) => {
      canvas.parentElement = container as unknown as HTMLElement;
      return canvas;
    }),
    removeChild: vi.fn((canvas: typeof mainCanvas) => {
      canvas.parentElement = null;
      return canvas;
    }),
  } as unknown as HTMLElement;

  class FakeOffscreenCanvas {
    readonly context = createContext();

    constructor(
      public width: number,
      public height: number
    ) {
      offscreenCanvases.push(this);
    }

    getContext(): ReturnType<typeof createContext> {
      return this.context;
    }
  }

  function setReducedMotion(matches: boolean): void {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches,
        media: "(prefers-reduced-motion: reduce)",
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))
    );
  }

  function render(
    overlay: MandalaOverlayCanvas,
    paths: PreparedMandalaPaths,
    currentTime: number
  ): void {
    overlay.renderFrame({
      preparedPaths: paths,
      progress: 1,
      config: {
        ...DEFAULT_MANDALA_OVERLAY_CONFIG,
        enabled: true,
        mode: "guide",
        opacity: 0.55,
      },
      deltaTime: 1 / 60,
      currentTime,
      canvasSize: 100,
      currentStep: 0,
    });
  }

  beforeEach(() => {
    offscreenCanvases.length = 0;
    mainDrawCalls.length = 0;
    mainCanvas.parentElement = null;
    vi.clearAllMocks();
    vi.stubGlobal("OffscreenCanvas", FakeOffscreenCanvas);
    setReducedMotion(false);
    vi.spyOn(document, "createElement").mockReturnValue(
      mainCanvas as unknown as HTMLCanvasElement
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("crossfades from the exact displayed guide to changed tip geometry", () => {
    const overlay = new MandalaOverlayCanvas();
    const first = preparedPaths(1);
    const second = preparedPaths(2);
    overlay.initialize(container, 100, 100);

    render(overlay, first, 0);
    mainDrawCalls.length = 0;

    render(overlay, second, 100);
    expect(overlay.isTransitioning()).toBe(true);
    expect(mainDrawCalls.map(({ alpha }) => alpha)).toEqual([1, 0]);

    mainDrawCalls.length = 0;
    render(overlay, second, 100 + GUIDE_FADE_MS / 2);
    expect(mainDrawCalls[0]?.alpha).toBeCloseTo(0.5);
    expect(mainDrawCalls[1]?.alpha).toBeCloseTo(0.275);

    mainDrawCalls.length = 0;
    render(overlay, second, 100 + GUIDE_FADE_MS);
    expect(mainDrawCalls.map(({ alpha }) => alpha)).toEqual([0.55]);
    expect(overlay.isTransitioning()).toBe(false);

    overlay.dispose();
  });

  it("uses an instant, fully opaque swap when reduced motion is requested", () => {
    setReducedMotion(true);
    const overlay = new MandalaOverlayCanvas();
    overlay.initialize(container, 100, 100);

    render(overlay, preparedPaths(1), 0);
    mainDrawCalls.length = 0;
    render(overlay, preparedPaths(2), 100);

    expect(mainDrawCalls.map(({ alpha }) => alpha)).toEqual([0.55]);
    expect(overlay.isTransitioning()).toBe(false);

    overlay.dispose();
  });

  it("restarts rapid prop changes from the blend already on screen", () => {
    const overlay = new MandalaOverlayCanvas();
    const first = preparedPaths(1);
    const second = preparedPaths(2);
    const third = preparedPaths(3);
    overlay.initialize(container, 100, 100);

    render(overlay, first, 0);
    render(overlay, second, 100);
    render(overlay, second, 100 + GUIDE_FADE_MS / 2);
    mainDrawCalls.length = 0;

    render(overlay, third, 100 + GUIDE_FADE_MS / 2);

    const snapshotContext = offscreenCanvases[1]?.context;
    expect(snapshotContext?.drawImage).toHaveBeenLastCalledWith(
      mainCanvas,
      0,
      0
    );
    expect(mainDrawCalls.map(({ alpha }) => alpha)).toEqual([1, 0]);
    expect(overlay.isTransitioning()).toBe(true);

    overlay.dispose();
  });
});
