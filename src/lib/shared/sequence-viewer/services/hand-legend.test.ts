import { describe, expect, it } from "vitest";
import { handLegendFor } from "./hand-legend";

describe("hand legend", () => {
  it("tells a mirror-me viewer the right-hand color is theirs", () => {
    expect(handLegendFor("mirror-me", "#ED1C24")).toEqual({
      lead: "Mirror me.",
      swatch: "#ED1C24",
      rest: "is your right hand.",
    });
  });

  it("tells an as-performed viewer where the performer's right hand is", () => {
    expect(handLegendFor("as-performed", "#DC2626")).toEqual({
      lead: "As performed.",
      swatch: "#DC2626",
      rest: "is my right hand, on your left.",
    });
  });
});
