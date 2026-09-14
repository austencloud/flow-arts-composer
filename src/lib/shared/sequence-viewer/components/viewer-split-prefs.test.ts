import { describe, expect, it } from "vitest";
import {
  clampViewerSplitShare,
  parseViewerSplitShares,
  viewerSplitShareFromSizes,
} from "./viewer-split-prefs";

describe("clampViewerSplitShare", () => {
  it("keeps the share inside 25–75%", () => {
    expect(clampViewerSplitShare(0.1)).toBe(0.25);
    expect(clampViewerSplitShare(0.9)).toBe(0.75);
    expect(clampViewerSplitShare(0.6)).toBe(0.6);
    expect(clampViewerSplitShare(Number.NaN)).toBe(0.5);
  });
});

describe("viewerSplitShareFromSizes", () => {
  it("reads the animation share from a flex pair", () => {
    expect(viewerSplitShareFromSizes([1, 1])).toBe(0.5);
    expect(viewerSplitShareFromSizes([1.4, 0.6])).toBeCloseTo(0.7);
    expect(viewerSplitShareFromSizes([0, 0])).toBe(0.5);
  });
});

describe("parseViewerSplitShares", () => {
  it("falls back to 50/50 for missing or corrupt storage", () => {
    expect(parseViewerSplitShares(null)).toEqual({
      horizontal: 0.5,
      vertical: 0.5,
    });
    expect(parseViewerSplitShares("{not json")).toEqual({
      horizontal: 0.5,
      vertical: 0.5,
    });
    expect(parseViewerSplitShares('{"horizontal":"wide"}')).toEqual({
      horizontal: 0.5,
      vertical: 0.5,
    });
  });

  it("clamps stored values per axis", () => {
    expect(
      parseViewerSplitShares('{"horizontal":0.62,"vertical":0.05}')
    ).toEqual({
      horizontal: 0.62,
      vertical: 0.25,
    });
  });
});
