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

  it("waits for measurement and handles intrinsic accordions without shrinking controls", () => {
    expect(appearanceControlsFit(0, 0, 8, 104, 88)).toBe(false);
    expect(appearanceControlsFit(90, Infinity, 8, 104, 88)).toBe(false);
    expect(appearanceControlsFit(320, Infinity, 8, 104, 88)).toBe(true);
  });
});
