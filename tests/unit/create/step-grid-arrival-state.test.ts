import { describe, expect, it } from "vitest";
import { createStepGridDisplayState } from "#lib/features/create/shared/workspace-panel/sequence-display/state/step-grid-display-state.svelte.js";

describe("step grid pictograph arrival ownership", () => {
  it("hands one staged arrival to its destination cell", () => {
    const state = createStepGridDisplayState();

    state.handleSingleBeatAddition(2, true);

    expect(state.arrivalRequest).toEqual({
      intent: "commit",
      stepIndex: 2,
      requestId: 1,
      owner: "stage",
      phase: "preview",
    });

    state.beginArrivalLanding(1);

    expect(state.arrivalRequest).toEqual({
      intent: "commit",
      stepIndex: 2,
      requestId: 1,
      owner: "stage",
      phase: "landing",
    });

    state.beginArrivalHandoff(1);

    expect(state.arrivalRequest).toEqual({
      intent: "commit",
      stepIndex: 2,
      requestId: 1,
      owner: "cell",
      phase: "landing",
    });

    state.completeArrival(1);
    expect(state.arrivalRequest).toBeNull();
  });

  it("supersedes an in-flight arrival without letting stale callbacks clear it", () => {
    const state = createStepGridDisplayState();

    state.handleSingleBeatAddition(2, true);
    state.handleSingleBeatAddition(3, true);

    expect(state.arrivalRequest).toEqual({
      intent: "commit",
      stepIndex: 3,
      requestId: 2,
      owner: "stage",
      phase: "preview",
    });

    state.beginArrivalLanding(1);
    state.beginArrivalHandoff(1);
    state.completeArrival(1);

    expect(state.arrivalRequest).toEqual({
      intent: "commit",
      stepIndex: 3,
      requestId: 2,
      owner: "stage",
      phase: "preview",
    });
  });

  it("does not stage single-step additions outside Construct", () => {
    const state = createStepGridDisplayState();

    state.handleSingleBeatAddition(1, false);

    expect(state.arrivalRequest).toBeNull();
  });

  it("clears an arrival when a full-sequence animation takes over", () => {
    const state = createStepGridDisplayState();

    state.handleSingleBeatAddition(1, true);
    state.prepareSequenceAnimation(4, "sequential");

    expect(state.arrivalRequest).toBeNull();
  });
});
