import { afterEach, describe, expect, it } from "vitest";
import { flushSync } from "svelte";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import {
  canShowStepEditorDrawer,
  sequenceHasStepEditorContent,
} from "$lib/features/create/shared/services/step-editor-availability";
import { createAutoStepEditorEffectHarness } from "./auto-step-editor-effect-harness.svelte";

const sequenceWithStep = {
  id: "sequence-with-step",
  steps: [{ id: "step-1", stepNumber: 1 } as StepData],
} as SequenceData;

let dispose: (() => void) | undefined;

afterEach(() => {
  dispose?.();
  dispose = undefined;
});

describe("Create Step Editor availability", () => {
  it("does not treat an empty workspace as editor content", () => {
    expect(sequenceHasStepEditorContent(null)).toBe(false);
    expect(
      sequenceHasStepEditorContent({
        id: "empty-sequence",
        steps: [],
      } as SequenceData)
    ).toBe(false);
    expect(
      sequenceHasStepEditorContent({
        id: "start-only-sequence",
        steps: [],
        startingPlacement: {},
      } as SequenceData)
    ).toBe(true);
    expect(sequenceHasStepEditorContent(sequenceWithStep)).toBe(true);
  });

  it("waits for hydration before clearing a restored editor", () => {
    const harness = createAutoStepEditorEffectHarness({
      persistenceInitialized: false,
      sequence: null,
      selectedStepNumber: 3,
      panelOpen: true,
    });
    dispose = harness.dispose;

    flushSync();
    expect(harness.panelOpen).toBe(true);
    expect(harness.selectedStepNumber).toBe(3);

    harness.setPersistenceInitialized(true);
    flushSync();

    expect(harness.panelOpen).toBe(false);
    expect(harness.selectedStepNumber).toBeNull();
  });

  it("clears a restored multi-selection when hydration finds no sequence", () => {
    const harness = createAutoStepEditorEffectHarness({
      persistenceInitialized: true,
      sequence: null,
      selectedStepNumber: null,
      panelOpen: true,
      multiSelect: true,
    });
    dispose = harness.dispose;

    flushSync();

    expect(harness.panelOpen).toBe(false);
    expect(harness.multiSelect).toBe(false);
  });

  it("closes a restored editor when no step is selected", () => {
    const harness = createAutoStepEditorEffectHarness({
      persistenceInitialized: true,
      sequence: sequenceWithStep,
      selectedStepNumber: null,
      panelOpen: true,
    });
    dispose = harness.dispose;

    flushSync();

    expect(harness.panelOpen).toBe(false);
  });

  it("keeps the shared drawer open for a selected mandala", () => {
    const harness = createAutoStepEditorEffectHarness({
      persistenceInitialized: true,
      sequence: sequenceWithStep,
      selectedStepNumber: null,
      panelOpen: true,
      mandalaSelected: true,
    });
    dispose = harness.dispose;

    flushSync();

    expect(harness.panelOpen).toBe(true);
  });

  it("never allows the step editor to coexist with the sequence viewer", () => {
    expect(
      canShowStepEditorDrawer({
        sequence: sequenceWithStep,
        selectedStepNumber: 1,
        selectedStepNumbers: new Set(),
        hasMandalaSelection: false,
        isSequenceViewerOpen: true,
      })
    ).toBe(false);
  });

  it("still opens for a selected step in a real sequence", () => {
    const harness = createAutoStepEditorEffectHarness({
      persistenceInitialized: true,
      sequence: sequenceWithStep,
      selectedStepNumber: 1,
      panelOpen: false,
    });
    dispose = harness.dispose;

    flushSync();

    expect(harness.panelOpen).toBe(true);
    expect(harness.selectedStepNumber).toBe(1);
  });
});
