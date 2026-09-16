import { describe, expect, it } from "vitest";
import { createSequenceState } from "$lib/features/create/shared/state/sequence-state-orchestrator.svelte";
import { createSequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

/**
 * Guards the construct race that produced "Something went wrong adding that
 * step": picking a start placement flips the UI to the option picker while
 * createSequence() is still in flight, so an early tap sees a null sequence.
 */
describe("sequence creation race", () => {
  /** A state whose sequenceService.createSequence hangs until release() is called. */
  function gatedState() {
    let release: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const sequenceService = {
      async createSequence(request: {
        name: string;
        word: string;
      }): Promise<SequenceData> {
        await gate;
        return createSequenceData({
          id: "created",
          name: request.name,
          word: request.word,
          steps: [],
        });
      },
    } as never;

    return {
      state: createSequenceState({ sequenceService }),
      release: () => release?.(),
    };
  }

  it("whenCurrentSequenceReady resolves the sequence created after the tap", async () => {
    const { state, release } = gatedState();

    // The user picks a start placement — creation starts but has not settled.
    const creation = state.createSequence({ name: "Test", length: 0 });

    // The option picker is already up, and the user taps. This is the exact
    // moment that used to throw.
    expect(state.getCurrentSequence()).toBeNull();
    const awaited = state.whenCurrentSequenceReady();

    // Creation settles.
    release();
    await creation;

    const resolved = await awaited;
    expect(resolved).not.toBeNull();
    expect(resolved?.id).toBe("created");
  });

  it("resolves immediately when a sequence already exists", async () => {
    const { state, release } = gatedState();
    release();
    await state.createSequence({ name: "Test", length: 0 });

    await expect(state.whenCurrentSequenceReady()).resolves.not.toBeNull();
  });

  it("resolves null when nothing is pending and nothing exists", async () => {
    const { state } = gatedState();

    await expect(state.whenCurrentSequenceReady()).resolves.toBeNull();
  });
});
