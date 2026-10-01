import { describe, expect, it } from "vitest";
import { createTextItemPainter } from "$lib/shared/media-composition/services/text-item-painter";
import type { CompiledTextItem } from "$lib/shared/media-composition/domain/post-project-compiler";
import { TEXT_BOX_WIDTH } from "$lib/shared/media-composition/domain/post-project";
import {
  CAPTION_LINE_HEIGHT_FRACTION,
  CAPTION_SIZE_FRACTION,
} from "$lib/shared/media-composition/domain/caption-layout";
import type {
  PaintFrame,
  PaintRect,
} from "$lib/shared/media-composition/services/post-studio-layer-painter";

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
  alpha: number;
  align: string;
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
    this.marks.push({
      type: "stroke",
      text,
      x,
      y,
      fontPx: this.fontPx,
      alpha: this.globalAlpha,
      align: this.textAlign,
    });
  }
  fillText(text: string, x: number, y: number): void {
    this.marks.push({
      type: "fill",
      text,
      x,
      y,
      fontPx: this.fontPx,
      alpha: this.globalAlpha,
      align: this.textAlign,
    });
  }
}

function fakeContext() {
  const context = new FakeContext();
  return {
    context: context as unknown as CanvasRenderingContext2D,
    marks: context.marks,
  };
}

async function paint(
  getText: () => CompiledTextItem | null,
  rect: PaintRect,
  frame: PaintFrame = FRAME
): Promise<Mark[]> {
  const painter = createTextItemPainter(getText);
  await painter.prepare({ width: rect.width, height: rect.height });
  const { context, marks } = fakeContext();
  painter.paint(context, rect, frame);
  return marks;
}

describe("createTextItemPainter", () => {
  it("scales the font with the region's own width", async () => {
    const rect: PaintRect = { x: 0, y: 0, width: 1000, height: 1000 };
    const marks = await paint(() => makeText({ text: "Hi", size: "m" }), rect);
    const fill = marks.filter((m) => m.type === "fill");
    expect(fill).toHaveLength(1); // "Hi" never wraps

    const expectedFontPx =
      (CAPTION_SIZE_FRACTION.m * rect.width) / TEXT_BOX_WIDTH;
    expect(fill[0]!.fontPx).toBeCloseTo(expectedFontPx, 5);

    const wideRect: PaintRect = { ...rect, width: 2000 };
    const wideMarks = await paint(
      () => makeText({ text: "Hi", size: "m" }),
      wideRect
    );
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
    const longText =
      "The quick brown fox jumps over the lazy dog again and again";
    const rect: PaintRect = { x: 0, y: 0, width: 300, height: 100 };
    const marks = await paint(
      () => makeText({ text: longText, size: "l" }),
      rect
    );
    const fill = marks.filter((m) => m.type === "fill");
    expect(fill.length).toBeGreaterThan(0);

    const finalFontPx = fill[0]!.fontPx;
    const naiveFontPx = (CAPTION_SIZE_FRACTION.l * rect.width) / TEXT_BOX_WIDTH;
    expect(finalFontPx).toBeLessThan(naiveFontPx);
    expect(finalFontPx).toBeGreaterThanOrEqual(8);

    const blockHeight =
      finalFontPx * CAPTION_LINE_HEIGHT_FRACTION * fill.length;
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
    expect(await paint(text, { x: 0, y: 0, width: 0, height: 500 })).toEqual(
      []
    );
    expect(await paint(text, { x: 0, y: 0, width: 500, height: 0 })).toEqual(
      []
    );
  });

  it("never touches the context's own alpha, leaving fades to the caller", async () => {
    const painter = createTextItemPainter(() => makeText({ text: "Hi" }));
    await painter.prepare({ width: 400, height: 400 });
    const { context } = fakeContext();
    context.globalAlpha = 0.42;
    painter.paint(context, { x: 0, y: 0, width: 400, height: 400 }, FRAME);
    expect(context.globalAlpha).toBe(0.42);
  });

  it("uses recovered text sizing and the sl5 letter selector across in and out spans", async () => {
    const styled = makeText({
      text: "Hi",
      box: { x: 0, y: 0, width: 0.5, height: 0.2 },
      startSeconds: 0,
      endSeconds: 4,
      style: {
        fontFamily: "PermanentMarker.ttf",
        fontSizeNative: 84,
        letterSpacing: 0,
        lineSpacing: 1,
        alignment: "center",
        alpha: 1,
      },
      animation: {
        kind: "letter-slide",
        inDurationSeconds: 1,
        outDurationSeconds: 1,
        entranceProgress: 0.983333,
        exitProgress: 0,
      },
    });
    const rect = { x: 0, y: 0, width: 540, height: 216 };
    expect(
      await paint(() => styled, rect, { ...FRAME, projectTimeSeconds: 0 })
    ).toEqual([]);
    const middle = (
      await paint(() => styled, rect, { ...FRAME, projectTimeSeconds: 2 })
    ).filter((mark) => mark.type === "fill");
    expect(middle.map((mark) => mark.text)).toEqual(["H", "i"]);
    expect(
      await paint(() => styled, rect, { ...FRAME, projectTimeSeconds: 2 })
    ).not.toContainEqual(expect.objectContaining({ type: "stroke" }));
    expect(middle[0]!.fontPx).toBeCloseTo(84);
    const entrance = (
      await paint(() => styled, rect, { ...FRAME, projectTimeSeconds: 0.15 })
    ).filter((mark) => mark.type === "fill");
    expect(entrance[0]!.y).toBeLessThan(middle[0]!.y);
    expect(entrance[0]!.alpha).toBeGreaterThan(entrance[1]!.alpha);
    const exit = (
      await paint(() => styled, rect, { ...FRAME, projectTimeSeconds: 3.5 })
    ).filter((mark) => mark.type === "fill");
    expect(exit[0]!.y).toBeLessThan(middle[0]!.y);
    expect(exit[0]!.alpha).toBeGreaterThan(exit[1]!.alpha);
  });

  it("matches the reference entrance's early T and late W motion at 1080 pixels", async () => {
    const styled = makeText({
      text: "Take it slow",
      startSeconds: 0,
      endSeconds: 5.8,
      style: {
        fontFamily: "PermanentMarker.ttf",
        fontSizeNative: 84,
        letterSpacing: 0,
        lineSpacing: 1,
        alignment: "center",
        alpha: 1,
      },
      animation: {
        kind: "letter-slide",
        inDurationSeconds: 0.953127,
        outDurationSeconds: 0.953127,
        entranceProgress: 0.983333,
        exitProgress: 0,
      },
    });
    const rect = { x: 0, y: 0, width: 1080, height: 1920 };
    const at = async (seconds: number) =>
      (
        await paint(() => styled, rect, {
          ...FRAME,
          projectTimeSeconds: seconds,
        })
      ).filter((mark) => mark.type === "fill");
    const settled = await at(2);
    const early = await at(0.0324);
    const middle = await at(0.4824);
    const late = await at(0.6324);
    const t = (marks: Mark[]) => marks.find((mark) => mark.text === "T")!;
    const w = (marks: Mark[]) => marks.find((mark) => mark.text === "w")!;
    expect(t(early).alpha).toBeGreaterThan(0);
    expect(t(early).y - t(settled).y).toBeCloseTo(-250, -1);
    expect(w(middle).y - w(settled).y).toBeCloseTo(-180, -1);
    expect(w(late).y - w(settled).y).toBeGreaterThan(-60);
  });

  it("keeps native spaces, explicit lines, and font size without caption wrapping", async () => {
    const styled = makeText({
      text: "Don't give up! \nAgain",
      box: { x: 0, y: 0, width: 1, height: 0.1 },
      style: {
        fontFamily: "PermanentMarker.ttf",
        fontSizeNative: 84,
        fontScale: 0.790714,
        sourceCanvasWidth: 738,
        letterSpacing: 0,
        lineSpacing: 1,
        alignment: "center",
        alpha: 1,
      },
    });
    const marks = await paint(() => styled, {
      x: 0,
      y: 0,
      width: 1080,
      height: 80,
    });
    expect(
      marks.filter((mark) => mark.type === "fill").map((mark) => mark.text)
    ).toEqual(["Don't give up! ", "Again"]);
    expect(marks[0]!.fontPx).toBeCloseTo((84 * 0.790714 * 1080) / 738);
  });

  it("moves native text across the same box for every alignment with letter animation on or off", async () => {
    const rect = { x: 37, y: 0, width: 540, height: 200 };
    const base = makeText({
      text: "AB",
      box: { x: 0, y: 0, width: 0.5, height: 0.2 },
      startSeconds: 0,
      endSeconds: 4,
      style: {
        fontFamily: "PermanentMarker.ttf",
        fontSizeNative: 84,
        fontScale: 0.790714,
        sourceCanvasWidth: 738,
        letterSpacing: 0,
        lineSpacing: 1,
        alignment: "left",
        alpha: 1,
      },
    });
    const animation = {
      kind: "letter-slide" as const,
      inDurationSeconds: 1,
      outDurationSeconds: 1,
      entranceProgress: 0.983333,
      exitProgress: 0,
    };
    const expectedLeft = (alignment: "left" | "center" | "right") => {
      const fontPx = (84 * 0.790714 * rect.width) / (0.5 * 738);
      const lineWidth = 2 * fontPx * 0.6;
      const anchor =
        alignment === "left"
          ? rect.x
          : alignment === "right"
            ? rect.x + rect.width
            : rect.x + rect.width / 2;
      return (
        anchor -
        (alignment === "left"
          ? 0
          : alignment === "right"
            ? lineWidth
            : lineWidth / 2)
      );
    };

    for (const animated of [false, true]) {
      for (const alignment of ["left", "center", "right"] as const) {
        const marks = (
          await paint(
            () => ({
              ...base,
              style: { ...base.style!, alignment },
              animation: animated ? animation : undefined,
            }),
            rect,
            { ...FRAME, projectTimeSeconds: 2 }
          )
        ).filter((mark) => mark.type === "fill");
        const first = marks[0]!;
        const leftEdge = animated
          ? first.x - (first.fontPx * 0.6) / 2
          : first.x -
            (first.align === "left"
              ? 0
              : first.align === "right"
                ? 2 * first.fontPx * 0.6
                : first.fontPx * 0.6);
        expect(leftEdge).toBeCloseTo(expectedLeft(alignment), 5);
        expect(marks.map((mark) => mark.text)).toEqual(
          animated ? ["A", "B"] : ["AB"]
        );
      }
    }
  });

  it("excludes spaces from the recovered letter selector's stagger", async () => {
    const base = makeText({
      text: "AB",
      startSeconds: 0,
      endSeconds: 4,
      style: {
        fontFamily: "PermanentMarker.ttf",
        fontSizeNative: 84,
        letterSpacing: 0,
        lineSpacing: 1,
        alignment: "center",
        alpha: 1,
      },
      animation: {
        kind: "letter-slide",
        inDurationSeconds: 1,
        outDurationSeconds: 1,
        entranceProgress: 0,
        exitProgress: 0,
      },
    });
    const rect = { x: 0, y: 0, width: 1080, height: 200 };
    const frame = { ...FRAME, projectTimeSeconds: 0.5 };
    const adjacent = (await paint(() => base, rect, frame)).filter(
      (mark) => mark.type === "fill"
    );
    const spaced = (
      await paint(() => ({ ...base, text: "A B" }), rect, frame)
    ).filter((mark) => mark.type === "fill" && mark.text !== " ");
    expect(spaced.map((mark) => mark.alpha)).toEqual(
      adjacent.map((mark) => mark.alpha)
    );
  });
});
