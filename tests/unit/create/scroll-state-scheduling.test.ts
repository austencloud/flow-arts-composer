import { afterEach, describe, expect, it, vi } from "vitest";
import { effect_root } from "svelte/internal/client";
import { createScrollState } from "$lib/features/create/shared/workspace-panel/sequence-display/state/scroll-state.svelte";

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.unstubAllGlobals();
});

function createState() {
  let state!: ReturnType<typeof createScrollState>;
  cleanup = effect_root(() => {
    state = createScrollState();
  });
  return state;
}

describe("scrollbar scheduling", () => {
  it("coalesces resize checks and applies the last geometry in the frame", () => {
    let frame: FrameRequestCallback | undefined;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frame = callback;
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const state = createState();
    const container = document.createElement("div");
    Object.defineProperties(container, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 100 },
    });
    state.setScrollContainer(container);

    state.scheduleScrollbarCheck();
    state.scheduleScrollbarCheck();
    Object.defineProperty(container, "scrollHeight", {
      configurable: true,
      value: 131,
    });
    frame?.(0);

    expect(state.hasVerticalScrollbar).toBe(true);
  });

  it("cancels a scheduled check when the hidden editor releases its container", () => {
    vi.stubGlobal("requestAnimationFrame", () => 7);
    const cancelAnimationFrame = vi.fn();
    vi.stubGlobal("cancelAnimationFrame", cancelAnimationFrame);
    const state = createState();
    state.setScrollContainer(document.createElement("div"));
    state.scheduleScrollbarCheck();
    state.setScrollContainer(null);

    expect(cancelAnimationFrame).toHaveBeenCalledWith(7);
  });
});
