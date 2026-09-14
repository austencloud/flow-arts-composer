/**
 * paintMandalaGuide is the one routine behind the live mandala overlay and
 * every Shape Matrix still. These tests pin what makes those pixels equal:
 * a centered, scaled transform; a stroke compensated to a constant CSS width;
 * round joins; a complete path in guide mode and a dashed reveal otherwise;
 * and the purple overlap only when both hands are present.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MandalaOverlapMasks,
  paintMandalaGuide,
  type MandalaGuideContext,
} from "$lib/shared/mandala/services/mandala-guide-painter";
import type { PreparedMandalaPath } from "$lib/shared/mandala/services/types";

function fakeContext() {
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
    fillRect: vi.fn(),
    translate: vi.fn(),
    setLineDash: vi.fn(),
    stroke: vi.fn(),
    drawImage: vi.fn(),
    strokes: [] as Array<{ color: string; width: number; dash: number[] }>,
  };
  context.stroke.mockImplementation(() => {
    context.strokes.push({
      color: context.strokeStyle,
      width: context.lineWidth,
      dash: context.setLineDash.mock.lastCall?.[0] ?? [],
    });
  });
  return context;
}

class FakeOffscreenCanvas {
  readonly context = fakeContext();
  constructor(
    public width: number,
    public height: number
  ) {}
  getContext() {
    return this.context;
  }
}

function path(
  hand: "left" | "right",
  color: string,
  totalLength = 100
): PreparedMandalaPath {
  return { path2d: {} as Path2D, totalLength, color, hand };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("paintMandalaGuide", () => {
  it("updates the overlap from the active hand colors on the same retained masks", () => {
    vi.stubGlobal("OffscreenCanvas", FakeOffscreenCanvas);
    const masks = new MandalaOverlapMasks();
    const context = fakeContext();
    const target = {
      context: context as unknown as MandalaGuideContext,
      pixelWidth: 200,
      pixelHeight: 200,
      dpr: 1,
    };
    for (const [left, right, overlap] of [
      ["#22c55e", "#dc2626", "#7f7642"],
      ["#ff0000", "#0000ff", "#800080"],
      ["#0f0", "#0f0", "#00ff00"],
    ]) {
      paintMandalaGuide(
        target,
        {
          paths: [path("left", left!), path("right", right!)],
          scale: 1,
          strokeWidth: 2.5,
        },
        masks
      );
      const mask = masks.ensure(200, 200)!
        .leftCanvas as unknown as FakeOffscreenCanvas;
      expect(mask.context.fillStyle).toBe(overlap);
      expect(context.strokes.slice(-2).map((stroke) => stroke.color)).toEqual([
        left,
        right,
      ]);
    }
  });
  it("strokes every path around the center at a constant CSS stroke width", () => {
    vi.stubGlobal("OffscreenCanvas", FakeOffscreenCanvas);
    const context = fakeContext();
    paintMandalaGuide(
      {
        context: context as unknown as MandalaGuideContext,
        pixelWidth: 400,
        pixelHeight: 400,
        dpr: 2,
      },
      {
        paths: [path("left", "#00f"), path("right", "#f00")],
        scale: 1.6,
        strokeWidth: 2.5,
      },
      new MandalaOverlapMasks()
    );

    expect(context.clearRect).toHaveBeenCalledWith(0, 0, 400, 400);
    expect(context.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
    expect(context.translate).toHaveBeenCalledWith(100, 100);
    expect(context.scale).toHaveBeenCalledWith(1.6, 1.6);
    expect(context.lineCap).toBe("round");
    expect(context.lineJoin).toBe("round");
    expect(context.strokes).toEqual([
      { color: "#00f", width: 2.5 / 1.6, dash: [] },
      { color: "#f00", width: 2.5 / 1.6, dash: [] },
    ]);
    expect(context.restore).toHaveBeenCalled();
  });

  it("dashes a progressive reveal and leaves a guide complete", () => {
    const context = fakeContext();
    const target = {
      context: context as unknown as MandalaGuideContext,
      pixelWidth: 100,
      pixelHeight: 100,
      dpr: 1,
    };
    paintMandalaGuide(
      target,
      {
        paths: [path("left", "#00f", 200)],
        scale: 1,
        strokeWidth: 2.5,
        reveal: true,
        progress: 0.25,
      },
      new MandalaOverlapMasks()
    );
    expect(context.strokes[0]?.dash).toEqual([50, 200]);

    context.strokes.length = 0;
    paintMandalaGuide(
      target,
      {
        paths: [path("left", "#00f", 200)],
        scale: 1,
        strokeWidth: 2.5,
        progress: 0.25,
      },
      new MandalaOverlapMasks()
    );
    expect(context.strokes[0]?.dash).toEqual([]);
  });

  it("paints the purple overlap through the hand masks only when both hands exist", () => {
    vi.stubGlobal("OffscreenCanvas", FakeOffscreenCanvas);
    const masks = new MandalaOverlapMasks();
    const context = fakeContext();
    const target = {
      context: context as unknown as MandalaGuideContext,
      pixelWidth: 200,
      pixelHeight: 200,
      dpr: 1,
    };

    paintMandalaGuide(
      target,
      { paths: [path("left", "#00f")], scale: 1, strokeWidth: 2.5 },
      masks
    );
    expect(context.drawImage).not.toHaveBeenCalled();

    paintMandalaGuide(
      target,
      {
        paths: [path("left", "#00f"), path("right", "#f00")],
        scale: 1,
        strokeWidth: 2.5,
      },
      masks
    );
    const pair = masks.ensure(200, 200)!;
    const leftMask = pair.leftCanvas as unknown as FakeOffscreenCanvas;
    const rightMask = pair.rightCanvas as unknown as FakeOffscreenCanvas;
    expect(leftMask.context.strokes.map((s) => s.color)).toEqual(["white"]);
    expect(rightMask.context.strokes.map((s) => s.color)).toEqual(["white"]);
    // The compositor draws the intersected mask onto the target.
    expect(context.drawImage).toHaveBeenCalled();
  });

  it("reuses masks of the same size and releases them on demand", () => {
    vi.stubGlobal("OffscreenCanvas", FakeOffscreenCanvas);
    const masks = new MandalaOverlapMasks();
    const first = masks.ensure(64, 64);
    expect(masks.ensure(64, 64)?.leftCanvas).toBe(first?.leftCanvas);
    expect(masks.ensure(65, 64)?.leftCanvas).not.toBe(first?.leftCanvas);
    masks.release();
    expect(masks.ensure(65, 64)?.leftCanvas).not.toBe(first?.leftCanvas);
    expect(masks.ensure(0, 64)).toBeNull();
  });
});
