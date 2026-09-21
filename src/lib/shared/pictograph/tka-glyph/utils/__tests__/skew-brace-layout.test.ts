import { describe, expect, it } from "vitest";
import { getSkewBraceLayout, SKEW_BRACE_GAP } from "../skew-brace-layout";

describe("getSkewBraceLayout", () => {
  it("puts the braces just outside the letter, centred on its height", () => {
    const layout = getSkewBraceLayout("S", { width: 100, height: 120 });
    expect(layout.openX).toBe(-SKEW_BRACE_GAP);
    expect(layout.closeX).toBe(100 + SKEW_BRACE_GAP);
    expect(layout.y).toBe(60);
    expect(layout.fontSize).toBeCloseTo(120 * 1.15);
  });

  it("clears the dash of a dash letter", () => {
    const plain = getSkewBraceLayout("W", { width: 100, height: 100 });
    const dashed = getSkewBraceLayout("W-", { width: 100, height: 100 });
    expect(dashed.closeX - plain.closeX).toBe(80);
    expect(dashed.openX).toBe(plain.openX);
  });
});
