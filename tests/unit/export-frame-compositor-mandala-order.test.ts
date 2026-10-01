import { describe, expect, it, vi } from "vitest";
import {
  ExportFrameCompositor,
  type FrameCompositorConfig,
} from "$lib/features/compose/services/export-frame-compositor";

function config(): FrameCompositorConfig {
  return {
    outputWidth: 950,
    outputHeight: 950,
    sourceWidth: 950,
    headerHeight: 0,
    progressBarHeight: 0,
    outputCanvasSize: 950,
    scaleFactor: 1,
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

describe("ExportFrameCompositor mandala stacking", () => {
  it("draws the mandala below the scene and trail overlays", () => {
    const mandala = {
      width: 950,
      height: 950,
      getAttribute: (name: string) =>
        name === "data-animation-layer" ? "mandala" : null,
    } as unknown as HTMLCanvasElement;
    const trails = {
      width: 950,
      height: 950,
      getAttribute: () => null,
    } as unknown as HTMLCanvasElement;
    const host = {
      querySelectorAll: () => [mandala, scene, trails],
    } as unknown as HTMLElement;
    const scene = {
      width: 950,
      height: 950,
      parentElement: host,
      getAttribute: () => null,
    } as unknown as HTMLCanvasElement;

    const drawImage = vi.fn();
    const ctx = {
      fillStyle: "",
      fillRect: vi.fn(),
      drawImage,
    } as unknown as CanvasRenderingContext2D;
    const output = {} as HTMLCanvasElement;
    const compositor = new ExportFrameCompositor(
      config(),
      {} as ConstructorParameters<typeof ExportFrameCompositor>[1],
      {} as ConstructorParameters<typeof ExportFrameCompositor>[2]
    );

    compositor.renderCanvasLayers(ctx, scene, false, 0, output, 0);

    expect(drawImage.mock.calls.map((call) => call[0])).toEqual([
      mandala,
      scene,
      trails,
    ]);
  });
});

describe("ExportFrameCompositor elemental glyph", () => {
  it("uses the canonical bottom-right slot and preserves the image aspect ratio", () => {
    const elementalImage = { width: 200, height: 100 } as ImageBitmap;
    const glyphPrerenderer = {
      getCacheKeyForStep: () => "",
      getElementalGlyphForStep: () => ({
        image: elementalImage,
        sourceWidth: 200,
        sourceHeight: 100,
      }),
    } as unknown as ConstructorParameters<typeof ExportFrameCompositor>[1];
    const compositor = new ExportFrameCompositor(
      { ...config(), showElementalGlyph: true },
      glyphPrerenderer,
      {} as ConstructorParameters<typeof ExportFrameCompositor>[2]
    );
    const drawImage = vi.fn();
    const ctx = {
      drawImage,
      save: vi.fn(),
      restore: vi.fn(),
      globalAlpha: 1,
    } as unknown as CanvasRenderingContext2D;

    compositor.renderOverlays(
      ctx,
      {} as HTMLCanvasElement,
      0,
      false,
      false,
      1,
      [{}],
      [1],
      0
    );

    const [image, x, y, width, height] = drawImage.mock.calls[0]!;
    expect(image).toBe(elementalImage);
    expect(x).toBeCloseTo(798);
    expect(y).toBeCloseTo(826);
    expect(width).toBeCloseTo(112);
    expect(height).toBeCloseTo(56);
  });

  it("crossfades elemental glyphs between animation steps", () => {
    const firstImage = { width: 100, height: 100 } as ImageBitmap;
    const secondImage = { width: 100, height: 100 } as ImageBitmap;
    const elementalGlyphs = [firstImage, secondImage].map((image) => ({
      image,
      sourceWidth: 100,
      sourceHeight: 100,
    }));
    const glyphPrerenderer = {
      getCacheKeyForStep: () => "",
      getElementalGlyphForStep: (stepIndex: number) =>
        elementalGlyphs[stepIndex] ?? null,
    } as unknown as ConstructorParameters<typeof ExportFrameCompositor>[1];
    const compositor = new ExportFrameCompositor(
      { ...config(), fps: 10, showElementalGlyph: true },
      glyphPrerenderer,
      {} as ConstructorParameters<typeof ExportFrameCompositor>[2]
    );
    const alphaStack: number[] = [];
    const draws: Array<{ image: CanvasImageSource; alpha: number }> = [];
    const context = {
      globalAlpha: 1,
      save() {
        alphaStack.push(this.globalAlpha);
      },
      restore() {
        this.globalAlpha = alphaStack.pop() ?? 1;
      },
      drawImage(image: CanvasImageSource) {
        draws.push({ image, alpha: this.globalAlpha });
      },
    };
    const ctx = context as unknown as CanvasRenderingContext2D;
    const renderStep = (stepIndex: number) => {
      compositor.renderOverlays(
        ctx,
        {} as HTMLCanvasElement,
        stepIndex,
        false,
        false,
        stepIndex + 1,
        [{}, {}],
        [1, 1],
        0
      );
    };

    renderStep(0);
    renderStep(0);
    renderStep(0);
    draws.length = 0;

    renderStep(1);
    expect(draws).toEqual([
      { image: firstImage, alpha: 1 },
      { image: secondImage, alpha: 0 },
    ]);

    draws.length = 0;
    renderStep(1);
    expect(draws).toEqual([
      { image: firstImage, alpha: 0.5 },
      { image: secondImage, alpha: 0.5 },
    ]);

    draws.length = 0;
    renderStep(1);
    expect(draws).toEqual([{ image: secondImage, alpha: 1 }]);
  });

  it("does not draw an elemental glyph over the start position", () => {
    const glyphPrerenderer = {
      getCacheKeyForStep: () => "",
      getElementalGlyphForStep: vi.fn(),
    } as unknown as ConstructorParameters<typeof ExportFrameCompositor>[1];
    const compositor = new ExportFrameCompositor(
      { ...config(), showElementalGlyph: true },
      glyphPrerenderer,
      {} as ConstructorParameters<typeof ExportFrameCompositor>[2]
    );

    compositor.renderOverlays(
      { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D,
      {} as HTMLCanvasElement,
      0,
      true,
      false,
      0,
      [{}],
      [1],
      0
    );

    expect(glyphPrerenderer.getElementalGlyphForStep).not.toHaveBeenCalled();
  });

  it("does not request an elemental asset when the display setting is off", () => {
    const glyphPrerenderer = {
      getCacheKeyForStep: () => "",
      getElementalGlyphForStep: vi.fn(),
    } as unknown as ConstructorParameters<typeof ExportFrameCompositor>[1];
    const compositor = new ExportFrameCompositor(
      config(),
      glyphPrerenderer,
      {} as ConstructorParameters<typeof ExportFrameCompositor>[2]
    );

    compositor.renderOverlays(
      { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D,
      {} as HTMLCanvasElement,
      0,
      false,
      false,
      1,
      [{}],
      [1],
      0
    );

    expect(glyphPrerenderer.getElementalGlyphForStep).not.toHaveBeenCalled();
  });
});
