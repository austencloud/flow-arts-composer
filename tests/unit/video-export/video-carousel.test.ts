import { describe, expect, it, vi } from "vitest";
import {
  isVideoCarouselPlacement,
  layoutVideoCarouselFrame,
  videoCarouselPosition,
  videoCarouselSourceFrame,
} from "#lib/shared/video-export/domain/video-carousel.js";
import {
  ExportFrameCompositor,
  type FrameCompositorConfig,
} from "#lib/shared/video-export/services/export-frame-compositor.js";
import { getExportDimensions } from "#lib/shared/animation-engine/domain/video-export-calculations.js";

describe("video carousel frame", () => {
  it("accepts only the five placements", () => {
    expect(isVideoCarouselPlacement("left")).toBe(true);
    expect(isVideoCarouselPlacement("off")).toBe(true);
    expect(isVideoCarouselPlacement("middle")).toBe(false);
    expect(isVideoCarouselPlacement(undefined)).toBe(false);
  });

  it("makes a 1080p video taller than wide below or above, wider beside", () => {
    const square = 600;
    const header = 42;
    const below = videoCarouselSourceFrame({
      placement: "below",
      squareSize: square,
      headerHeight: header,
    });
    const right = videoCarouselSourceFrame({
      placement: "right",
      squareSize: square,
      headerHeight: header,
    });
    expect(getExportDimensions(1080, below.width / below.height)).toEqual({
      width: 812,
      height: 1080,
    });
    const wide = getExportDimensions(1080, right.width / right.height);
    expect(wide.height).toBe(1080);
    expect(wide.width).toBeGreaterThan(1080);
  });

  it("tiles the frame with the card and the band on every side", () => {
    for (const placement of ["above", "below", "left", "right"] as const) {
      const frame = layoutVideoCarouselFrame({
        placement,
        outputWidth: placement === "left" || placement === "right" ? 1272 : 812,
        outputHeight: 1080,
        sourceSquareSize: 600,
        sourceHeaderHeight: 42,
      });
      const cardWidth = frame.canvasSize;
      const cardHeight = frame.headerHeight + frame.canvasSize;
      const total =
        frame.orientation === "horizontal"
          ? cardHeight + frame.band.height
          : cardWidth + frame.band.width;
      expect(total).toBe(frame.orientation === "horizontal" ? 1080 : 1272);
      expect(frame.band.width).toBeGreaterThan(0);
      expect(frame.band.height).toBeGreaterThan(0);
      // The band never overlaps the card.
      const overlapsX =
        frame.band.x < frame.cardX + cardWidth &&
        frame.cardX < frame.band.x + frame.band.width;
      const overlapsY =
        frame.band.y < frame.cardY + cardHeight &&
        frame.cardY < frame.band.y + frame.band.height;
      expect(overlapsX && overlapsY).toBe(false);
    }
  });

  it("keeps a progress bar under the square beside the band", () => {
    const below = layoutVideoCarouselFrame({
      placement: "below",
      outputWidth: 812,
      outputHeight: 1080,
      sourceSquareSize: 600,
      sourceHeaderHeight: 42,
      sourceFooterHeight: 24,
    });
    expect(below.footerHeight).toBe(Math.round((24 * 812) / 600));
    // The band starts under the bar, and the frame still adds up.
    expect(below.band.y).toBe(
      below.headerHeight + below.canvasSize + below.footerHeight
    );
    expect(below.band.y + below.band.height).toBe(1080);

    const right = layoutVideoCarouselFrame({
      placement: "right",
      outputWidth: 1272,
      outputHeight: 1080,
      sourceSquareSize: 600,
      sourceHeaderHeight: 42,
      sourceFooterHeight: 24,
    });
    expect(
      right.headerHeight + right.canvasSize + right.footerHeight
    ).toBe(1080);
    expect(right.band.x).toBe(right.canvasSize);

    const withBar = videoCarouselSourceFrame({
      placement: "below",
      squareSize: 600,
      headerHeight: 42,
      footerHeight: 24,
    });
    expect(withBar.height).toBeCloseTo(600 + 42 + 24 + 600 * 0.26);
  });

  it("puts the band on the chosen side", () => {
    const at = (placement: "above" | "below" | "left" | "right") =>
      layoutVideoCarouselFrame({
        placement,
        outputWidth: placement === "left" || placement === "right" ? 1272 : 812,
        outputHeight: 1080,
        sourceSquareSize: 600,
        sourceHeaderHeight: 42,
      });
    expect(at("above").band.y).toBe(0);
    expect(at("above").cardY).toBe(at("above").band.height);
    expect(at("below").cardY).toBe(0);
    expect(at("left").band.x).toBe(0);
    expect(at("left").cardX).toBe(at("left").band.width);
    expect(at("right").cardX).toBe(0);
    expect(at("right").band.x).toBe(at("right").canvasSize);
  });
});

describe("video carousel position", () => {
  const timing = { beatCount: 4, loopCount: 2, settlesOnLastBeat: true };

  it("focuses the start pose during the start placement", () => {
    expect(
      videoCarouselPosition({ ...timing, phase: "start", startProgress: 0.5 })
    ).toBe(0.5);
    expect(
      videoCarouselPosition({ ...timing, phase: "start", startProgress: 1 })
    ).toBeLessThan(1);
  });

  it("counts on through repeats so the row never rewinds", () => {
    expect(
      videoCarouselPosition({ ...timing, phase: "motion", motionBeats: 0 })
    ).toBe(1);
    expect(
      videoCarouselPosition({ ...timing, phase: "motion", motionBeats: 5.25 })
    ).toBe(6.25);
  });

  it("settles on the last beat instead of sliding toward a next pass", () => {
    const end = videoCarouselPosition({ ...timing, phase: "end" });
    expect(end).toBe(8.5);
    expect(
      videoCarouselPosition({ ...timing, phase: "motion", motionBeats: 7.95 })
    ).toBe(end);
    expect(
      videoCarouselPosition({
        ...timing,
        settlesOnLastBeat: false,
        phase: "motion",
        motionBeats: 7.95,
      })
    ).toBeCloseTo(8.95);
  });
});

function config(): FrameCompositorConfig {
  return {
    outputWidth: 812,
    outputHeight: 1080,
    sourceWidth: 600,
    headerHeight: 57,
    progressBarHeight: 0,
    outputCanvasSize: 812,
    scaleFactor: 812 / 600,
    fps: 60,
    showTkaGlyph: false,
    showElementalGlyph: false,
    showStepNumbers: false,
    showWordHeader: false,
    showProgressBar: false,
    isDarkMode: true,
    isCompositeMode: false,
    sequenceWord: "",
    difficultyLevel: null,
    loopComponents: null,
    rotationPeriod: undefined,
    inversionPeriod: undefined,
    overlayComponents: null,
    showLeftPathLines: false,
    showRightPathLines: false,
    sequenceSteps: [],
  };
}

describe("ExportFrameCompositor carousel band", () => {
  it("draws the animation below the band and paints the band in its rect", () => {
    const host = { querySelectorAll: () => [] } as unknown as HTMLElement;
    const scene = {
      width: 600,
      height: 600,
      parentElement: host,
    } as unknown as HTMLCanvasElement;
    const paint = vi.fn();
    const band = { x: 0, y: 0, width: 812, height: 211 };
    const compositor = new ExportFrameCompositor(
      {
        ...config(),
        cardOffset: { x: 0, y: 211 },
        carousel: {
          painter: { prepare: async () => {}, paint },
          rect: band,
        },
      },
      {} as ConstructorParameters<typeof ExportFrameCompositor>[1],
      {} as ConstructorParameters<typeof ExportFrameCompositor>[2]
    );
    const drawImage = vi.fn();
    const ctx = {
      fillStyle: "",
      fillRect: vi.fn(),
      drawImage,
    } as unknown as CanvasRenderingContext2D;

    compositor.renderCanvasLayers(
      ctx,
      scene,
      false,
      0,
      { width: 812, height: 1080 } as HTMLCanvasElement,
      0
    );
    compositor.renderCarousel(ctx, 2.5);

    const [, , , , , x, y, width] = drawImage.mock.calls[0]!;
    expect([x, y, width]).toEqual([0, 211 + 57, 812]);
    expect(paint).toHaveBeenCalledWith(
      ctx,
      band,
      expect.objectContaining({ carouselPosition: 2.5 })
    );
  });

  it("paints nothing without a band", () => {
    const compositor = new ExportFrameCompositor(
      config(),
      {} as ConstructorParameters<typeof ExportFrameCompositor>[1],
      {} as ConstructorParameters<typeof ExportFrameCompositor>[2]
    );
    expect(() =>
      compositor.renderCarousel({} as CanvasRenderingContext2D, 1)
    ).not.toThrow();
  });
});
