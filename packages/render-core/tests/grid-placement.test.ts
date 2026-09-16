import { describe, expect, it } from "vitest";
import { getNormalHandPointCoordinates } from "../src/index.js";

describe("normal prop hand points", () => {
  it("matches the app's non-strict fan/staff placement coordinates", () => {
    expect(getNormalHandPointCoordinates("n", "diamond")).toEqual({
      x: 475,
      y: 331.9,
    });
    expect(getNormalHandPointCoordinates("sw", "box")).toEqual({
      x: 373.8,
      y: 576.2,
    });
  });
});
