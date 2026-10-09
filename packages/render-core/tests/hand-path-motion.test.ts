import { describe, expect, it } from "vitest";
import {
  deriveShiftHandPath,
  drawsHandPaths,
  handPathMotionOverrides,
} from "../src/calculations/hand-path-motion.js";
import { turnsColumnHands } from "../src/calculations/turns-column.js";
import { propArtworkStem } from "../src/prop-artwork.js";

describe("hand paths", () => {
  it("draws hand paths only when both props are hands", () => {
    expect(drawsHandPaths("hand", "hand")).toBe(true);
    expect(drawsHandPaths("hand", "staff")).toBe(false);
  });

  it("derives which way the hand travels", () => {
    expect(deriveShiftHandPath("s", "w")).toBe("cw");
    expect(deriveShiftHandPath("w", "s")).toBe("ccw");
    expect(deriveShiftHandPath("n", "s")).toBe("dash");
    expect(deriveShiftHandPath("e", "e")).toBe("static");
  });

  it("turns a shift into a float along the hand path and strips dash turns", () => {
    expect(
      handPathMotionOverrides({ motionType: "anti", startLocation: "w", endLocation: "s" })
    ).toEqual({
      motionType: "float",
      turns: "fl",
      handPath: "ccw",
      rotationDirection: "ccw",
      startOrientation: "in",
      endOrientation: "in",
      propType: "hand",
    });
    expect(
      handPathMotionOverrides({ motionType: "dash", startLocation: "n", endLocation: "s" })
    ).toEqual({ turns: 0, rotationDirection: "noRotation", propType: "hand" });
  });
});

describe("turnsColumnHands", () => {
  it("puts the shift on top for Type 2 letters", () => {
    expect(turnsColumnHands("W", { motionType: "static" }, { motionType: "pro" })).toEqual({
      top: "right",
      bottom: "left",
    });
  });

  it("puts pro over anti for hybrid Type 1, reading a float as its prefloat shift", () => {
    expect(
      turnsColumnHands(
        "C",
        { motionType: "float", prefloatMotionType: "anti" },
        { motionType: "pro" }
      )
    ).toEqual({ top: "right", bottom: "left" });
  });

  it("puts the dash on top for Type 4 and below for Type 3", () => {
    const dash = { motionType: "dash" };
    expect(turnsColumnHands("Φ", { motionType: "static" }, dash)).toEqual({
      top: "right",
      bottom: "left",
    });
    expect(turnsColumnHands("W-", { motionType: "pro" }, dash)).toEqual({
      top: "left",
      bottom: "right",
    });
  });

  it("keeps left over right for other letters", () => {
    expect(turnsColumnHands("A", { motionType: "pro" }, { motionType: "pro" })).toEqual({
      top: "left",
      bottom: "right",
    });
  });
});

describe("propArtworkStem", () => {
  it("gives the right hand its own stick and shares other artwork", () => {
    expect(propArtworkStem("stick", "right")).toBe("stick-right");
    expect(propArtworkStem("stick", "left")).toBe("stick");
    expect(propArtworkStem("staff", "right")).toBe("staff");
  });
});
