import { describe, expect, it } from "vitest";
import { drawSkewBraces } from "../draw-skew-braces";
import {
  DEFAULT_SKEW_BRACE_INK,
  getSkewBraceLayout,
  placeSkewBraceGlyphs,
} from "../../../pictograph/tka-glyph/utils/skew-brace-layout";

interface RecordedCall {
  method: "save" | "restore" | "fillText";
  args: unknown[];
  textAlign: string;
  textBaseline: string;
  font: string;
  fillStyle: string;
}

/** Minimal 2D-context stub recording calls and the property state at the
 * moment each call happened - matches the pattern in
 * ../../services/__tests__/render-qr-prerendered.test.ts. */
function stubCtx(measureText?: (text: string) => TextMetrics) {
  const calls: RecordedCall[] = [];
  const snapshot = (method: RecordedCall["method"], args: unknown[]) =>
    calls.push({
      method,
      args,
      textAlign: ctx.textAlign as string,
      textBaseline: ctx.textBaseline as string,
      font: ctx.font as string,
      fillStyle: ctx.fillStyle as string,
    });

  const ctx = {
    font: "",
    textAlign: "",
    textBaseline: "",
    fillStyle: "",
    save: () => snapshot("save", []),
    restore: () => snapshot("restore", []),
    fillText: (...args: unknown[]) => snapshot("fillText", args),
    ...(measureText ? { measureText } : {}),
  } as unknown as CanvasRenderingContext2D;

  return { ctx, calls };
}

describe("drawSkewBraces", () => {
  it("places the braces' ink around the letter, mapped through origin and scale", () => {
    const { ctx, calls } = stubCtx();

    drawSkewBraces(ctx, {
      letter: "S",
      letterDimensions: { width: 75, height: 100 },
      rightExtent: 0,
      darkMode: false,
      originX: 1000,
      originY: 2000,
      scale: 2,
    });

    const textCalls = calls.filter((c) => c.method === "fillText");
    expect(textCalls).toHaveLength(2);

    // This stub cannot measure text, so the default system-font ink applies.
    const glyphs = placeSkewBraceGlyphs(
      getSkewBraceLayout("S", { width: 75, height: 100 }),
      DEFAULT_SKEW_BRACE_INK
    );
    const open = textCalls[0]!;
    const close = textCalls[1]!;
    expect(open.args[0]).toBe("{");
    expect(open.args[1]).toBeCloseTo(1000 + glyphs.open.x * 2);
    expect(open.args[2]).toBeCloseTo(2000 + glyphs.open.y * 2);
    expect(open.textAlign).toBe("left");
    expect(open.textBaseline).toBe("alphabetic");

    expect(close.args[0]).toBe("}");
    expect(close.args[1]).toBeCloseTo(1000 + glyphs.close.x * 2);
    expect(close.args[2]).toBeCloseTo(2000 + glyphs.close.y * 2);
    expect(close.textAlign).toBe("left");
    expect(close.textBaseline).toBe("alphabetic");

    // save/restore bracket the draw.
    expect(calls[0]!.method).toBe("save");
    expect(calls[calls.length - 1]!.method).toBe("restore");
  });

  it("grows the closing brace's x by the dash width and gap for a dash letter", () => {
    const { ctx: plainCtx, calls: plainCalls } = stubCtx();
    drawSkewBraces(plainCtx, {
      letter: "W",
      letterDimensions: { width: 75, height: 100 },
      darkMode: false,
      originX: 0,
      originY: 0,
      scale: 2,
    });
    const plainClose = plainCalls.find(
      (c) => c.method === "fillText" && c.args[0] === "}"
    )!;

    const { ctx: dashCtx, calls: dashCalls } = stubCtx();
    drawSkewBraces(dashCtx, {
      letter: "W-",
      letterDimensions: { width: 75, height: 100 },
      darkMode: false,
      originX: 0,
      originY: 0,
      scale: 2,
    });
    const dashClose = dashCalls.find(
      (c) => c.method === "fillText" && c.args[0] === "}"
    )!;

    const plainX = plainClose.args[1] as number;
    const dashX = dashClose.args[1] as number;
    expect(dashX - plainX).toBeCloseTo((10 + 70) * 2);
  });

  it("uses the dark-mode fill colour", () => {
    const { ctx, calls } = stubCtx();
    drawSkewBraces(ctx, {
      letter: "S",
      letterDimensions: { width: 75, height: 100 },
      darkMode: true,
      originX: 0,
      originY: 0,
      scale: 1,
    });

    const textCalls = calls.filter((c) => c.method === "fillText");
    expect(textCalls.every((c) => c.fillStyle === "#d9d9d9")).toBe(true);
  });

  it("uses the light-mode fill colour", () => {
    const { ctx, calls } = stubCtx();
    drawSkewBraces(ctx, {
      letter: "S",
      letterDimensions: { width: 75, height: 100 },
      darkMode: false,
      originX: 0,
      originY: 0,
      scale: 1,
    });

    const textCalls = calls.filter((c) => c.method === "fillText");
    expect(textCalls.every((c) => c.fillStyle === "#231f20")).toBe(true);
  });

  it("scales the font size by height * 1.15 * scale", () => {
    const { ctx, calls } = stubCtx();
    drawSkewBraces(ctx, {
      letter: "S",
      letterDimensions: { width: 75, height: 100 },
      darkMode: false,
      originX: 0,
      originY: 0,
      scale: 2,
    });

    const textCalls = calls.filter((c) => c.method === "fillText");
    // fontSize = 100 * 1.15 * 2 = 230 (floating point, so match the numeric
    // px value rather than the exact string).
    const fontMatch = textCalls[0]!.font.match(/([\d.]+)px/);
    expect(fontMatch).not.toBeNull();
    expect(Number(fontMatch![1])).toBeCloseTo(230);
    expect(textCalls.every((c) => c.font === textCalls[0]!.font)).toBe(true);
  });

  it("clears the turns column via rightExtent on the closing brace only", () => {
    const { ctx: baseCtx, calls: baseCalls } = stubCtx();
    drawSkewBraces(baseCtx, {
      letter: "S",
      letterDimensions: { width: 75, height: 100 },
      rightExtent: 0,
      darkMode: false,
      originX: 0,
      originY: 0,
      scale: 1,
    });
    const baseOpen = baseCalls.find(
      (c) => c.method === "fillText" && c.args[0] === "{"
    )!;
    const baseClose = baseCalls.find(
      (c) => c.method === "fillText" && c.args[0] === "}"
    )!;

    const { ctx: extentCtx, calls: extentCalls } = stubCtx();
    drawSkewBraces(extentCtx, {
      letter: "S",
      letterDimensions: { width: 75, height: 100 },
      rightExtent: 30,
      darkMode: false,
      originX: 0,
      originY: 0,
      scale: 1,
    });
    const extentOpen = extentCalls.find(
      (c) => c.method === "fillText" && c.args[0] === "{"
    )!;
    const extentClose = extentCalls.find(
      (c) => c.method === "fillText" && c.args[0] === "}"
    )!;

    expect(extentOpen.args).toEqual(baseOpen.args);
    expect((extentClose.args[1] as number) - (baseClose.args[1] as number)).toBeCloseTo(30);
  });

  it("centres the braces with the ink the context itself measures", () => {
    // A worker's OffscreenCanvas can resolve the font stack to a different
    // face than the page, so the drawer measures on the context it draws with.
    const px = 100 * 1.15 * 2;
    const metrics = (left: number): TextMetrics =>
      ({
        width: 0.33 * px,
        actualBoundingBoxLeft: left * px,
        actualBoundingBoxRight: 0.31 * px,
        actualBoundingBoxAscent: 0.73 * px,
        actualBoundingBoxDescent: 0.22 * px,
        fontBoundingBoxAscent: 0.9 * px,
        fontBoundingBoxDescent: 0.21 * px,
      }) as TextMetrics;
    const { ctx, calls } = stubCtx((text) => metrics(text === "{" ? -0.02 : -0.01));

    drawSkewBraces(ctx, {
      letter: "S",
      letterDimensions: { width: 75, height: 100 },
      darkMode: false,
      originX: 0,
      originY: 0,
      scale: 2,
    });

    const [open, close] = calls.filter((c) => c.method === "fillText");
    for (const call of [open!, close!]) {
      const baseline = call.args[2] as number;
      const inkTop = baseline - 0.73 * px;
      const inkBottom = baseline + 0.22 * px;
      expect((inkTop + inkBottom) / 2).toBeCloseTo(50 * 2);
    }
    // Opening brace's ink ends one gap left of the letter; closing brace's ink
    // starts one gap right of it.
    expect((open!.args[1] as number) + 0.31 * px).toBeCloseTo(-14 * 2);
    expect((close!.args[1] as number) - -0.01 * px).toBeCloseTo((75 + 14) * 2);
  });
});
