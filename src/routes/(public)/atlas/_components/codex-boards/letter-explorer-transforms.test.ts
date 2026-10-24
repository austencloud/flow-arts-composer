import { describe, expect, it } from "vitest";
import {
  formatExplorerTransforms,
  invertsLetter,
  parseExplorerTransforms,
} from "./letter-explorer-transforms";

describe("letter explorer transforms", () => {
  it("round-trips through the URL value", () => {
    const ops = parseExplorerTransforms("rlmfsi");
    expect(ops).toEqual([
      "rotate",
      "rotate-ccw",
      "mirror",
      "flip",
      "swap",
      "invert",
    ]);
    expect(formatExplorerTransforms(ops)).toBe("rlmfsi");
    expect(formatExplorerTransforms([])).toBeNull();
    expect(parseExplorerTransforms("rxq")).toEqual(["rotate"]);
  });

  it("shows the inverted letter only after an odd number of inverts", () => {
    expect(invertsLetter(["invert"])).toBe(true);
    expect(invertsLetter(["invert", "rotate", "invert"])).toBe(false);
    expect(invertsLetter(["mirror", "swap"])).toBe(false);
  });
});
