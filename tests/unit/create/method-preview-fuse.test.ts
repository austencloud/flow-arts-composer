/**
 * The Create front door's Fuse preview: a blue path and a red path, one hand
 * each, slide together and play once as one two-hand sequence. Each source
 * must land exactly on its fused cell, and the beats must fit in one turn.
 */
import { describe, expect, it } from "vitest";
import { METHOD_PREVIEW_TIMING } from "#lib/features/create/shared/state/method-preview-turns.svelte.js";
import { fuseLayout } from "#lib/features/create/shared/components/method-previews/method-preview-compositions.js";
import {
  DEMO_SEQUENCE,
  DEMO_STEP_START,
  startPictograph,
} from "#lib/features/create/shared/components/method-previews/method-preview-demo.js";
import {
  FUSE_PREVIEW_DRAW_WAIT_MS,
  FUSE_PREVIEW_STEPS,
  FUSE_PREVIEW_TIMING,
  fuseFrames,
  fusePreviewFrames,
  fuseSources,
} from "#lib/features/create/shared/components/method-previews/method-preview-fuse.js";

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
    expect(frames.map((frame) => frame.stepIndex)).toEqual([0, 1]);
  });

  it("starts from a later step, leaving from the one before it", () => {
    const frames = fuseFrames(DEMO_SEQUENCE, 2, 3);
    expect(frames.map((frame) => frame.stepIndex)).toEqual([3, 4]);
    expect(frames.map((frame) => frame.step)).toEqual(
      DEMO_SEQUENCE.steps.slice(3, 5)
    );
    expect(frames[0]?.motionStartData).toBe(DEMO_SEQUENCE.steps[2]);
    expect(frames[1]?.motionStartData).toBe(DEMO_SEQUENCE.steps[3]);
    expect(frames.map((frame) => frame.motionProgress)).toEqual([0, 0]);
  });

  it("shows any pair's steps from Fuse's place in the demo", () => {
    expect(fusePreviewFrames(DEMO_SEQUENCE)).toEqual(
      fuseFrames(DEMO_SEQUENCE, FUSE_PREVIEW_STEPS, DEMO_STEP_START.fuse)
    );
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
        onTop: false,
      },
      {
        key: "left:1",
        hand: "left",
        step: 1,
        rect: at(37, 7, 34),
        slide: "translate(37px, -7px) scale(1.4118)",
        onTop: false,
      },
      {
        key: "right:0",
        hand: "right",
        step: 0,
        rect: at(74, 7, 34),
        slide: "translate(-51px, -7px) scale(1.4118)",
        onTop: true,
      },
      {
        key: "right:1",
        hand: "right",
        step: 1,
        rect: at(111, 7, 34),
        slide: "translate(-37px, -7px) scale(1.4118)",
        onTop: true,
      },
    ]);
  });

  it("floats exactly one half per fused step, the one drawn later", () => {
    for (const [shape, width, height] of [
      ["strip", 146, 48],
      ["square", 144, 144],
    ] as const) {
      const sources = fuseSources(fuseLayout(shape, width, height)!);
      for (const step of [0, 1]) {
        const halves = sources.filter((source) => source.step === step);
        expect(halves).toHaveLength(2);
        expect(halves.filter((half) => half.onTop)).toEqual([halves[1]]);
      }
    }
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

describe("Fuse preview slides", () => {
  const SLIDE = /^translate\((-?[\d.]+)px, (-?[\d.]+)px\) scale\(([\d.]+)\)$/;

  // The hard-coded strings above copy the arithmetic, so this checks what a
  // slide must do: carry each source's cell onto its fused cell.
  it.each([
    ["strip", 146, 48],
    ["strip", 308, 96],
    ["square", 144, 144],
    ["square", 200, 200],
  ] as const)(
    "carries every %s %ix%i source onto its fused cell",
    (shape, width, height) => {
      const layout = fuseLayout(shape, width, height)!;
      const sources = fuseSources(layout);
      expect(sources).toHaveLength(4);
      for (const source of sources) {
        const target = layout.combined[source.step]!;
        const match = SLIDE.exec(source.slide);
        expect(match, `${source.key} slide ${source.slide}`).not.toBeNull();
        const [tx, ty, scale] = match!.slice(1).map(Number) as [
          number,
          number,
          number,
        ];
        expect(source.rect.x + tx, `${source.key} x`).toBeCloseTo(target.x, 5);
        expect(source.rect.y + ty, `${source.key} y`).toBeCloseTo(target.y, 5);
        expect(
          Math.abs(source.rect.size * scale - target.size),
          `${source.key} size`
        ).toBeLessThanOrEqual(0.5);
      }
    }
  );
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

  it("pops a new path in within the sources' fade", () => {
    const timing = FUSE_PREVIEW_TIMING;
    expect(timing.newHandMs).toBeGreaterThan(0);
    expect(timing.newHandMs).toBeLessThan(timing.sourcesInMs);
  });

  it("still ends within the turn after waiting on a slow draw", () => {
    const timing = FUSE_PREVIEW_TIMING;
    const end =
      FUSE_PREVIEW_DRAW_WAIT_MS +
      timing.clearMs +
      timing.sourcesInMs +
      timing.slideMs +
      timing.mergeMs +
      FUSE_PREVIEW_STEPS * timing.stepMs;
    expect(end).toBeLessThan(METHOD_PREVIEW_TIMING.turnMs);
  });
});
