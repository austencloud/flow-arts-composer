/**
 * Motion cues (2026-11-12 Staff Motions review): the thumb ring and the ghost
 * copies, checked on the real orchestrator playing the Staff Motions cards'
 * own sequences.
 *
 * Grid facts the expectations come from (diamond_grid.svg, 950 units, so a
 * 950 px canvas draws one unit per pixel): the centre is (475, 475), hand
 * points sit 150 from it and outer points 300 from it, each outer point a
 * circle of radius 25. The ring is "at" a point when it is inside that circle.
 */
import { describe, expect, it } from "vitest";
import { SequenceAnimationOrchestrator } from "#lib/shared/animation-engine/services/sequence-animation-orchestrator.js";
import { AnimationStateManager } from "#lib/shared/animation-engine/services/animation-state-manager.js";
import { stripToSequence } from "#lib/shared/guide-topics/strip-to-sequence.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import { thumbRingCenter } from "#lib/shared/animation-engine/services/canvas2d/canvas-2d-motion-cue-renderer.js";
import {
  MOTION_CUE_GHOST_TIMES,
  motionCueMandalaOverride,
  motionCueProgressOnCanvas,
  motionCueProgress,
  motionCueStepAt,
  sampleMotionCueSides,
  visibleGhostIndexes,
} from "#lib/shared/animation-engine/domain/types/motion-cue-types.js";
import { STAFF_MOTION_SEQUENCE_ITEMS } from "../../src/routes/(public)/guide/level-1/_data/content/staff-motions.content";

const SIZE = 950;
const CENTRE = { x: 475, y: 475 };
const POINT_R = 25;
const OUTER_E = { x: 775, y: 475 };
const OUTER_N = { x: 475, y: 175 };
const TIMES = [0, 0.25, 0.5, 0.75, 1];

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

function thumbAt(row: keyof typeof STAFF_MOTION_SEQUENCE_ITEMS) {
  const orchestrator = new SequenceAnimationOrchestrator(
    new AnimationStateManager()
  );
  const sequence = stripToSequence(
    STAFF_MOTION_SEQUENCE_ITEMS[row] as unknown as StepData[],
    { word: row, name: row }
  );
  expect(orchestrator.initializeWithDomainData(sequence)).toBe(true);
  const steps = sequence.steps.length;
  return (t: number) =>
    thumbRingCenter(
      orchestrator.samplePropStateAt(motionCueStepAt(t, steps)).right,
      SIZE,
      PropType.STAFF
    );
}

describe("the thumb ring", () => {
  it("stays parked on the centre through a prospin", () => {
    const thumb = thumbAt("pro");
    for (const t of TIMES) expect(dist(thumb(t), CENTRE)).toBeLessThan(POINT_R);
  });

  it("slides straight from the centre to the outer point beyond E in an antispin", () => {
    const thumb = thumbAt("anti");
    expect(dist(thumb(0), CENTRE)).toBeLessThan(POINT_R);
    expect(dist(thumb(1), OUTER_E)).toBeLessThan(POINT_R);
    let lastX = -Infinity;
    for (const t of TIMES) {
      const p = thumb(t);
      // On the line from the centre out through E, and always moving out.
      expect(Math.abs(p.y - CENTRE.y)).toBeLessThan(POINT_R);
      expect(p.x).toBeGreaterThan(lastX);
      lastX = p.x;
    }
  });

  it("runs from the centre to beyond N in a dash", () => {
    const thumb = thumbAt("dash");
    expect(dist(thumb(0), CENTRE)).toBeLessThan(POINT_R);
    expect(dist(thumb(1), OUTER_N)).toBeLessThan(POINT_R);
    for (const t of TIMES)
      expect(Math.abs(thumb(t).x - CENTRE.x)).toBeLessThan(POINT_R);
  });
});

describe("the ghost copies", () => {
  it("are sampled at exactly 0, .25, .5 and .75 of the play", () => {
    expect(MOTION_CUE_GHOST_TIMES).toEqual([0, 0.25, 0.5, 0.75]);
    const asked: number[] = [];
    const pose = { centerPathAngle: 0, staffRotationAngle: 0 };
    const sides = sampleMotionCueSides(
      (step) => {
        asked.push(step);
        return { left: pose, right: pose };
      },
      1,
      { left: false, right: true }
    );
    expect(asked.slice(0, 4)).toEqual([1, 1.25, 1.5, 1.75]);
    expect(sides.right?.ghosts).toHaveLength(4);
    expect(sides.left).toBeNull();
  });

  it("each appear once the play passes its time and all stay at the end", () => {
    const shown = (step: number) =>
      visibleGhostIndexes(MOTION_CUE_GHOST_TIMES, motionCueProgress(step, 1, true));
    expect(shown(0.5)).toEqual([]); // start hold
    expect(shown(1.1)).toEqual([0]);
    expect(shown(1.3)).toEqual([0, 1]);
    expect(shown(1.6)).toEqual([0, 1, 2]);
    expect(shown(1.8)).toEqual([0, 1, 2, 3]);
    expect(shown(2.5)).toEqual([0, 1, 2, 3]); // end hold
  });

  it("clear on a replay and show whole before any play", () => {
    // A replay stops to step 0: nothing shows until the motion starts again.
    expect(visibleGhostIndexes(MOTION_CUE_GHOST_TIMES, motionCueProgress(0, 1, true))).toEqual([]);
    // Never played (or reduced motion): the resting picture has all four.
    expect(visibleGhostIndexes(MOTION_CUE_GHOST_TIMES, motionCueProgress(0, 1, false))).toEqual([0, 1, 2, 3]);
  });
});


// Fix pass 1: the mandala guide (visibility "mandala", on by default) drew
// both staff ends' whole paths on every inline player, cue cards included.
// A card that draws its own hand path turns it off; every other canvas keeps
// the visitor's setting.
describe("the mandala guide on a motion-cue card", () => {
  it("is turned off on a card that draws its own hand path", () => {
    expect(motionCueMandalaOverride({ handPath: true })).toBe(false);
  });
  it("follows the visitor's setting everywhere else", () => {
    expect(motionCueMandalaOverride(null)).toBeUndefined();
    expect(motionCueMandalaOverride(undefined)).toBeUndefined();
    expect(motionCueMandalaOverride({ handPath: false })).toBeUndefined();
  });
});

describe("the progress line on a motion-cue card", () => {
  it("lies on the canvas edge on a card that draws its own hand path", () => {
    expect(motionCueProgressOnCanvas({ handPath: true })).toBe(true);
  });
  it("keeps its own band on every other player", () => {
    expect(motionCueProgressOnCanvas(null)).toBe(false);
    expect(motionCueProgressOnCanvas(undefined)).toBe(false);
    expect(motionCueProgressOnCanvas({ handPath: false })).toBe(false);
  });
});
