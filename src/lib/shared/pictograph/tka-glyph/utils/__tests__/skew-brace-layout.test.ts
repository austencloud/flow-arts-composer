import { describe, expect, it } from "vitest";
import {
  getSkewBraceLayout,
  SKEW_BRACE_FONT_SCALE,
  SKEW_BRACE_GAP,
} from "../skew-brace-layout";

describe("getSkewBraceLayout", () => {
  it("locks the gap and font scale constants", () => {
    expect(SKEW_BRACE_GAP).toBe(14);
    expect(SKEW_BRACE_FONT_SCALE).toBe(1.15);
  });

  it("puts the braces just outside the letter, centred on its height", () => {
    const layout = getSkewBraceLayout("S", { width: 100, height: 120 });
    expect(layout.openX).toBe(-14);
    expect(layout.closeX).toBe(114);
    expect(layout.y).toBe(60);
    expect(layout.fontSize).toBeCloseTo(138);
  });

  it("clears the dash of a dash letter", () => {
    const plain = getSkewBraceLayout("W", { width: 100, height: 100 });
    const dashed = getSkewBraceLayout("W-", { width: 100, height: 100 });
    expect(plain.closeX).toBe(114);
    expect(dashed.closeX).toBe(194);
    expect(dashed.openX).toBe(plain.openX);
  });

  it("clears the turns column when the closing brace must wrap it too", () => {
    const layout = getSkewBraceLayout(
      "S",
      { width: 75, height: 100 },
      { rightExtent: 30 }
    );
    expect(layout.closeX).toBe(119);
  });

  it("falls back to no extra clearance when nothing renders to the right", () => {
    const layout = getSkewBraceLayout("S", { width: 75, height: 100 });
    expect(layout.closeX).toBe(89);
  });
});
