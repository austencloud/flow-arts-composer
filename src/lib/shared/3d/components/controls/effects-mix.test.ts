import { describe, expect, it } from "vitest";
import { globalEffectMix } from "./effects-mix";

describe("globalEffectMix", () => {
  it("counts matching props as one, or none when off", () => {
    expect(globalEffectMix(false, "zap", "zap")).toEqual({
      leftTile: null,
      rightTile: null,
      count: 1,
    });
    expect(globalEffectMix(false, "none", "none").count).toBe(0);
  });

  it("counts each distinct effect of a mix once and dots both tiles", () => {
    expect(globalEffectMix(true, "zap", "trails")).toEqual({
      leftTile: "zap",
      rightTile: "trails",
      count: 2,
    });
  });

  it("puts a dot nowhere for a prop wearing nothing", () => {
    expect(globalEffectMix(true, "ghost", "none")).toEqual({
      leftTile: "ghost",
      rightTile: null,
      count: 1,
    });
    expect(globalEffectMix(true, "none", "ghost").leftTile).toBeNull();
  });
});
