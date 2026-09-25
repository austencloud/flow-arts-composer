/**
 * Tests for the PER-CARD card-back element rasterizers.
 *
 * The turn glyph, reversal glyph, step count, and loop row are now CANVAS-NATIVE
 * (drawn directly to an OffscreenCanvas — no DOM mount, no screenshot). jsdom has
 * no OffscreenCanvas/createImageBitmap, so we stub them with a RECORDING fake 2d
 * context and assert behavior via the recorded draw calls (bar fills, dot
 * arcs/colors, the step-count fillText, loop-row icon drawImage + label text).
 *
 * The loop-row icons stay mount-rasterized but CACHED via
 * `rasterizeLoopIconByKind` (constant sibling); that's mocked here to a fake
 * bitmap so the row composition runs without a real mount.
 *
 * The start-placement pictograph is unchanged (renders via the injected
 * `renderPicto`); its tests are kept as-is.
 *
 * The real visual/parity check happens in the browser harness (P1.7,
 * /test/card-back-parity).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

// rasterizeLoopIconByKind pulls CardBackLoopIcon → SwapIcon/CheckerboardCircleIcon
// (Svelte components) which don't import cleanly in vitest; mock it to a fake
// cached bitmap. The loop-row composer only needs the bitmap's width/height.
const loopIconCalls: Array<{ kind: string; fa: string; color: string; theme?: string }> = [];
vi.mock("../card-back-bitmaps-constant", () => ({
  rasterizeLoopIconByKind: vi.fn(async (kind: string, fa: string, color: string, theme?: string) => {
    loopIconCalls.push({ kind, fa, color, theme });
    return { width: 148, height: 148, close: vi.fn() } as unknown as ImageBitmap;
  }),
}));

import {
  rasterizeTurnGlyph,
  rasterizeReversalGlyph,
  rasterizeStepCount,
  rasterizeLoopRow,
  rasterizeStartPlacementPictograph,
  CARD_RENDER_WIDTH,
  __setRenderPictoFnForTest,
  type LoopRowCol,
} from "../card-back-bitmaps-percard";

const CQI = CARD_RENDER_WIDTH / 100; // 16.44

interface RenderPictoCall {
  pictograph: unknown;
  options: { size: number; visibility: Record<string, unknown> };
}

// ── Recording fake 2d context ───────────────────────────────────────────────
interface FakeCtxRec {
  fills: Array<{ style: string; alpha: number }>;
  arcs: Array<{ cx: number; cy: number; r: number; style: string; alpha: number }>;
  texts: Array<{ text: string; x: number; y: number; align: string; baseline: string; font: string; style: string }>;
  images: Array<{ x: number; y: number; w: number; h: number }>;
}

function makeFakeCtx(rec: FakeCtxRec) {
  const ctx = {
    fillStyle: "" as string,
    strokeStyle: "" as string,
    globalAlpha: 1,
    lineWidth: 0,
    font: "" as string,
    textAlign: "start" as string,
    textBaseline: "alphabetic" as string,
    save: vi.fn(),
    restore: vi.fn(),
    clip: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arcTo: vi.fn(),
    stroke: vi.fn(),
    rect: vi.fn(),
    roundRect: vi.fn(),
    arc: vi.fn((cx: number, cy: number, r: number) => {
      // record on the next fill (color/alpha resolved at fill time)
      pendingArc = { cx, cy, r };
    }),
    fill: vi.fn(() => {
      if (pendingArc) {
        rec.arcs.push({ ...pendingArc, style: ctx.fillStyle, alpha: ctx.globalAlpha });
        pendingArc = null;
      } else {
        rec.fills.push({ style: ctx.fillStyle, alpha: ctx.globalAlpha });
      }
    }),
    fillRect: vi.fn(() => rec.fills.push({ style: ctx.fillStyle, alpha: ctx.globalAlpha })),
    fillText: vi.fn((text: string, x: number, y: number) => {
      rec.texts.push({
        text, x, y,
        align: ctx.textAlign, baseline: ctx.textBaseline,
        font: ctx.font, style: ctx.fillStyle,
      });
    }),
    measureText: vi.fn((t: string) => ({ width: t.length * 5 })),
    drawImage: vi.fn((_img: unknown, x: number, y: number, w: number, h: number) => {
      rec.images.push({ x, y, w, h });
    }),
  };
  let pendingArc: { cx: number; cy: number; r: number } | null = null;
  return ctx;
}

let currentRec: FakeCtxRec;

function freshRec(): FakeCtxRec {
  return { fills: [], arcs: [], texts: [], images: [] };
}

function stubCanvasGlobals() {
  vi.stubGlobal("OffscreenCanvas", class {
    public ctx = makeFakeCtx(currentRec);
    constructor(public width: number, public height: number) {}
    getContext() { return this.ctx; }
  });
  vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 1, height: 1, close: vi.fn() })));
}

describe("card-back-bitmaps-percard rasterizers (canvas-native)", () => {
  beforeEach(() => {
    currentRec = freshRec();
    loopIconCalls.length = 0;
    stubCanvasGlobals();
  });

  afterEach(() => {
    __setRenderPictoFnForTest(null);
    vi.unstubAllGlobals();
  });

  describe("rasterizeTurnGlyph", () => {
    it("draws a blue + red bar fill per entry", async () => {
      await rasterizeTurnGlyph([
        { left: 1, right: 0 },
        { left: 2, right: 0.5 },
      ]);
      // 2 entries × 2 solid bars = 4 fills, with blue + red colors present.
      expect(currentRec.fills.length).toBe(4);
      const colors = currentRec.fills.map((f) => f.style);
      expect(colors).toContain("#3498db"); // blue
      expect(colors).toContain("#e74c3c"); // red
    });

    it("float bars are stroked (hatched) at 0.7 alpha, not solid-filled", async () => {
      await rasterizeTurnGlyph([{ left: 1, right: 0, leftFloat: true }]);
      // blue is float → no solid fill for it; red (0-turn) → one solid fill.
      expect(currentRec.fills.length).toBe(1);
      expect(currentRec.fills[0]!.style).toBe("#e74c3c");
      // float bar produced hatch strokes
      const ctx = (globalThis as unknown as { OffscreenCanvas: new (w: number, h: number) => { getContext(): { stroke: ReturnType<typeof vi.fn> } } });
      const probe = new ctx.OffscreenCanvas(1, 1).getContext();
      expect(probe.stroke).toBeDefined();
    });

    it("returns an ImageBitmap", async () => {
      const bmp = await rasterizeTurnGlyph([{ left: 0, right: 0 }]);
      expect(bmp).toBeTruthy();
    });
  });

  describe("rasterizeReversalGlyph", () => {
    it("draws two dots per symbol with the right colors for PRB-", async () => {
      await rasterizeReversalGlyph("PRB-", 4);
      // 4 symbols × 2 dots = 8 arcs.
      expect(currentRec.arcs.length).toBe(8);
      const colors = currentRec.arcs.map((a) => a.style);
      // P → red(top) + blue(bottom)
      expect(colors[0]).toBe("#e74c3c");
      expect(colors[1]).toBe("#3498db");
      // R → red(top) + empty(bottom)
      expect(colors[2]).toBe("#e74c3c");
      // B → empty(top) + blue(bottom)
      expect(colors[5]).toBe("#3498db");
    });

    it("empty dots use the muted color at 0.4 alpha", async () => {
      await rasterizeReversalGlyph("----", 4, {
        containerWidth: CARD_RENDER_WIDTH, cqi: CQI,
        textMutedColor: "rgba(0,0,0,0.55)", textColor: "#111",
      });
      expect(currentRec.arcs.length).toBe(8);
      for (const a of currentRec.arcs) {
        expect(a.style).toBe("rgba(0,0,0,0.55)");
        expect(a.alpha).toBeCloseTo(0.4, 5);
      }
    });

    it("compresses to one period, capped at 8", async () => {
      await rasterizeReversalGlyph("PPPPPPPPPPPP", 12);
      // min(8, 12) = 8 symbols → 16 dots.
      expect(currentRec.arcs.length).toBe(16);
    });
  });

  describe("rasterizeStepCount", () => {
    it("draws the count right-aligned, bottom-aligned, bold", async () => {
      await rasterizeStepCount(16);
      expect(currentRec.texts.length).toBe(1);
      const t = currentRec.texts[0]!;
      expect(t.text).toBe("16");
      expect(t.align).toBe("right");
      expect(t.font).toContain("700");
      expect(t.font).toContain(`${9 * CQI}px`);
      // right edge = box width (20cqi). The alphabetic baseline is lifted off
      // the slot bottom (9cqi) by the font descent so the digit's bottom lands
      // at the slot bottom under line-height:1 (jsdom's fake measureText has no
      // descent metrics → the fontPx*0.21 fallback applies).
      expect(t.x).toBe(Math.round(20 * CQI));
      const descent = 9 * CQI * 0.21;
      expect(t.y).toBeCloseTo(Math.round(9 * CQI) - descent, 2);
    });

    it("uses the ctx muted color", async () => {
      await rasterizeStepCount(8, {
        containerWidth: CARD_RENDER_WIDTH, cqi: CQI,
        textMutedColor: "rgba(0,0,0,0.6)", textColor: "#111",
      });
      expect(currentRec.texts[0]!.style).toBe("rgba(0,0,0,0.6)");
    });
  });

  describe("rasterizeLoopRow", () => {
    const cols: LoopRowCol[] = [
      { kind: "fa", fa: "fas fa-rotate", color: "#36c3ff", label: "Rotated" },
      { kind: "swap", color: "#2ecc71", label: "Swapped" },
    ];

    it("resolves each icon via the CACHED rasterizeLoopIconByKind (no per-card mount)", async () => {
      await rasterizeLoopRow(cols, undefined, "ocean");
      expect(loopIconCalls).toHaveLength(2);
      expect(loopIconCalls[0]).toMatchObject({ kind: "fa", fa: "fas fa-rotate", color: "#36c3ff", theme: "ocean" });
      expect(loopIconCalls[1]).toMatchObject({ kind: "swap", color: "#2ecc71", theme: "ocean" });
    });

    it("draws an icon image + an uppercase label per column", async () => {
      await rasterizeLoopRow(cols);
      expect(currentRec.images.length).toBe(2);
      // Two labels (one per column), uppercased, drawn glyph-by-glyph (spaced).
      const drawn = currentRec.texts.map((t) => t.text).join("");
      expect(drawn).toContain("R");
      expect(drawn).toContain("O");
      // every drawn glyph is uppercase
      for (const t of currentRec.texts) {
        expect(t.text).toBe(t.text.toUpperCase());
      }
    });

    it("returns an ImageBitmap", async () => {
      const bmp = await rasterizeLoopRow(cols);
      expect(bmp).toBeTruthy();
    });
  });

  describe("rasterizeStartPlacementPictograph", () => {
    const pictographData = { letter: "A", motions: {} };
    let renderPictoCalls: RenderPictoCall[];

    beforeEach(() => {
      renderPictoCalls = [];
      __setRenderPictoFnForTest(async (pictograph, options) => {
        renderPictoCalls.push({ pictograph, options: options as RenderPictoCall["options"] });
        return { width: options.size, height: options.size } as unknown as OffscreenCanvas;
      });
    });

    it("renders the pictograph via the Canvas2D pipeline", async () => {
      await rasterizeStartPlacementPictograph(pictographData, true);
      expect(renderPictoCalls).toHaveLength(1);
      expect(renderPictoCalls[0]!.pictograph).toBe(pictographData);
    });

    it("renders at the 1.3× zoomed start-pos size", async () => {
      await rasterizeStartPlacementPictograph(pictographData, false, {
        containerWidth: 1529, cqi: 15.29, textMutedColor: "rgba(0,0,0,0.55)", textColor: "#111",
      });
      const box = Math.round(12 * 15.29);
      expect(renderPictoCalls[0]!.options.size).toBe(Math.round(box * 1.3));
    });

    it("passes the StartPlacementPictograph visibility flags", async () => {
      await rasterizeStartPlacementPictograph(pictographData, true);
      const v = renderPictoCalls[0]!.options.visibility;
      expect(v.darkMode).toBe(true);
      expect(v.handPointVisibility).toBe("all");
      expect(v.showTKA).toBe(false);
      expect(v.showReversals).toBe(false);
      expect(v.showPlacements).toBe(false);
    });

    it("passes explicit prop types and custom hand colors to the canvas pictograph", async () => {
      const colors = { left: "#7442c8", right: "#a84fd4" };
      await rasterizeStartPlacementPictograph(
        pictographData, true, undefined, PropType.CLUB, PropType.CLUB, colors,
      );
      const visibility = renderPictoCalls[0]!.options.visibility;
      expect(visibility.leftPropType).toBe(PropType.CLUB);
      expect(visibility.rightPropType).toBe(PropType.CLUB);
      expect(visibility.primaryPropColors).toEqual(colors);
    });

    it("returns an ImageBitmap", async () => {
      const bmp = await rasterizeStartPlacementPictograph(pictographData, false);
      expect(bmp).toBeTruthy();
    });
  });
});
