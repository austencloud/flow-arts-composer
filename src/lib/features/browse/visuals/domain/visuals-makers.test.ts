import { describe, expect, it } from "vitest";
import { wallShowsMakerNames } from "./visuals-makers.js";

describe("wallShowsMakerNames", () => {
  it("hides the name when one maker made every piece", () => {
    expect(
      wallShowsMakerNames([{ ownerId: "a" }, { ownerId: "a" }, { ownerId: "a" }])
    ).toBe(false);
  });

  it("hides it for a lone piece and for an empty wall", () => {
    expect(wallShowsMakerNames([{ ownerId: "a" }])).toBe(false);
    expect(wallShowsMakerNames([])).toBe(false);
  });

  it("shows it as soon as a second maker appears, wherever they sit", () => {
    expect(
      wallShowsMakerNames([{ ownerId: "a" }, { ownerId: "a" }, { ownerId: "b" }])
    ).toBe(true);
  });
});
