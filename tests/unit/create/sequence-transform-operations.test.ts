import { afterEach, describe, expect, it, vi } from "vitest";
import { createSequenceTransformOperations } from "$lib/features/create/shared/state/operations/sequence-transform-operations";
import type { SequenceTransformer } from "$lib/features/create/shared/services/sequence-transforms/sequence-transformer";
import type { SequenceCoreState } from "$lib/features/create/shared/state/core/sequence-core-state.svelte";
import type { SequenceSelectionState } from "$lib/features/create/shared/state/selection/sequence-selection-state.svelte";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { StartPlacementData } from "$lib/shared/foundation/domain/models/start-placement-data";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sequence transform operations", () => {
  it("applies a multi-step single-hand rotation once and resolves after letter derivation", async () => {
    const startPlacement = {
      id: "start",
      motions: {},
      isStartPlacement: true,
    } as unknown as StartPlacementData;
    const sequence = {
      id: "sequence",
      steps: [],
      startPlacement,
      startingPlacement: startPlacement,
    } as unknown as SequenceData;
    const transformedSequence = {
      ...sequence,
      name: "geometry-updated",
    } as SequenceData;
    const sequenceWithLetters = {
      ...transformedSequence,
      name: "letters-updated",
    } as SequenceData;

    let currentSequence: SequenceData | null = sequence;
    const setCurrentSequence = vi.fn((next: SequenceData | null) => {
      currentSequence = next;
    });
    const coreState = {
      get currentSequence() {
        return currentSequence;
      },
      setCurrentSequence,
      clearError: vi.fn(),
      setError: vi.fn(),
    } as unknown as SequenceCoreState;
    const selectionState = {
      setStartPlacement: vi.fn(),
    } as unknown as SequenceSelectionState;
    const rotateSequence = vi.fn(async () => transformedSequence);
    const deriveSequenceLetters = vi.fn(async () => sequenceWithLetters);
    const transformer = {
      rotateSequence,
      deriveSequenceLetters,
    } as unknown as SequenceTransformer;
    const onSave = vi.fn(async () => {});

    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });

    const operations = createSequenceTransformOperations({
      coreState,
      selectionState,
      SequenceTransformer: transformer,
      onSave,
    });

    await operations.rotateSequence("clockwise", "red", 2);

    expect(rotateSequence).toHaveBeenCalledTimes(1);
    expect(rotateSequence).toHaveBeenCalledWith(sequence, 2, "red");
    expect(deriveSequenceLetters).toHaveBeenCalledTimes(1);
    expect(deriveSequenceLetters).toHaveBeenCalledWith(transformedSequence);
    expect(setCurrentSequence).toHaveBeenNthCalledWith(1, transformedSequence);
    expect(setCurrentSequence).toHaveBeenNthCalledWith(2, sequenceWithLetters);
    expect(selectionState.setStartPlacement).toHaveBeenCalledWith(startPlacement);
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});
