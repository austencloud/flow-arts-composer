import { describe, it, expect, vi, afterEach } from "vitest";
import { captureFxSlice, seedFromFxSlice } from "./fx-slice";
import { createEffectsConfigState } from "#lib/shared/effects/state/effects-config-state.svelte.js";
import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";

afterEach(() => vi.restoreAllMocks());

describe("fx slice", () => {
  it("returns null at factory defaults", () => {
    const state = createEffectsConfigState(undefined, { persist: false });
    expect(captureFxSlice(state)).toBeNull();
  });

  it("returns null when boot migration derived activeEffect from the default wildcard", () => {
    // migrateFromVmStorageOnce sets activeEffect = tipEffectMap["*"].effect
    // ("trails") on any browser with an animation-visibility-settings entry.
    // That is still the untouched default experience — no fx params.
    const state = createEffectsConfigState(
      { ...DEFAULT_EFFECTS_CONFIG, activeEffect: "trails" },
      { persist: false }
    );
    expect(captureFxSlice(state)).toBeNull();
  });

  it("captures an explicit 'none' (effects off) and round-trips it", () => {
    const a = createEffectsConfigState(undefined, { persist: false });
    a.setActiveEffect("none");
    const slice = captureFxSlice(a);
    expect(slice?.active).toBe("none");

    const b = createEffectsConfigState(seedFromFxSlice(slice!), { persist: false });
    expect(captureFxSlice(b)).toEqual(slice);
    expect(b.snapshot().tipEffectMap).toEqual({});
  });

  it("captures only the keys that differ from defaults", () => {
    const state = createEffectsConfigState(undefined, { persist: false });
    state.setActiveEffect("sparkles");
    state.updateEffect("sparkles", { rate: 0.92 });
    const slice = captureFxSlice(state);
    expect(slice?.active).toBe("sparkles");
    expect(slice?.tuning?.sparkles).toMatchObject({ rate: 0.92 });
    expect(slice?.tuning && "fire" in slice.tuning).toBe(false);
  });

  it("round-trips: capture -> seed -> new instance -> capture is identity", () => {
    const a = createEffectsConfigState(undefined, { persist: false });
    a.setActiveEffect("sparkles");
    a.updateEffect("sparkles", { rate: 0.92 });
    const slice = captureFxSlice(a);

    const b = createEffectsConfigState(seedFromFxSlice(slice!), { persist: false });
    expect(captureFxSlice(b)).toEqual(slice);
    expect(b.activeEffect).toBe("sparkles");
  });

  it("seeding + reading performs zero localStorage writes", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const state = createEffectsConfigState(
      seedFromFxSlice({ active: "sparkles", tuning: { sparkles: { rate: 0.92 } } }),
      { persist: false }
    );
    state.updateEffect("sparkles", { rate: 0.5 }); // tweaks during a link session stay session-local
    expect(setItem).not.toHaveBeenCalled();
  });

  it("seedFromFxSlice merges onto factory defaults, not user state", () => {
    const seeded = seedFromFxSlice({ active: "fire" });
    expect(seeded.activeEffect).toBe("fire");
    expect(seeded.sparkles).toEqual(DEFAULT_EFFECTS_CONFIG.sparkles);
  });

  it("seedFromFxSlice ignores unknown and __proto__ tuning keys from a hand-edited blob", () => {
    const tuning = JSON.parse(
      '{"__proto__":{"polluted":true},"notAnEffect":1,"sparkles":{"rate":0.3}}'
    ) as Record<string, unknown>;
    const seeded = seedFromFxSlice({ active: "sparkles", tuning });
    expect(Object.getPrototypeOf(seeded)).toBe(Object.prototype);
    expect("notAnEffect" in seeded).toBe(false);
    expect((seeded as unknown as { polluted?: boolean }).polluted).toBeUndefined();
    expect(seeded.sparkles).toMatchObject({ rate: 0.3 });
  });

  it("captures a plain persisted snapshot identically to a live instance (own-link side)", () => {
    // The orchestrator compares the disk side WITHOUT constructing a store
    // (that constructor registers the global undo domain and re-runs the VM
    // storage migration), so a plain snapshot must diff exactly like one.
    const live = createEffectsConfigState(undefined, { persist: false });
    live.setActiveEffect("sparkles");
    live.updateEffect("sparkles", { rate: 0.92 });
    const persisted = live.snapshot();
    expect(captureFxSlice({ snapshot: () => persisted })).toEqual(captureFxSlice(live));
  });

  describe("full snapshot", () => {
    it("emits active and every tuning key at defaults, and round-trips", () => {
      const state = createEffectsConfigState(undefined, { persist: false });
      const full = captureFxSlice(state, { full: true });
      expect(full).not.toBeNull();
      expect(full?.active).toBe("trails");
      const tuningKeys = Object.keys(full!.tuning!);
      const configKeys = Object.keys(DEFAULT_EFFECTS_CONFIG).filter(
        (k) => k !== "activeEffect" && k !== "tipEffectMap"
      );
      expect(tuningKeys.sort()).toEqual(configKeys.sort());
      // Canonical tipEffectMap is implied by `active`, never spelled out.
      expect("tipEffectMap" in full!.tuning!).toBe(false);

      const seeded = createEffectsConfigState(seedFromFxSlice(full!), { persist: false });
      expect(captureFxSlice(seeded, { full: true })).toEqual(full);
      // A full payload seeds the same state a diff payload would.
      expect(captureFxSlice(seeded)).toBeNull();
    });
  });
});
