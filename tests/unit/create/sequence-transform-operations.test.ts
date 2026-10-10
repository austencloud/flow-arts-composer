import { afterEach, describe, expect, it, vi } from "vitest";
import { createSequenceTransformOperations } from "#lib/features/create/shared/state/operations/sequence-transform-operations.js";
import type { SequenceTransformer } from "#lib/features/create/shared/services/sequence-transforms/sequence-transformer.js";
import type { SequenceCoreState } from "#lib/features/create/shared/state/core/sequence-core-state.svelte.js";
import type { SequenceSelectionState } from "#lib/features/create/shared/state/selection/sequence-selection-state.svelte.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { StartPlacementData } from "#lib/shared/foundation/domain/models/start-placement-data.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sequence transform operations", () => {
  it("does not restore late single-hand letters over an undo", async () => {
    const original = { id: "original", steps: [] } as unknown as SequenceData;
    const transformed = { ...original, name: "mirrored" } as SequenceData;
    const letters = { ...transformed, name: "late letters" } as SequenceData;
    let currentSequence: SequenceData | null = original;
    let currentSequenceRevision = 0;
    let resolveLetters!: (sequence: SequenceData) => void;
    const setCurrentSequence = vi.fn((next: SequenceData | null) => {
      currentSequence = next;
      currentSequenceRevision++;
    });
    const coreState = {
      get currentSequence() {
        return currentSequence ? { ...currentSequence } : null;
      },
      get currentSequenceRevision() {
        return currentSequenceRevision;
      },
      setCurrentSequence,
      clearError: vi.fn(),
    } as unknown as SequenceCoreState;
    const onSave = vi.fn(async () => {});
    const transformer = {
      mirrorSequence: vi.fn(async () => transformed),
      deriveSequenceLetters: vi.fn(
        () =>
          new Promise<SequenceData>((resolve) => {
            resolveLetters = resolve;
          })
      ),
    } as unknown as SequenceTransformer;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      void callback(0);
      return 1;
    });
    const operations = createSequenceTransformOperations({
      coreState,
      selectionState: {
        setStartPlacement: vi.fn(),
      } as unknown as SequenceSelectionState,
      SequenceTransformer: transformer,
      onSave,
    });

    await operations.mirrorSequence("red");
    expect(currentSequence).toBe(transformed);
    setCurrentSequence(original);
    resolveLetters(letters);
    await vi.waitFor(() =>
      expect(transformer.deriveSequenceLetters).toHaveBeenCalledOnce()
    );
    await Promise.resolve();

    expect(currentSequence).toBe(original);
    expect(setCurrentSequence).toHaveBeenCalledTimes(2);
    expect(onSave).not.toHaveBeenCalled();
  });

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
    let currentSequenceRevision = 0;
    const setCurrentSequence = vi.fn((next: SequenceData | null) => {
      currentSequence = next;
      currentSequenceRevision++;
    });
    const coreState = {
      get currentSequence() {
        return currentSequence ? { ...currentSequence } : null;
      },
      get currentSequenceRevision() {
        return currentSequenceRevision;
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
    expect(selectionState.setStartPlacement).toHaveBeenCalledWith(
      startPlacement
    );
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});
