import { describe, expect, it } from "vitest";
import { appearanceControlsFit } from "../../../src/lib/shared/share/components/post-studio/editor/post-appearance-fit";

describe("Post appearance chooser space", () => {
  it("drills down when the timeline leaves insufficient height, even on desktop", () => {
    expect(appearanceControlsFit(408, 210, 8, 104, 88, 0, 116)).toBe(false);
    expect(appearanceControlsFit(408, 700, 8, 104, 88, 0, 116)).toBe(true);
  });

  it("accounts for wrapping, gaps, and the effect toolbar at the exact boundary", () => {
    // Four columns, five rows: 360 + 32 gaps + 52 toolbar.
    expect(appearanceControlsFit(408, 444, 18, 96, 72, 0, 52)).toBe(true);
    expect(appearanceControlsFit(408, 443, 18, 96, 72, 0, 52)).toBe(false);
    expect(appearanceControlsFit(407, 444, 18, 96, 72, 0, 52)).toBe(false);
  });

  it("counts prop grid padding before deciding to keep the gallery inline", () => {
    expect(appearanceControlsFit(440, 900, 19, 96, 112, 36, 44)).toBe(true);
    expect(appearanceControlsFit(440, 500, 19, 96, 112, 36, 44)).toBe(false);
  });

  it("keeps a partially visible prop catalog inline and scrolls the remaining rows", () => {
    const fitsProps = (width: number, height: number) =>
      appearanceControlsFit(width, height, 19, 96, 108, 24, 16, undefined, {
        minColumns: 2,
        visibleRows: 1.5,
      });
    expect(fitsProps(408, 214)).toBe(true);
    expect(fitsProps(224, 186)).toBe(true);
    expect(fitsProps(223, 600)).toBe(false);
    expect(fitsProps(500, 185)).toBe(false);
    expect(fitsProps(800, 214)).toBe(true);
  });

  it("allows room for balanced effort rows instead of assuming a ragged three-column grid", () => {
    expect(appearanceControlsFit(439, 427, 8, 104, 88, 0, 140, [1, 2, 4])).toBe(
      false
    );
    expect(appearanceControlsFit(439, 516, 8, 104, 88, 0, 140, [1, 2, 4])).toBe(
      true
    );
    expect(appearanceControlsFit(440, 324, 8, 104, 88, 0, 140, [1, 2, 4])).toBe(
      true
    );
  });

  it("waits for measurement and handles intrinsic accordions without shrinking controls", () => {
    expect(appearanceControlsFit(0, 0, 8, 104, 88)).toBe(false);
    expect(appearanceControlsFit(90, Infinity, 8, 104, 88)).toBe(false);
    expect(appearanceControlsFit(320, Infinity, 8, 104, 88)).toBe(true);
  });
});
