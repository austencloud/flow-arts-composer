import { describe, it, expect } from "vitest";
import { buildTipEffectMap } from "#lib/features/coven-hub/domain/coven-effect-map.js";

describe("buildTipEffectMap", () => {
  it("maps a valid effect id onto the wildcard tip key", () => {
    expect(buildTipEffectMap("fire")).toEqual({ "*": { effect: "fire" } });
  });

  it("falls back to led for the seed coven (null id)", () => {
    expect(buildTipEffectMap(null)).toEqual({ "*": { effect: "led" } });
  });

  it("falls back to led for an unknown id rather than emitting garbage", () => {
    expect(buildTipEffectMap("not-an-effect")).toEqual({ "*": { effect: "led" } });
  });
});
