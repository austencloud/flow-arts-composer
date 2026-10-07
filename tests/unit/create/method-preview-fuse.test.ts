/**
 * The Create front door's Fuse preview: a blue path and a red path, one hand
 * each, slide together and play once as one two-hand sequence. Each source
 * must land exactly on its fused cell, and the beats must fit in one turn.
 */
import { describe, expect, it } from "vitest";
import { METHOD_PREVIEW_TIMING } from "$lib/features/create/shared/state/method-preview-turns.svelte";
import { fuseLayout } from "$lib/features/create/shared/components/method-previews/method-preview-compositions";
import {
  DEMO_SEQUENCE,
  startPictograph,
} from "$lib/features/create/shared/components/method-previews/method-preview-demo";
import {
  FUSE_PREVIEW_TIMING,
  fuseFrames,
  fuseSources,
} from "$lib/features/create/shared/components/method-previews/method-preview-fuse";

const at = (x: number, y: number, size: number) => ({ x, y, size });

describe("Fuse preview frames", () => {
  it("plays the demo's first two steps through Fuse's motion seam", () => {
    const frames = fuseFrames(DEMO_SEQUENCE, 2);
    expect(frames.map((frame) => frame.step)).toEqual(
      DEMO_SEQUENCE.steps.slice(0, 2)
    );
    expect(frames[0]?.motionStartData).toBe(startPictograph(DEMO_SEQUENCE));
    expect(frames[1]?.motionStartData).toBe(DEMO_SEQUENCE.steps[0]);
    expect(frames.map((frame) => frame.motionProgress)).toEqual([0, 0]);
  });
});

describe("Fuse preview sources", () => {
  it("lands the blue and red half of each step on one fused cell", () => {
    expect(fuseSources(fuseLayout("strip", 146, 48)!)).toEqual([
      {
        key: "left:0",
        hand: "left",
        step: 0,
        rect: at(0, 7, 34),
        slide: "translate(23px, -7px) scale(1.4118)",
      },
      {
        key: "left:1",
        hand: "left",
        step: 1,
        rect: at(37, 7, 34),
        slide: "translate(37px, -7px) scale(1.4118)",
      },
      {
        key: "right:0",
        hand: "right",
        step: 0,
        rect: at(74, 7, 34),
        slide: "translate(-51px, -7px) scale(1.4118)",
      },
      {
        key: "right:1",
        hand: "right",
        step: 1,
        rect: at(111, 7, 34),
        slide: "translate(-37px, -7px) scale(1.4118)",
      },
    ]);
  });

  it("merges a square's blue row and red row into the fused row", () => {
    expect(
      fuseSources(fuseLayout("square", 144, 144)!).map((source) => source.slide)
    ).toEqual([
      "translate(-25px, 38px) scale(1.5814)",
      "translate(0px, 38px) scale(1.5814)",
      "translate(-25px, -63px) scale(1.5814)",
      "translate(0px, -63px) scale(1.5814)",
    ]);
  });
});

describe("Fuse preview beats", () => {
  it("plays both fused steps with half a second of the turn to spare", () => {
    const timing = FUSE_PREVIEW_TIMING;
    const end =
      timing.clearMs +
      timing.sourcesInMs +
      timing.slideMs +
      timing.mergeMs +
      2 * timing.stepMs;
    expect(end).toBeLessThanOrEqual(METHOD_PREVIEW_TIMING.turnMs - 500);
  });
});
