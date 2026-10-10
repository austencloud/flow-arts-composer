import { describe, expect, it, vi } from "vitest";

// Stand-ins for the pictograph and glyph rasterizers. Each image carries a tag
// naming what it is (and, for the strip, the size it was rendered at), so a
// paint shows which cache it drew from.
vi.mock("#lib/shared/render/services/canvas-2d-direct-renderer.js", () => ({
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
vi.mock("#lib/shared/pictograph/shared/services/pictograph-preparer.js", () => ({
  pictographPreparer: { prepareSingle: async () => ({ _prepared: undefined }) },
}));
vi.mock("#lib/shared/timeline/notation-cell.js", () => ({
  buildNotationCells: () => [{ data: {} }, { data: {} }, { data: {} }],
}));
vi.mock("#lib/shared/mandala/services/mandala-path-preparer.js", () => ({
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
  "#lib/shared/animation-engine/services/export-glyph-prerenderer.js",
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
vi.mock("#lib/shared/foundation/get-svg-image-converter.js", () => ({
  getSvgImageConverter: () => ({}),
}));

import { sequenceFrameAt } from "#lib/shared/media-composition/domain/sequence-frame.js";
import { getSequenceProgressStripHeight } from "#lib/shared/animation-engine/services/sequence-progress-renderer.js";
import { createSequenceStripPainter } from "#lib/shared/media-composition/services/sequence-strip-painter.js";
import {
  paintSizeBucket,
  type PaintFrame,
} from "#lib/shared/media-composition/services/post-studio-layer-painter.js";
import { PostAnimationOverlayPainter } from "#lib/features/compose/services/post-animation-overlay-painter.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

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
    fillRect: vi.fn(),
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

    expect(marks.map((entry) => entry.alpha)).toEqual([0.25, 1, 1, 1, 1]);
  });
});

describe("legacy Moves progress", () => {
  it("tracks duration-weighted sequence progress through seeking, loops and ending holds", async () => {
    const painter = createSequenceStripPainter({ sequence, mode: "arrows" });
    await painter.prepare({ width: 500, height: 500 });
    const { context } = recordingContext();
    const fillRect = vi.mocked(context.fillRect);
    for (const [arrival, expected] of [
      [0, 0],
      [1.5, 0.7],
      [2, 1],
      [0.5, 0.2],
      [2.5, 0.2],
      [4, 1],
    ]) {
      fillRect.mockClear();
      painter.paint(
        context,
        { x: 0, y: 0, width: 500, height: 500 },
        {
          ...frame,
          projectProgress: 0.99,
          sequenceFrame: sequenceFrameAt(arrival!, [2, 3], { endArrival: 4 }),
        }
      );
      const barHeight = getSequenceProgressStripHeight(500);
      const barMarks = fillRect.mock.calls.filter((call) => call[3] === barHeight);
      // First mark is the empty track. A filled bar exists only past opening.
      expect(barMarks).toHaveLength(expected! > 0 ? 2 : 1);
      if (expected! > 0) expect(barMarks[1]![2]).toBeCloseTo(500 * expected!);
    }
  });

  it("reads the visibility preference at paint time, including while paused", async () => {
    let visible = true;
    const painter = createSequenceStripPainter({
      sequence,
      mode: "arrows",
      showProgressBar: () => visible,
    });
    await painter.prepare({ width: 500, height: 500 });
    const { context } = recordingContext();
    painter.paint(context, { x: 0, y: 0, width: 500, height: 500 }, frame);
    expect(context.fillRect).toHaveBeenCalledTimes(3);
    visible = false;
    vi.mocked(context.fillRect).mockClear();
    painter.paint(context, { x: 0, y: 0, width: 500, height: 500 }, frame);
    expect(context.fillRect).toHaveBeenCalledTimes(1);
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

    const img500 = `img-${paintSizeBucket(500)}`;
    const img300 = `img-${paintSizeBucket(300)}`;
    expect(paintAt(painter, 500, 500)).toEqual([img500, img500]);
    expect(paintAt(painter, 300, 533)).toEqual([img300, img300]);
    // bucket(153) was the size asked for longest ago and was evicted to make
    // room for bucket(500); a resize never blanks, though - paint falls back
    // to the nearest raster still cached (bucket(150), one rung away)
    // instead of waiting for a fresh prepare() to resolve.
    const img150 = `img-${paintSizeBucket(150)}`;
    expect(paintAt(painter, 153, 153)).toEqual([img150, img150]);
  });

  it("coalesces nearby sizes onto one bucket without a second prepare", async () => {
    const painter = createSequenceStripPainter({ sequence, mode: "arrows" });
    await painter.prepare({ width: 145, height: 145 });

    // 145 and 150 round up to the same 6% ladder rung, so the raster prepared
    // for 145 already serves a paint at 150 - no prepare(150) call, and no
    // fallback needed since the bucket itself is an exact cache hit.
    expect(paintSizeBucket(145)).toBe(paintSizeBucket(150));
    const img = `img-${paintSizeBucket(145)}`;
    expect(paintAt(painter, 150, 150)).toEqual([img, img]);
  });

  it("falls back to the nearest cached size instead of leaving a blank", async () => {
    const painter = createSequenceStripPainter({ sequence, mode: "arrows" });
    await painter.prepare({ width: 300, height: 300 });

    // Only bucket(300) is cached; a paint at a size in a different bucket
    // still draws, using the one raster that exists, rather than skipping.
    expect(paintSizeBucket(300)).not.toBe(paintSizeBucket(200));
    const img = `img-${paintSizeBucket(300)}`;
    expect(paintAt(painter, 200, 200)).toEqual([img, img]);
  });
});

describe("strip arrow handoff", () => {
  it("paints independent cached arrows at the frame opacities, including after a backward seek", async () => {
    const painter = createSequenceStripPainter({ sequence, mode: "arrows" });
    await painter.prepare({ width: 500, height: 500 });
    const paint = (arrival: number) => {
      const { context, marks } = recordingContext(0.5);
      painter.paint(
        context,
        { x: 0, y: 0, width: 500, height: 500 },
        {
          ...frame,
          sequenceFrame: sequenceFrameAt(arrival, BEATS),
        }
      );
      expect(context.globalAlpha).toBe(0.5);
      return marks.map((mark) => mark.alpha);
    };
    const boundary = paint(1.025);
    expect(boundary).toHaveLength(3);
    expect(boundary[0]).toBe(0.5);
    expect(boundary[1]).toBeCloseTo(0.0125);
    expect(boundary[2]).toBeCloseTo(0.25);
    paint(3.5);
    expect(paint(1.025)).toEqual(boundary);
    // First move has no outgoing arrow; after the handoff only the new arrow remains.
    expect(paint(0.025)).toHaveLength(2);
    expect(paint(1.1)).toHaveLength(2);
    expect(paint(2.025)[2]).toBeCloseTo(0.25);
  });
});
