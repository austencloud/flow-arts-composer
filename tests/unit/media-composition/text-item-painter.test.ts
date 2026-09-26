import { describe, expect, it } from "vitest";
import { createTextItemPainter } from "$lib/shared/media-composition/services/text-item-painter";
import type { CompiledTextItem } from "$lib/shared/media-composition/domain/post-project-compiler";
import { TEXT_BOX_WIDTH } from "$lib/shared/media-composition/domain/post-project";
import {
  CAPTION_LINE_HEIGHT_FRACTION,
  CAPTION_SIZE_FRACTION,
} from "$lib/shared/media-composition/domain/caption-layout";
import type { PaintFrame, PaintRect } from "$lib/shared/media-composition/services/post-studio-layer-painter";

const FRAME: PaintFrame = { projectProgress: 0, sourceTimeSeconds: 0 };

function makeText(fields: Partial<CompiledTextItem> = {}): CompiledTextItem {
  return {
    itemId: "t1",
    role: "text:t1",
    text: "Hello",
    size: "m",
    box: { x: 0, y: 0, width: 1, height: 1 },
    startSeconds: 0,
    endSeconds: 1,
    ...fields,
  };
}

interface Mark {
  type: "stroke" | "fill";
  text: string;
  x: number;
  y: number;
  fontPx: number;
}

/**
 * A 2D context stand-in with a deterministic `measureText` (proportional to
 * character count and the current font size) so wrapping and shrink-to-fit
 * behave predictably, and a real save/restore stack for globalAlpha the way
 * a canvas has - see `post-painter-fade-and-cache.test.ts`'s recordingContext
 * for the same shape used against other painters.
 */
class FakeContext {
  marks: Mark[] = [];
  globalAlpha = 1;
  textAlign = "";
  textBaseline = "";
  lineJoin = "";
  miterLimit = 0;
  strokeStyle = "";
  lineWidth = 0;
  fillStyle = "";
  private fontPx = 16;
  private savedAlpha: number[] = [];

  get font(): string {
    return `${this.fontPx}px sans-serif`;
  }
  set font(value: string) {
    const match = /(\d+(?:\.\d+)?)px/.exec(value);
    this.fontPx = match ? Number(match[1]) : 16;
  }

  save(): void {
    this.savedAlpha.push(this.globalAlpha);
  }
  restore(): void {
    this.globalAlpha = this.savedAlpha.pop() ?? 1;
  }
  measureText(text: string): TextMetrics {
    return { width: text.length * this.fontPx * 0.6 } as TextMetrics;
  }
  strokeText(text: string, x: number, y: number): void {
    this.marks.push({ type: "stroke", text, x, y, fontPx: this.fontPx });
  }
  fillText(text: string, x: number, y: number): void {
    this.marks.push({ type: "fill", text, x, y, fontPx: this.fontPx });
  }
}

function fakeContext() {
  const context = new FakeContext();
  return { context: context as unknown as CanvasRenderingContext2D, marks: context.marks };
}

async function paint(
  getText: () => CompiledTextItem | null,
  rect: PaintRect
): Promise<Mark[]> {
  const painter = createTextItemPainter(getText);
  await painter.prepare({ width: rect.width, height: rect.height });
  const { context, marks } = fakeContext();
  painter.paint(context, rect, FRAME);
  return marks;
}

describe("createTextItemPainter", () => {
  it("scales the font with the region's own width", async () => {
    const rect: PaintRect = { x: 0, y: 0, width: 1000, height: 1000 };
    const marks = await paint(() => makeText({ text: "Hi", size: "m" }), rect);
    const fill = marks.filter((m) => m.type === "fill");
    expect(fill).toHaveLength(1); // "Hi" never wraps

    const expectedFontPx = (CAPTION_SIZE_FRACTION.m * rect.width) / TEXT_BOX_WIDTH;
    expect(fill[0]!.fontPx).toBeCloseTo(expectedFontPx, 5);

    const wideRect: PaintRect = { ...rect, width: 2000 };
    const wideMarks = await paint(() => makeText({ text: "Hi", size: "m" }), wideRect);
    const wideFill = wideMarks.filter((m) => m.type === "fill");
    expect(wideFill[0]!.fontPx).toBeCloseTo(expectedFontPx * 2, 5);
  });

  it("centers a single line in the middle of the rect", async () => {
    const rect: PaintRect = { x: 100, y: 200, width: 400, height: 300 };
    const marks = await paint(() => makeText({ text: "Hi" }), rect);
    const fill = marks.filter((m) => m.type === "fill");
    expect(fill).toHaveLength(1);
    expect(fill[0]!.x).toBeCloseTo(rect.x + rect.width / 2, 5);
    expect(fill[0]!.y).toBeCloseTo(rect.y + rect.height / 2, 5);
  });

  it("shrinks the font until the wrapped text fits the rect, down to an 8px floor", async () => {
    const longText = "The quick brown fox jumps over the lazy dog again and again";
    const rect: PaintRect = { x: 0, y: 0, width: 300, height: 100 };
    const marks = await paint(() => makeText({ text: longText, size: "l" }), rect);
    const fill = marks.filter((m) => m.type === "fill");
    expect(fill.length).toBeGreaterThan(0);

    const finalFontPx = fill[0]!.fontPx;
    const naiveFontPx = (CAPTION_SIZE_FRACTION.l * rect.width) / TEXT_BOX_WIDTH;
    expect(finalFontPx).toBeLessThan(naiveFontPx);
    expect(finalFontPx).toBeGreaterThanOrEqual(8);

    const blockHeight = finalFontPx * CAPTION_LINE_HEIGHT_FRACTION * fill.length;
    // Either it now fits, or the 8px floor was hit and the overflow is accepted.
    expect(blockHeight <= rect.height + 1e-6 || finalFontPx === 8).toBe(true);
  });

  it("paints nothing for blank text", async () => {
    const rect: PaintRect = { x: 0, y: 0, width: 500, height: 500 };
    expect(await paint(() => makeText({ text: "   " }), rect)).toEqual([]);
  });

  it("paints nothing when the compiled text item is gone", async () => {
    const rect: PaintRect = { x: 0, y: 0, width: 500, height: 500 };
    expect(await paint(() => null, rect)).toEqual([]);
  });

  it("paints nothing into a zero-width or zero-height rect", async () => {
    const text = () => makeText();
    expect(await paint(text, { x: 0, y: 0, width: 0, height: 500 })).toEqual([]);
    expect(await paint(text, { x: 0, y: 0, width: 500, height: 0 })).toEqual([]);
  });

  it("never touches the context's own alpha, leaving fades to the caller", async () => {
    const painter = createTextItemPainter(() => makeText({ text: "Hi" }));
    await painter.prepare({ width: 400, height: 400 });
    const { context } = fakeContext();
    context.globalAlpha = 0.42;
    painter.paint(context, { x: 0, y: 0, width: 400, height: 400 }, FRAME);
    expect(context.globalAlpha).toBe(0.42);
  });
});
