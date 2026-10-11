import { render } from "vitest-browser-svelte";
import { describe, it, expect, vi } from "vitest";
import { GenerationMode } from "#lib/shared/foundation/domain/models/generation/generate-models.js";
import LengthCard from "./LengthCard.svelte";
import LengthCardClampHarness from "./__tests__/LengthCardClampHarness.svelte";

/**
 * The tier-cap clamp effect used to run away in spell mode.
 *
 * In spell mode `currentLength` is derived from the typed word, so pushing
 * `MAX_LENGTH` back through `onLengthChange` can never lower it — the effect's
 * condition stays true. The parent rebuilds the handler closure on every config
 * write, and the effect read that callback as a dependency, so it re-armed
 * itself until Svelte threw `effect_update_depth_exceeded`. On a phone that
 * read as "the app crashed the instant I typed my name", and it repeated on
 * every panel open because the word is persisted to localStorage.
 *
 * Guest cap is 8 steps and the default generator config is a rotated+quartered
 * LOOP (x4), so any 3-letter word cleared the cap.
 */
const flush = () => new Promise((resolve) => setTimeout(resolve, 250));

describe("LengthCard tier-cap clamp", () => {
  it("stays inert when it cannot clamp, rather than looping (spell mode)", async () => {
    const onCall = vi.fn();
    const onCapExceeded = vi.fn();

    render(LengthCardClampHarness, {
      naturalDisplayLength: 24, // 6-letter word x4 LOOP multiplier
      maxOverride: 8, // guest cap
      clampToMax: false,
      onCall,
      onCapExceeded,
    });

    await flush();

    expect(onCall).not.toHaveBeenCalled();
    // No auto-fired sign-up nudge just for opening the panel with a long word.
    expect(onCapExceeded).not.toHaveBeenCalled();
  });

  it("does not loop when a churning parent cannot honor the clamp", async () => {
    const onCall = vi.fn();

    render(LengthCardClampHarness, {
      naturalDisplayLength: 24,
      maxOverride: 8,
      clampToMax: true, // parent claims it can clamp, but never lowers the value
      onCall,
    });

    await flush();

    // One clamp attempt is fine. A runaway effect fires hundreds of times.
    expect(onCall.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it("still clamps once when the parent CAN honor it (freeform)", async () => {
    const onLengthChange = vi.fn();
    const props = {
      currentLength: 16,
      currentMode: GenerationMode.FREEFORM,
      maxOverride: 8,
      onLengthChange,
    };

    const screen = render(LengthCard, props);
    await flush();
    expect(onLengthChange).toHaveBeenCalledWith(8);

    // Parent applies it; the clamp must go quiet rather than re-firing.
    onLengthChange.mockClear();
    await screen.rerender({ ...props, currentLength: 8 });
    await flush();
    expect(onLengthChange).not.toHaveBeenCalled();
  });
});
