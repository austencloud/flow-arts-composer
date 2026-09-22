import { describe, expect, it } from "vitest";
import {
  getTurnsColumnRightExtent,
  PADDING_X,
} from "../turn-position-calculator";
import { getHalfMarkWidth, getTurnNumberWidth, MARK_GAP } from "../turn-tuple-parser";

describe("getTurnsColumnRightExtent", () => {
  it("is zero when neither turn slot displays", () => {
    const extent = getTurnsColumnRightExtent({
      top: 0,
      bottom: 0,
      topHalved: false,
      bottomHalved: false,
    });
    expect(extent).toBe(0);
  });

  it("clears PADDING_X plus the displayed number's own width for a single turn", () => {
    const extent = getTurnsColumnRightExtent({
      top: 1,
      bottom: 0,
      topHalved: false,
      bottomHalved: false,
    });
    expect(extent).toBe(PADDING_X + getTurnNumberWidth(1));
  });

  it("widens for a halved slot's mark and gap even at a bare 0 turn", () => {
    const extent = getTurnsColumnRightExtent({
      top: 0,
      bottom: 0,
      topHalved: true,
      bottomHalved: false,
    });
    expect(extent).toBe(
      PADDING_X + getTurnNumberWidth(0) + MARK_GAP + getHalfMarkWidth()
    );
  });
});
