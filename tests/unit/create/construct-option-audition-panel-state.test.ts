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

const sequence = {
  id: "sequence",
  name: "",
  word: "",
  steps: [{ id: "step-1", stepNumber: 1 } as StepData],
  thumbnails: [],
  isFavorite: false,
  isCircular: false,
  tags: [],
  metadata: {},
} satisfies SequenceData;

describe("Construct option audition panel state", () => {
  it("restarts repeated auditions with a new request identity", () => {
    const state = createState();
    const request = {
      sequence,
      sourceSequenceRevision: 1,
      stepNumber: 1,
      activatedAt: 10,
    };

    state.enterOptionAudition(request);
    const firstId = state.optionAudition?.requestId;
    state.enterOptionAudition(request);

    expect(state.optionAudition?.requestId).toBe((firstId ?? 0) + 1);
  });

  it("keeps duration previews and option auditions mutually exclusive", () => {
    const state = createState();

    state.enterDurationPreviewMode(sequence);
    state.enterOptionAudition({
      sequence,
      sourceSequenceRevision: 1,
      stepNumber: 1,
      activatedAt: 10,
    });

    expect(state.isDurationPreviewMode).toBe(false);
    expect(state.previewSequence).toBeNull();
    expect(state.optionAudition?.stepNumber).toBe(1);

    state.enterDurationPreviewMode(sequence);
    expect(state.optionAudition).toBeNull();
  });

  it("clears the temporary preview when the hold ends", () => {
    const state = createState();

    state.enterOptionAudition({
      sequence,
      sourceSequenceRevision: 1,
      stepNumber: 1,
      activatedAt: 10,
    });
    state.exitOptionAudition();
    expect(state.optionAudition).toBeNull();
  });
});
