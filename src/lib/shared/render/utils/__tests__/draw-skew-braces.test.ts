import { describe, expect, it } from "vitest";
import { drawSkewBraces } from "../draw-skew-braces";

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
function stubCtx() {
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
  } as unknown as CanvasRenderingContext2D;

  return { ctx, calls };
}

describe("drawSkewBraces", () => {
  it("places the opening and closing braces at the letter-unit layout mapped through origin and scale", () => {
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

    const open = textCalls[0]!;
    const close = textCalls[1]!;
    expect(open.args).toEqual(["{", 1000 + -14 * 2, 2000 + 50 * 2]);
    expect(open.textAlign).toBe("end");
    expect(open.textBaseline).toBe("middle");

    expect(close.args).toEqual(["}", 1000 + (75 + 14) * 2, 2000 + 50 * 2]);
    expect(close.textAlign).toBe("start");
    expect(close.textBaseline).toBe("middle");

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
    expect(dashX - plainX).toBe((10 + 70) * 2);
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
    expect((extentClose.args[1] as number) - (baseClose.args[1] as number)).toBe(30);
  });
});
