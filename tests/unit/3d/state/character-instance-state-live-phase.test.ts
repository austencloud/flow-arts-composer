import { describe, it, expect } from "vitest";
import {
  createCharacterInstanceState,
  makeStandaloneDeps,
} from "$lib/shared/3d/state/character-instance-state.svelte";
import { FALG } from "$lib/shared/combination/domain/demo-fixtures";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

/**
 * Live performers address beats by a motion-relative phase (0.00 = start of
 * beat 1). The state owner decides where beat 1 lives because it reserves
 * index 0 for a static start pose when the sequence carries one. Consumers
 * must read that offset instead of hardcoding it.
 *
 * `totalSteps` is `$derived` and only recomputes inside a reactive root, so
 * these tests probe the step list through `goToStep`, which clamps against
 * the raw list.
 */
describe("CharacterInstanceState — live phase mapping", () => {
  it("reserves index 0 for the start pose and exposes the motion offset", () => {
    const state = createCharacterInstanceState(
      { id: "p1", positionX: 0 },
      makeStandaloneDeps()
    );
    expect(FALG.startPlacement).toBeTruthy();
    state.loadSequence(FALG);
    expect(state.motionStepOffset).toBe(1);

    // Start pose plus eight beats: the last reachable index is 8.
    state.goToStep(99);
    expect(state.currentStepIndex).toBe(FALG.steps.length);

    // Phase 6.99 is the end of beat 7 (L into East for this fixture).
    state.goToStep(Math.floor(6.99) + state.motionStepOffset);
    expect(state.currentStepIndex).toBe(7);
  });

  it("reports no offset when no start pose can exist", () => {
    const state = createCharacterInstanceState(
      { id: "p2", positionX: 0 },
      makeStandaloneDeps()
    );
    // A start pose is derived from the first step whenever one exists, so
    // only an empty sequence has nothing at index 0.
    const empty = { ...FALG, startPlacement: undefined, steps: [] };
    state.loadSequence(empty as unknown as SequenceData);
    expect(state.motionStepOffset).toBe(0);
  });
});
