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
 * The cap is 64 steps for every tier, and the default generator config is a
 * rotated+quartered LOOP (x4), so any word past 16 letters clears it.
 */
const flush = () => new Promise((resolve) => setTimeout(resolve, 250));

describe("LengthCard tier-cap clamp", () => {
  it("stays inert when it cannot clamp, rather than looping (spell mode)", async () => {
    const onCall = vi.fn();

    render(LengthCardClampHarness, {
      naturalDisplayLength: 80, // 20-letter word x4 LOOP multiplier
      maxOverride: 64, // step cap
      clampToMax: false,
      onCall,
    });

    await flush();

    expect(onCall).not.toHaveBeenCalled();
  });

  it("does not loop when a churning parent cannot honor the clamp", async () => {
    const onCall = vi.fn();

    render(LengthCardClampHarness, {
      naturalDisplayLength: 80,
      maxOverride: 64,
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
      currentLength: 80,
      currentMode: GenerationMode.FREEFORM,
      maxOverride: 64,
      onLengthChange,
    };

    const screen = render(LengthCard, props);
    await flush();
    expect(onLengthChange).toHaveBeenCalledWith(64);

    // Parent applies it; the clamp must go quiet rather than re-firing.
    onLengthChange.mockClear();
    await screen.rerender({ ...props, currentLength: 64 });
    await flush();
    expect(onLengthChange).not.toHaveBeenCalled();
  });
});
