import { describe, expect, it, vi } from "vitest";

// Stand-ins for the pictograph and glyph rasterizers. Each image carries a tag
// naming what it is (and, for the strip, the size it was rendered at), so a
// paint shows which cache it drew from.
vi.mock("$lib/shared/render/services/canvas-2d-direct-renderer", () => ({
  Canvas2DDirectRenderer: class {
    async initialize() {}
    async preparePropSprite() {
      return null;
    }
    async renderPictograph(_prepared: unknown, options: { size: number }) {
      return { tag: `img-${options.size}` };
    }
  },
}));
vi.mock("$lib/shared/pictograph/shared/services/pictograph-preparer", () => ({
  pictographPreparer: { prepareSingle: async () => ({ _prepared: undefined }) },
}));
vi.mock("$lib/shared/timeline/notation-cell", () => ({
  buildNotationCells: () => [{ data: {} }, { data: {} }, { data: {} }],
}));
vi.mock("$lib/shared/mandala/services/mandala-path-preparer", () => ({
  MandalaPathPreparer: class {
    prepare() {
      return {
        paths: [
          { hand: "left", color: "#2a8cff", path2d: {}, totalLength: 100 },
        ],
      };
    }
  },
  computeEngineAlignedMandalaScale: () => 1,
}));
vi.mock(
  "$lib/shared/animation-engine/services/export-glyph-prerenderer",
  () => ({
    ExportGlyphPrerenderer: class {
      async prerenderGlyphs() {}
      async prerenderElementalGlyphs() {}
      getCacheKeyForStep() {
        return "glyph";
      }
      getGlyph() {
        return {
          image: { tag: "letter" },
          xOffset: 0,
          yOffset: 0,
          dimensions: { width: 10, height: 10 },
        };
      }
      getElementalGlyphForStep() {
        return { image: { tag: "element" }, sourceWidth: 10, sourceHeight: 10 };
      }
    },
  })
);
vi.mock("$lib/shared/foundation/get-svg-image-converter", () => ({
  getSvgImageConverter: () => ({}),
}));

import { sequenceFrameAt } from "$lib/shared/media-composition/domain/sequence-frame";
import { createSequenceStripPainter } from "$lib/shared/media-composition/services/sequence-strip-painter";
import type { PaintFrame } from "$lib/shared/media-composition/services/post-studio-layer-painter";
import { PostAnimationOverlayPainter } from "$lib/features/compose/services/post-animation-overlay-painter";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

const BEATS = [1, 1];

const sequence = {
  steps: BEATS.map((duration, index) => ({
    duration,
    letter: null,
    stepNumber: index + 1,
  })),
} as unknown as SequenceData;

/** Move 2, halfway through. */
const frame: PaintFrame = {
  projectProgress: 0.5,
  sourceTimeSeconds: 1,
  sequenceFrame: sequenceFrameAt(1.5, BEATS),
};

/**
 * A 2D context that keeps a real save/restore stack for globalAlpha, the way
 * a canvas does, and records the alpha every visible mark was made at.
 */
function recordingContext(alpha = 1) {
  const stack: number[] = [];
  const marks: Array<{ mark: string; alpha: number }> = [];
  const context = {
    globalAlpha: alpha,
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineCap: "",
    lineJoin: "",
    font: "",
    textBaseline: "",
    textAlign: "",
    save() {
      stack.push(this.globalAlpha);
    },
    restore() {
      this.globalAlpha = stack.pop() ?? 1;
    },
    translate() {},
    scale() {},
    beginPath() {},
    rect() {},
    clip() {},
    moveTo() {},
    lineTo() {},
    setLineDash() {},
    fillRect() {},
    createLinearGradient: () => ({ addColorStop() {} }),
    stroke() {
      marks.push({ mark: "stroke", alpha: this.globalAlpha });
    },
    fillText(text: string) {
      marks.push({ mark: `text ${text}`, alpha: this.globalAlpha });
    },
    drawImage(image: { tag: string }) {
      marks.push({ mark: image.tag, alpha: this.globalAlpha });
    },
  };
  return { context: context as unknown as CanvasRenderingContext2D, marks };
}

describe("painters in a fading layer", () => {
  // The render fades an act in by setting the context's alpha before a
  // painter draws; the preview fades the whole canvas instead. Either way
  // every mark has to fade together.
  it("draws the mandala at the layer's fade", async () => {
    const painter = createSequenceStripPainter({ sequence, mode: "mandala" });
    await painter.prepare({ width: 500, height: 500 });
    const { context, marks } = recordingContext(0.5);

    painter.paint(context, { x: 0, y: 0, width: 500, height: 500 }, frame);

    // The faint full path, then the bright traced part.
    expect(marks).toEqual([
      { mark: "stroke", alpha: 0.125 },
      { mark: "stroke", alpha: 0.5 },
    ]);
    expect(context.globalAlpha).toBe(0.5);
  });

  it("draws the beat number, letter and element at the layer's fade", async () => {
    const painter = new PostAnimationOverlayPainter(sequence);
    await painter.prepare({ width: 960, height: 960 });
    const { context, marks } = recordingContext(0.5);

    painter.paint(context, { x: 0, y: 0, width: 960, height: 960 }, frame);

    expect(marks).toEqual([
      { mark: "text 2", alpha: 0.5 },
      { mark: "letter", alpha: 0.5 },
      { mark: "element", alpha: 0.5 },
      // The progress bar.
      { mark: "stroke", alpha: 0.5 },
    ]);
  });

  it("draws both at full strength outside a fade", async () => {
    const strip = createSequenceStripPainter({ sequence, mode: "mandala" });
    const overlay = new PostAnimationOverlayPainter(sequence);
    await strip.prepare({ width: 500, height: 500 });
    await overlay.prepare({ width: 960, height: 960 });
    const { context, marks } = recordingContext();

    strip.paint(context, { x: 0, y: 0, width: 500, height: 500 }, frame);
    overlay.paint(context, { x: 0, y: 0, width: 960, height: 960 }, frame);

    expect(marks.map((entry) => entry.alpha)).toEqual([0.25, 1, 1, 1, 1, 1]);
  });
});

describe("strip painter sizes", () => {
  function paintAt(
    painter: ReturnType<typeof createSequenceStripPainter>,
    width: number,
    height: number
  ): string[] {
    const { context, marks } = recordingContext();
    painter.paint(context, { x: 0, y: 0, width, height }, frame);
    return marks.map((entry) => entry.mark);
  }

  it("keeps the preview's size through a visit to Timing and a render", async () => {
    const painter = createSequenceStripPainter({ sequence, mode: "arrows" });
    // The Acts preview's strip.
    await painter.prepare({ width: 300, height: 533 });
    // Timing's square, before and after its video's size is known.
    await painter.prepare({ width: 153, height: 153 });
    await painter.prepare({ width: 150, height: 150 });
    // Back on Acts, the remounted strip asks for its size again.
    await painter.prepare({ width: 300, height: 533 });
    // The render asks for its own.
    await painter.prepare({ width: 500, height: 500 });

    expect(paintAt(painter, 500, 500)).toEqual(["img-500", "img-500"]);
    expect(paintAt(painter, 300, 533)).toEqual(["img-300", "img-300"]);
    // The size asked for longest ago made room.
    expect(paintAt(painter, 153, 153)).toEqual([]);
  });
});
