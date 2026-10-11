import { flushSync } from "svelte";
import { effect, effect_root, get, set, state } from "svelte/internal/client";
import { describe, expect, it, vi } from "vitest";
import { syncHeroElementalGlyphVisibility } from "#lib/shared/landing/services/hero-elemental-glyph-visibility.js";

describe("syncHeroElementalGlyphVisibility", () => {
  it("does not capture synchronous canvas observer state during a hero handoff", () => {
    const elementPresent = state(false);
    const canvasRevision = state(0);
    const observer = vi.fn(() => {
      set(canvasRevision, get(canvasRevision) + 1);
    });
    let currentVisibility = false;
    const manager = {
      getVisibility: vi.fn(() => currentVisibility),
      setVisibility: vi.fn((_key: "elementalGlyph", visible: boolean) => {
        currentVisibility = visible;
        observer();
      }),
    };
    let effectRuns = 0;

    const cleanup = effect_root(() => {
      effect(() => {
        effectRuns += 1;
        syncHeroElementalGlyphVisibility(manager, get(elementPresent));
      });
    });
    flushSync();

    expect(effectRuns).toBe(1);
    expect(manager.setVisibility).not.toHaveBeenCalled();

    flushSync(() => set(elementPresent, true));

    expect(effectRuns).toBe(2);
    expect(manager.setVisibility).toHaveBeenCalledOnce();
    expect(manager.setVisibility).toHaveBeenLastCalledWith(
      "elementalGlyph",
      true
    );
    expect(observer).toHaveBeenCalledOnce();
    expect(get(canvasRevision)).toBe(1);

    cleanup();
  });
});
