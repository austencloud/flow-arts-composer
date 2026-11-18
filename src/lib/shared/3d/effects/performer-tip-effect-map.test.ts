import { describe, expect, it } from "vitest";
import {
  effectsOnProp,
  performerHandEffects,
  performerTipEffectMap,
} from "./performer-tip-effect-map";
import { resolveEffect } from "#lib/shared/animation-engine/domain/types/tip-effect-types.js";

const shared = {
  "*": { effect: "fire" },
  "0": { effect: "fire" },
  "1": { effect: "trails" },
} as const;

describe("performerTipEffectMap", () => {
  it("own hand effects come first, whatever the shared map says", () => {
    const p = {
      rawEffect: "led" as const,
      rawHandEffects: { left: "zap" as const, right: "none" as const },
    };
    expect(performerHandEffects(p, shared)).toEqual({
      left: "zap",
      right: "none",
    });
  });

  it("own single effect beats the shared per-prop choice on both props", () => {
    const p = { rawEffect: "sparkles" as const, rawHandEffects: null };
    expect(performerHandEffects(p, shared)).toEqual({
      left: "sparkles",
      right: "sparkles",
    });
  });

  it("with nothing of its own the shared map passes through whole", () => {
    const map = performerTipEffectMap({}, shared);
    expect(map).toEqual(shared);
    expect(map).not.toBe(shared);
    expect(resolveEffect(0, 0, undefined, map)).toBe("fire");
    expect(resolveEffect(1, 3, undefined, map)).toBe("trails");
    expect(performerHandEffects({}, shared)).toEqual({
      left: "fire",
      right: "trails",
    });
  });

  it("a shared single-effect map still gives both props the same effect", () => {
    expect(performerHandEffects({}, { "*": { effect: "led" } })).toEqual({
      left: "led",
      right: "led",
    });
    expect(performerHandEffects({}, {})).toEqual({
      left: "none",
      right: "none",
    });
  });
});

describe("effectsOnProp", () => {
  const keys = [0, 1];

  it("lists what each prop wears, so an effect lights only its own prop", () => {
    expect(effectsOnProp(0, keys, undefined, shared)).toEqual(["fire"]);
    expect(effectsOnProp(1, keys, undefined, shared)).toEqual(["trails"]);
  });

  it("a prop set to nothing lists none, and matching props list the same", () => {
    const off = {
      "*": { effect: "goo" },
      "0": { effect: "none" },
      "1": { effect: "goo" },
    } as const;
    expect(effectsOnProp(0, keys, undefined, { ...off })).toEqual(["none"]);
    expect(effectsOnProp(1, keys, undefined, { ...off })).toEqual(["goo"]);
    const same = { "*": { effect: "smoke" } } as const;
    expect(effectsOnProp(0, keys, { ...same }, {})).toEqual(["smoke"]);
    expect(effectsOnProp(1, keys, { ...same }, {})).toEqual(["smoke"]);
  });

  it("per-tip keys on one prop are all listed", () => {
    const map = { "*": { effect: "fire" }, "0-1": { effect: "zap" } } as const;
    expect(effectsOnProp(0, keys, { ...map }, {}).sort()).toEqual([
      "fire",
      "zap",
    ]);
    expect(effectsOnProp(1, keys, { ...map }, {})).toEqual(["fire"]);
  });
});
