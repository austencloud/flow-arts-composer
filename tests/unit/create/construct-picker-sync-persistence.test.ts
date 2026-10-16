import { afterEach, describe, expect, it, vi } from "vitest";
import { createConstructTabState } from "#lib/features/create/shared/state/construct-tab-state.svelte.js";

describe("Construct picker synchronization", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not save an empty draft when startup clears the picker, but saves a user clear", async () => {
    vi.useFakeTimers();
    const markDirty = vi.fn();
    const saveCurrentState = vi.fn().mockResolvedValue(undefined);
    const state = createConstructTabState(
      { initialize: vi.fn() } as never,
      {} as never,
      { markDirty, saveCurrentState } as never
    );

    state.handleStartPlacementSelected(null, "sync");
    await vi.advanceTimersByTimeAsync(600);
    expect(markDirty).not.toHaveBeenCalled();
    expect(saveCurrentState).not.toHaveBeenCalled();

    state.handleStartPlacementSelected(null, "user");
    expect(markDirty).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(600);
    expect(saveCurrentState).toHaveBeenCalledOnce();
  });
});
