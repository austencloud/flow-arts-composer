import { describe, expect, it } from "vitest";
import { resolveTipEffect } from "./tip-effect-resolver";
import { hasTrailTips } from "./effect-tip-builders";

const mix = {
  "*": { effect: "fire" },
  "0": { effect: "fire" },
  "1": { effect: "trails" },
} as const;

describe("tip effects for a map with one effect per prop", () => {
  it("each prop draws its own effect on every tip", () => {
    for (const tip of [0, 1, 2, 4]) {
      expect(resolveTipEffect(0, tip, undefined, { ...mix })).toBe("fire");
      expect(resolveTipEffect(1, tip, undefined, { ...mix })).toBe("trails");
    }
  });

  it("a prop switched off stays off while the other keeps its effect", () => {
    const map = {
      "*": { effect: "trails" },
      "0": { effect: "none" },
      "1": { effect: "trails" },
    } as const;
    expect(resolveTipEffect(0, 0, undefined, { ...map })).toBe("none");
    expect(resolveTipEffect(1, 0, undefined, { ...map })).toBe("trails");
    expect(hasTrailTips({ ...map })).toBe(true);
  });

  it("a stored per-tip key still wins over the hand keys", () => {
    const map = { ...mix, "1-1": { effect: "led" } } as const;
    expect(resolveTipEffect(1, 1, undefined, map)).toBe("led");
    expect(resolveTipEffect(1, 0, undefined, map)).toBe("trails");
  });

  it("an older single-effect map still lights both props", () => {
    const old = { "*": { effect: "fire" } } as const;
    expect(resolveTipEffect(0, 0, undefined, { ...old })).toBe("fire");
    expect(resolveTipEffect(1, 0, undefined, { ...old })).toBe("fire");
  });
});
