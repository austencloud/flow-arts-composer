// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DEFAULT_MANDALA_OVERLAY_CONFIG } from "../../domain/mandala-overlay-types";

const paint = vi.hoisted(() => vi.fn());

vi.mock("../mandala-guide-painter", () => ({
  paintMandalaGuide: paint,
  MandalaOverlapMasks: class {
    release(): void {}
  },
}));

import { MandalaOverlayCanvas } from "../mandala-overlay-canvas";

// The shared setup replaces createElement with export stubs. This service
// appends its canvas to the DOM and sets accessibility attributes, so use
// jsdom elements while retaining the controlled drawing context below.
const realCreateElement = Object.getPrototypeOf(document)
  .createElement as typeof document.createElement;

// A paused post canvas draws the guide once. When the animator changes the
// guide's line width the painted buffer is stale, so the overlay must paint
// again on the width change and only then.
describe("MandalaOverlayCanvas guide line width", () => {
  let stubbedCreateElement: typeof document.createElement;
  const context = {
    scale: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
  };

  beforeEach(() => {
    stubbedCreateElement = document.createElement;
    document.createElement = realCreateElement.bind(document);
    paint.mockClear();
    vi.stubGlobal(
      "OffscreenCanvas",
      class {
        width = 0;
        height = 0;
        getContext() {
          return context;
        }
      }
    );
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      context as never
    );
  });

  afterEach(() => {
    document.createElement = stubbedCreateElement;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function overlay() {
    const instance = new MandalaOverlayCanvas();
    instance.initialize(document.createElement("div"), 200, 200);
    return instance;
  }

  const paths = { paths: [], scale: 1 } as never;
  const frame = (strokeWidth: number, preparedPaths = paths) => ({
    preparedPaths,
    progress: 1,
    config: {
      ...DEFAULT_MANDALA_OVERLAY_CONFIG,
      enabled: true,
      strokeWidth,
    },
    deltaTime: 16,
    currentTime: 0,
    canvasSize: 200,
    currentStep: 0,
  });

  it("repaints when only the line width changes", () => {
    const guide = overlay();
    guide.renderFrame(frame(2.5));
    guide.renderFrame(frame(2.5));
    expect(paint).toHaveBeenCalledTimes(1);

    guide.renderFrame(frame(8));
    expect(paint).toHaveBeenCalledTimes(2);
    expect(paint.mock.calls[1]?.[1].strokeWidth).toBe(8);

    guide.renderFrame(frame(8));
    expect(paint).toHaveBeenCalledTimes(2);
  });
});
