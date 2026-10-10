import { describe, expect, it } from "vitest";
import { getArrivalPresentedStepCount } from "#lib/features/create/shared/workspace-panel/sequence-display/domain/pictograph-arrival-layout.js";
import type { PictographArrivalRequest } from "#lib/features/create/shared/workspace-panel/sequence-display/state/step-grid-display-state.svelte.js";

function createRequest(
  overrides: Partial<PictographArrivalRequest> = {}
): PictographArrivalRequest {
  return {
    intent: "commit",
    stepIndex: 4,
    requestId: 1,
    owner: "stage",
    phase: "preview",
    ...overrides,
  };
}

describe("pictograph arrival grid presentation", () => {
  it("holds the newly committed step off-grid throughout the preview", () => {
    expect(getArrivalPresentedStepCount(5, createRequest())).toBe(4);
  });

  it("releases the complete grid when landing begins", () => {
    expect(
      getArrivalPresentedStepCount(5, createRequest({ phase: "landing" }))
    ).toBe(5);
  });

  it("keeps every step when the request no longer owns the stage", () => {
    expect(
      getArrivalPresentedStepCount(
        5,
        createRequest({ owner: "cell", phase: "landing" })
      )
    ).toBe(5);
  });

  it("does not hide a step for a stale request", () => {
    expect(
      getArrivalPresentedStepCount(6, createRequest({ stepIndex: 4 }))
    ).toBe(6);
  });
});
