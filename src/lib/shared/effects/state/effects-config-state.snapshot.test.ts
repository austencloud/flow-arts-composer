// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import {
  createEffectsConfigState,
  loadPersistedEffectsConfig,
} from "./effects-config-state.svelte";
import { DEFAULT_EFFECTS_CONFIG } from "../domain/defaults";

describe("effects config snapshot", () => {
  it("snapshot() returns a detached full config", () => {
    const state = createEffectsConfigState(undefined, { persist: false });
    state.setActiveEffect("sparkles");
    const snap = state.snapshot();
    expect(snap.activeEffect).toBe("sparkles");
    // Detached: mutating the snapshot must not affect live state
    (snap as { activeEffect: string }).activeEffect = "fire";
    expect(state.activeEffect).toBe("sparkles");
  });

  it("loadPersistedEffectsConfig returns null with empty storage", () => {
    localStorage.clear();
    expect(loadPersistedEffectsConfig()).toBeNull();
  });

  it("snapshot at factory defaults deep-equals DEFAULT_EFFECTS_CONFIG", () => {
    const state = createEffectsConfigState(undefined, { persist: false });
    expect(state.snapshot()).toEqual(DEFAULT_EFFECTS_CONFIG);
  });
});
