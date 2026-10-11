import { describe, expect, it } from "vitest";
import { PURPLE_STROKE } from "#lib/shared/mandala/domain/mandala-constants.js";
import { compositeMandalaOverlap } from "#lib/shared/mandala/services/mandala-overlap-compositor.js";

describe("mandala overlap compositor", () => {
  it("intersects the hand masks and paints the shared pixels purple", () => {
    const operations: string[] = [];
    const leftMask = {} as OffscreenCanvas;
    const rightMask = {} as OffscreenCanvas;
    const overlapMaskContext = {
      setTransform: () => operations.push("mask:identity"),
      set globalCompositeOperation(value: GlobalCompositeOperation) {
        operations.push(`mask:composite:${value}`);
      },
      drawImage: (source: CanvasImageSource) => {
        expect(source).toBe(rightMask);
        operations.push("mask:intersect-red");
      },
      set fillStyle(value: string | CanvasGradient | CanvasPattern) {
        expect(value).toBe(PURPLE_STROKE);
        operations.push("mask:purple");
      },
      fillRect: () => operations.push("mask:fill"),
    } as unknown as OffscreenCanvasRenderingContext2D;
    const targetContext = {
      save: () => operations.push("target:save"),
      setTransform: () => operations.push("target:identity"),
      set globalCompositeOperation(value: GlobalCompositeOperation) {
        operations.push(`target:composite:${value}`);
      },
      set globalAlpha(value: number) {
        operations.push(`target:alpha:${value}`);
      },
      drawImage: (source: CanvasImageSource) => {
        expect(source).toBe(leftMask);
        operations.push("target:draw-overlap");
      },
      restore: () => operations.push("target:restore"),
    } as unknown as OffscreenCanvasRenderingContext2D;

    compositeMandalaOverlap({
      targetContext,
      overlapMaskContext,
      overlapMaskCanvas: leftMask,
      otherMaskCanvas: rightMask,
      width: 950,
      height: 950,
    });

    expect(operations).toEqual([
      "mask:identity",
      "mask:composite:destination-in",
      "mask:intersect-red",
      "mask:composite:source-in",
      "mask:purple",
      "mask:fill",
      "target:save",
      "target:identity",
      "target:composite:source-over",
      "target:alpha:0.9",
      "target:draw-overlap",
      "target:restore",
    ]);
  });
});
