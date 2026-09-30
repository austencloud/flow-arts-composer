import { describe, expect, it } from "vitest";
import { DEFAULT_EFFECTS_CONFIG } from "$lib/shared/effects/domain/defaults";
import { createEffectsConfigState } from "$lib/shared/effects/state/effects-config-state.svelte";
import { copyPostAnimationEffects } from "$lib/shared/share/components/post-studio/post-animation-effects.svelte";

describe("post animation effects", () => {
  it("copies restored reactive effects for a scoped preview without a DataCloneError", () => {
    const restored = JSON.parse(JSON.stringify(DEFAULT_EFFECTS_CONFIG));
    const state = createEffectsConfigState(restored, { persist: false });
    state.setActiveEffect("trails");
    expect(() => structuredClone(state.config)).toThrow();

    const copy = copyPostAnimationEffects(state.config);
    expect(copy.activeEffect).toBe("trails");
    expect(() => structuredClone(copy)).not.toThrow();
    copy.activeEffect = "none";
    expect(state.activeEffect).toBe("trails");
  });
});
