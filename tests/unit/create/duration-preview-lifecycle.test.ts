import { afterEach, describe, expect, it } from "vitest";
import { effect_root } from "svelte/internal/client";
import {
  createPanelCoordinationState,
  type PanelCoordinationState,
} from "#lib/shared/create/state/panel-coordination-state.svelte.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

function createState(): PanelCoordinationState {
  let state!: PanelCoordinationState;
  cleanup = effect_root(() => {
    state = createPanelCoordinationState();
  });
  return state;
}

function makeSequence(id: string): SequenceData {
  return {
    id,
    name: "",
    word: "",
    steps: [{ id: `${id}-step-1`, stepNumber: 1 } as StepData],
    thumbnails: [],
    isFavorite: false,
    isCircular: false,
    tags: [],
    metadata: {},
  } satisfies SequenceData;
}

function expectPreviewCleared(state: PanelCoordinationState) {
  expect(state.isDurationPreviewMode).toBe(false);
  expect(state.previewSequence).toBeNull();
  expect(state.originalSequence).toBeNull();
}

describe("Duration preview lifecycle", () => {
  it("cancels an active preview when Sequence Actions closes", () => {
    const state = createState();
    state.openSequenceActionsPanel();
    state.enterDurationPreviewMode(makeSequence("original"));

    state.closeSequenceActionsPanel();

    expectPreviewCleared(state);
  });

  it("cancels an active preview when all panels close", () => {
    const state = createState();
    state.openSequenceActionsPanel();
    state.enterDurationPreviewMode(makeSequence("original"));

    state.closeAllPanels();

    expectPreviewCleared(state);
  });

  it("cancels an active preview when another panel opens", () => {
    const state = createState();
    state.openSequenceActionsPanel();
    state.enterDurationPreviewMode(makeSequence("original"));

    state.openFilterPanel();

    expectPreviewCleared(state);
    expect(state.isFilterPanelOpen).toBe(true);
  });

  it("returns the previewed sequence on apply and the original on cancel", () => {
    const state = createState();
    const original = makeSequence("original");
    const previewed = makeSequence("previewed");

    state.enterDurationPreviewMode(original);
    state.setPreviewSequence(previewed);
    const applied = state.exitDurationPreviewMode(true);
    expect(applied.sequence?.id).toBe("previewed");
    expectPreviewCleared(state);

    state.enterDurationPreviewMode(original);
    state.setPreviewSequence(previewed);
    const reverted = state.exitDurationPreviewMode(false);
    expect(reverted.sequence?.id).toBe("original");
    expectPreviewCleared(state);
  });

  it("re-opening Sequence Actions after a stale close does not resurrect preview state", () => {
    const state = createState();
    state.openSequenceActionsPanel();
    state.enterDurationPreviewMode(makeSequence("original"));
    state.closeSequenceActionsPanel();

    state.openSequenceActionsPanel();

    expectPreviewCleared(state);
  });
});
