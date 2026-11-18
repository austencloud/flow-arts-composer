import { describe, it, expect, vi } from "vitest";
import { DEFAULT_EFFECTS_CONFIG } from "../../domain/defaults";
import { migrateEffectsConfig } from "../../domain/migrations";
import { EFFECTS_CONFIG_VERSION } from "../../domain/effects-config";

vi.mock("#lib/shared/3d/undo/get-scene-undo-manager.js", () => ({
  getSceneUndoManager: () => ({
    registerDomain: vi.fn(),
    captureState: vi.fn(),
    commitState: vi.fn(),
    commitStateCoalescing: vi.fn(),
  }),
}));

const { createEffectsConfigState } = await import(
  "../effects-config-state.svelte"
);

function make(map?: Record<string, { effect: string }>, active?: string) {
  return createEffectsConfigState(
    {
      ...DEFAULT_EFFECTS_CONFIG,
      ...(map ? { tipEffectMap: map } : {}),
      ...(active ? { activeEffect: active } : {}),
    } as typeof DEFAULT_EFFECTS_CONFIG,
    { persist: false }
  );
}

describe("per-prop effects in the effects state", () => {
  it("both props the same writes exactly what setActiveEffect writes", () => {
    const viaBoth = make();
    viaBoth.setEffectFor("both", "fire");
    const viaOld = make();
    viaOld.setActiveEffect("fire");
    expect(viaBoth.tipEffectMap).toEqual({ "*": { effect: "fire" } });
    expect(viaBoth.tipEffectMap).toEqual(viaOld.tipEffectMap);
    expect(viaBoth.activeEffect).toBe("fire");

    viaBoth.setEffectFor("both", "none");
    expect(viaBoth.tipEffectMap).toEqual({});
    expect(viaBoth.activeEffect).toBe("none");
  });

  it("props that differ store three keys, primary = left unless it is off", () => {
    const s = make();
    s.setEffectFor("both", "fire");
    s.setEffectFor(1, "trails");
    expect(s.tipEffectMap).toEqual({
      "*": { effect: "fire" },
      "0": { effect: "fire" },
      "1": { effect: "trails" },
    });
    expect(s.activeEffect).toBe("fire");
    expect(s.effectForHand(0)).toBe("fire");
    expect(s.effectForHand(1)).toBe("trails");
    expect(s.effectsDiffer()).toBe(true);

    s.setEffectFor(0, "none");
    expect(s.activeEffect).toBe("trails");
    expect(s.tipEffectMap["*"]?.effect).toBe("trails");
    expect(s.effectForHand(0)).toBe("none");
    expect(s.effectForHand(1)).toBe("trails");
  });

  it("one prop off while the other is lit never reads as none", () => {
    const s = make();
    s.setEffectFor("both", "none");
    s.setEffectFor(1, "led");
    expect(s.activeEffect).toBe("led");
    expect(s.effectForHand(0)).toBe("none");
    expect(s.effectForHand(1)).toBe("led");
  });

  it("writing one hand to match the other collapses to the single shape", () => {
    const s = make();
    s.setEffectFor(0, "fire");
    s.setEffectFor(1, "trails");
    s.setEffectFor(1, "fire");
    expect(s.tipEffectMap).toEqual({ "*": { effect: "fire" } });
    expect(s.effectsDiffer()).toBe(false);

    s.setEffectFor(0, "trails");
    s.setEffectFor(0, "none");
    s.setEffectFor(1, "none");
    expect(s.tipEffectMap).toEqual({});
    expect(s.activeEffect).toBe("none");
  });

  it("leaves existing per-tip keys alone", () => {
    const s = make({ "*": { effect: "trails" }, "0-1": { effect: "sparkles" } });
    s.setEffectFor(1, "fire");
    expect(s.tipEffectMap["0-1"]).toEqual({ effect: "sparkles" });
    s.setEffectFor(1, "trails");
    expect(s.tipEffectMap).toEqual({
      "*": { effect: "trails" },
      "0-1": { effect: "sparkles" },
    });
  });

  it("setActiveEffect still gives both props one effect from a mix", () => {
    const s = make();
    s.setEffectFor(0, "fire");
    s.setEffectFor(1, "trails");
    s.setActiveEffect("led");
    expect(s.tipEffectMap).toEqual({ "*": { effect: "led" } });
    expect(s.effectsDiffer()).toBe(false);
  });

  it("each hand remembers its own last effect for the On switch", () => {
    const s = make();
    s.setEffectFor(0, "fire");
    s.setEffectFor(1, "trails");
    s.toggleEffectFor(0, "led"); // left off
    expect(s.effectForHand(0)).toBe("none");
    expect(s.effectForHand(1)).toBe("trails");
    s.toggleEffectFor(1, "led"); // right off
    s.toggleEffectFor(1, "led"); // right back to ITS effect, not left's
    expect(s.effectForHand(1)).toBe("trails");
    s.toggleEffectFor(0, "led"); // left back to fire
    expect(s.effectForHand(0)).toBe("fire");
  });

  it("Both keeps today's switch: off, then back to what was last on", () => {
    const s = make();
    s.setEffectFor("both", "fire");
    s.toggleEffectFor("both", "trails");
    expect(s.activeEffect).toBe("none");
    expect(s.tipEffectMap).toEqual({});
    s.toggleEffectFor("both", "trails");
    expect(s.tipEffectMap).toEqual({ "*": { effect: "fire" } });
    const fresh = make({}, "none");
    fresh.toggleEffectFor(0, "trails");
    expect(fresh.effectForHand(0)).toBe("trails");
  });
});

describe("Both's On switch and the memory", () => {
  it("Off then On with Both brings back a mix exactly", () => {
    const s = make();
    s.setEffectFor(0, "fire");
    s.setEffectFor(1, "trails");
    s.toggleEffectFor("both", "led");
    expect(s.tipEffectMap).toEqual({});
    expect(s.activeEffect).toBe("none");
    s.toggleEffectFor("both", "led");
    expect(s.effectForHand(0)).toBe("fire");
    expect(s.effectForHand(1)).toBe("trails");
    expect(s.tipEffectMap).toEqual({
      "*": { effect: "fire" },
      "0": { effect: "fire" },
      "1": { effect: "trails" },
    });
  });

  it("brings back left fire with the right prop on nothing", () => {
    const s = make({}, "none");
    s.setEffectFor(0, "fire");
    expect(s.effectForHand(1)).toBe("none");
    s.toggleEffectFor("both", "led");
    s.toggleEffectFor("both", "led");
    expect(s.effectForHand(0)).toBe("fire");
    expect(s.effectForHand(1)).toBe("none");
  });

  it("with no memory, On gives first to both props", () => {
    const s = make({}, "none");
    s.toggleEffectFor("both", "led");
    expect(s.tipEffectMap).toEqual({ "*": { effect: "led" } });
  });

  it("the pair is the one last lit, after one prop goes off first", () => {
    const s = make();
    s.setEffectFor(0, "fire");
    s.setEffectFor(1, "trails");
    s.setEffectFor(0, "none"); // right alone is lit: (none, trails)
    s.toggleEffectFor("both", "led"); // off
    s.toggleEffectFor("both", "led"); // back
    expect(s.effectForHand(0)).toBe("none");
    expect(s.effectForHand(1)).toBe("trails");
  });

  it("setActiveEffect remembers what was on before another writer changes it", () => {
    const s = make();
    s.setEffectFor(0, "fire");
    s.setEffectFor(1, "trails");
    s.setActiveEffect("none"); // keyboard, voice or canvas menu
    s.toggleEffectFor("both", "led");
    expect(s.effectForHand(0)).toBe("fire");
    expect(s.effectForHand(1)).toBe("trails");
    s.setActiveEffect("none");
    s.toggleEffectFor(1, "led");
    expect(s.effectForHand(1)).toBe("trails");
  });
});

describe("loading a saved map", () => {
  const mix = {
    "*": { effect: "fire" },
    "0": { effect: "fire" },
    "1": { effect: "trails" },
  };

  it("migrateEffectsConfig passes a three-key map through untouched", () => {
    const out = migrateEffectsConfig({
      version: EFFECTS_CONFIG_VERSION,
      tipEffectMap: structuredClone(mix),
      activeEffect: "fire",
    });
    expect(out.tipEffectMap).toEqual(mix);
    const old = migrateEffectsConfig({
      version: EFFECTS_CONFIG_VERSION - 1,
      tipEffectMap: structuredClone(mix),
    });
    expect(old.tipEffectMap).toEqual(mix);
  });

  it("the state loads a three-key map and reads each prop", () => {
    const s = make(structuredClone(mix), "fire");
    expect(s.tipEffectMap).toEqual(mix);
    expect(s.effectForHand(1)).toBe("trails");
    expect(s.effectsDiffer()).toBe(true);
  });

  it("an old single-effect config loads to the same map", () => {
    const old = { "*": { effect: "fire" } };
    const s = make(structuredClone(old), "fire");
    expect(s.tipEffectMap).toEqual(old);
    expect(s.effectsDiffer()).toBe(false);
    expect(s.snapshot().tipEffectMap).toEqual(old);
  });
});
