import { beforeEach, describe, expect, it } from "vitest";
import { createVideoTrailsState } from "$lib/features/video/video-trails/state/video-trails-state.svelte";
import * as corrector from "$lib/features/video/video-trails/services/detection-corrector";
import type { EndpointCorrection } from "$lib/features/video/video-trails/domain/types";
import {
  historyForSource,
  recordGuidedPlacement,
  undoGuidedPlacement,
} from "$lib/features/video/video-trails/views/guided-placement-undo";

function createState() {
  type StateArgs = Parameters<typeof createVideoTrailsState>;
  return createVideoTrailsState(
    {} as StateArgs[0],
    corrector,
    { reset() {} } as StateArgs[2],
  );
}

const earlier: EndpointCorrection = {
  propIndex: 0,
  tipIndex: 1,
  detected: { x: 12, y: 13, confidence: 0.7 },
  corrected: { x: 20, y: 21 },
  status: "corrected",
};

describe("video trail correction undo", () => {
  beforeEach(() => sessionStorage.clear());

  it("restores an earlier manual correction after a guided replacement", () => {
    const state = createState();
    state.correctEndpoint(5, earlier);
    const stack = recordGuidedPlacement([], state, {
      sourceUrl: "video-a",
      frame: 5,
      propIndex: 0,
      tipIndex: 1,
      previousGuidedStepIdx: 1,
      previousFrame: 5,
    });
    state.correctEndpoint(5, { ...earlier, corrected: { x: 40, y: 41 } });
    expect(state.corrections[5]?.[0]?.corrected).toEqual({ x: 40, y: 41 });

    const undone = undoGuidedPlacement(stack, state, "video-a");
    expect(undone.entry?.previousGuidedStepIdx).toBe(1);
    expect(undone.stack).toEqual([]);
    expect(state.corrections[5]).toEqual([earlier]);
    expect(JSON.parse(sessionStorage.getItem("video-trails-corrections")!)[5]).toEqual([earlier]);
  });

  it("removes a first placement without erasing another correction on the frame", () => {
    const state = createState();
    const other: EndpointCorrection = { ...earlier, propIndex: 1 };
    state.correctEndpoint(5, other);
    const stack = recordGuidedPlacement([], state, {
      sourceUrl: "video-a",
      frame: 5,
      propIndex: 0,
      tipIndex: 1,
      previousGuidedStepIdx: 1,
      previousFrame: 5,
    });
    state.correctEndpoint(5, earlier);
    undoGuidedPlacement(stack, state, "video-a");
    expect(state.corrections[5]).toEqual([other]);
    expect(JSON.parse(sessionStorage.getItem("video-trails-corrections")!)[5]).toEqual([other]);

    state.removeCorrection(5, 1, 1);
    expect(state.corrections[5]).toBeUndefined();
    expect(JSON.parse(sessionStorage.getItem("video-trails-corrections")!)[5]).toBeUndefined();
  });

  it("discards placements from a different video before they can be undone", () => {
    const state = createState();
    const stack = recordGuidedPlacement([], state, {
      sourceUrl: "video-a",
      frame: 5,
      propIndex: 0,
      tipIndex: 1,
      previousGuidedStepIdx: 1,
      previousFrame: 5,
    });
    state.correctEndpoint(5, earlier);
    expect(historyForSource(stack, "video-b")).toEqual([]);

    const undone = undoGuidedPlacement(stack, state, "video-b");
    expect(undone.stack).toEqual([]);
    expect(undone.entry).toBeNull();
    expect(state.corrections[5]).toEqual([earlier]);
  });
});
