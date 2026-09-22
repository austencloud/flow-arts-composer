import { describe, expect, it } from "vitest";
import { deriveHandInversion, handModeToEngine } from "./hand-relationship";

describe("deriveHandInversion", () => {
  it("is false whenever either side is Free", () => {
    expect(deriveHandInversion("free", "free")).toBe(false);
    expect(deriveHandInversion("TO", "free")).toBe(false);
    expect(deriveHandInversion("free", "TO")).toBe(false);
  });

  it("is reflection XOR opposite props", () => {
    // Reflection hands spin opposite on their own; asking for same-spin props
    // needs the inverted motion types.
    expect(deriveHandInversion("TO", "TS")).toBe(true);
    expect(deriveHandInversion("TO", "TO")).toBe(false);
    // Rotation hands spin the same on their own; opposite props invert.
    expect(deriveHandInversion("TS", "TO")).toBe(true);
    expect(deriveHandInversion("TS", "TS")).toBe(false);
    expect(deriveHandInversion("QS", "QO")).toBe(true);
    expect(deriveHandInversion("QO", "QO")).toBe(false);
  });
});

describe("handModeToEngine", () => {
  it("sends nothing for Free", () => {
    expect(handModeToEngine("free", { prop: "free" })).toBeUndefined();
    expect(handModeToEngine("free", { prop: "TO" })).toBeUndefined();
  });

  it("sends the single map with the derived inversion", () => {
    expect(handModeToEngine("TS", { prop: "free" })).toEqual({
      map: "identity",
      inverted: false,
    });
    expect(handModeToEngine("TS", { prop: "TO" })).toEqual({
      map: "identity",
      inverted: true,
    });
    expect(handModeToEngine("SO", { prop: "SS" })).toEqual({
      map: "reflect-east-west",
      inverted: true,
    });
  });

  it("picks the quarter sense that carries the pinned start's right hand onto its left", () => {
    // gamma9 is left e, right n: rotate 90 cw sends n to e.
    expect(
      handModeToEngine("QS", {
        prop: "free",
        startLocations: { left: "e", right: "n" },
      })
    ).toEqual({ map: "rotate-90-cw", inverted: false });
    // gamma1 is left w, right n: rotate 90 ccw sends n to w.
    expect(
      handModeToEngine("QS", {
        prop: "free",
        startLocations: { left: "w", right: "n" },
      })
    ).toEqual({ map: "rotate-90-ccw", inverted: false });
    // The pinned start wins over a cardinal LOOP axis.
    expect(
      handModeToEngine("QO", {
        prop: "free",
        loopAxis: "north-south",
        startLocations: { left: "e", right: "n" },
      })
    ).toEqual({ map: "reflect-northeast-southwest", inverted: false });
  });

  it("follows a diagonal LOOP axis for QO when nothing pins the start", () => {
    expect(
      handModeToEngine("QO", { prop: "free", loopAxis: "northwest-southeast" })
    ).toEqual({ map: "reflect-northwest-southeast", inverted: false });
    expect(
      handModeToEngine("QO", { prop: "free", loopAxis: "northeast-southwest" })
    ).toEqual({ map: "reflect-northeast-southwest", inverted: false });
  });

  it("rolls a sense when neither the start nor the LOOP decides", () => {
    // alpha, left w right e: no 90 degree rotation sends e onto w.
    const alpha = { left: "w", right: "e" };
    expect(
      handModeToEngine("QS", {
        prop: "free",
        startLocations: alpha,
        random: () => 0.99,
      })
    ).toEqual({ map: "rotate-90-ccw", inverted: false });
    expect(
      handModeToEngine("QS", {
        prop: "free",
        startLocations: alpha,
        random: () => 0,
      })
    ).toEqual({ map: "rotate-90-cw", inverted: false });
    expect(handModeToEngine("QO", { prop: "TS", random: () => 0.5 })).toEqual({
      map: "reflect-northwest-southeast",
      inverted: true,
    });
  });
});
