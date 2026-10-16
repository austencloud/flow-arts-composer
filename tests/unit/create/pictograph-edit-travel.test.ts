import { afterEach, describe, expect, it, vi } from "vitest";
import { createStepData } from "#lib/shared/foundation/domain/factories/create-step-data.js";
import {
  GridLocation,
  GridMode,
} from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import { DefaultPropPositioner } from "#lib/shared/pictograph/prop/services/default-prop-positioner.js";
import { calculatePictographMotionPositions } from "#lib/shared/pictograph/prop/services/pictograph-motion-positioner.js";
import {
  HandSide,
  MotionType,
  Orientation,
  RotationDirection,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { createMotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
import {
  buildEditTravelStep,
  EDIT_TIMELINE,
  editGridTurn,
  editTimelineTotal,
  pictographGeometryKey,
  sampleEditTimeline,
  type PictographEdit,
} from "#lib/shared/pictograph/shared/services/pictograph-edit-travel.js";
import { createPictographEditMotion } from "#lib/shared/pictograph/shared/state/pictograph-edit-motion.svelte.js";

const CENTER = 475;

function still(
  hand: HandSide,
  location: GridLocation,
  orientation: Orientation = Orientation.IN
) {
  return createMotionData({
    hand,
    motionType: MotionType.STATIC,
    rotationDirection: RotationDirection.NO_ROTATION,
    startLocation: location,
    endLocation: location,
    startOrientation: orientation,
    endOrientation: orientation,
    turns: 0,
    propType: PropType.STAFF,
    isVisible: true,
  });
}

function drawing(
  left: GridLocation,
  right: GridLocation,
  gridMode: GridMode = GridMode.DIAMOND,
  orientations: [Orientation, Orientation] = [Orientation.IN, Orientation.IN]
): PictographData {
  return createStepData({
    id: "edited-step",
    letter: "A",
    stepNumber: 1,
    gridMode,
    motions: {
      left: still(HandSide.LEFT, left, orientations[0]),
      right: still(HandSide.RIGHT, right, orientations[1]),
    },
  });
}

/** Undecorated grid points, so the positioner's endpoint corrections are zero. */
function placements(data: PictographData) {
  const at = (location: GridLocation) => ({
    ...DefaultPropPositioner.calculatePosition(
      location,
      data.gridMode ?? GridMode.DIAMOND,
      false
    ),
    rotation: 0,
  });
  return {
    left: at(data.motions.left!.endLocation),
    right: at(data.motions.right!.endLocation),
  };
}

function travel(
  before: PictographData,
  after: PictographData,
  edit: PictographEdit
) {
  const step = buildEditTravelStep(before, after, edit);
  if (!step) throw new Error("expected a travel step");
  const startPlacements = placements(before);
  const endPlacements = placements(after);
  const at = (progress: number) =>
    calculatePictographMotionPositions({
      step,
      progress,
      gridMode: after.gridMode ?? GridMode.DIAMOND,
      leftPropType: PropType.STAFF,
      rightPropType: PropType.STAFF,
      startPlacements,
      endPlacements,
    });
  return { step, at, startPlacements, endPlacements };
}

const radius = (point: { x: number; y: number }) =>
  Math.hypot(point.x - CENTER, point.y - CENTER);

describe("buildEditTravelStep", () => {
  it("lands exactly on the old and new drawings at progress 0 and 1", () => {
    const before = drawing(GridLocation.NORTH, GridLocation.SOUTH);
    const after = drawing(
      GridLocation.NORTHEAST,
      GridLocation.SOUTHWEST,
      GridMode.BOX
    );
    const { at, startPlacements, endPlacements } = travel(before, after, {
      kind: "rotate",
      direction: "clockwise",
      steps: 1,
    });

    expect(at(0)).toEqual(startPlacements);
    expect(at(1)).toEqual(endPlacements);
  });

  it("carries a rotate around the circle in the rotation's direction", () => {
    const before = drawing(GridLocation.NORTH, GridLocation.SOUTH);
    const cw = travel(
      before,
      drawing(GridLocation.NORTHEAST, GridLocation.SOUTHWEST, GridMode.BOX),
      { kind: "rotate", direction: "clockwise", steps: 1 }
    );
    const ccw = travel(
      before,
      drawing(GridLocation.NORTHWEST, GridLocation.SOUTHEAST, GridMode.BOX),
      { kind: "rotate", direction: "counterclockwise", steps: 1 }
    );

    expect(cw.step.motions.left?.motionType).toBe(MotionType.PRO);
    expect(cw.step.motions.left?.rotationDirection).toBe(
      RotationDirection.CLOCKWISE
    );
    expect(ccw.step.motions.left?.rotationDirection).toBe(
      RotationDirection.COUNTER_CLOCKWISE
    );

    const startRadius = radius(cw.startPlacements.left);
    const endRadius = radius(cw.endPlacements.left);
    for (const progress of [0.25, 0.5, 0.75]) {
      const point = cw.at(progress).left!;
      expect(radius(point)).toBeGreaterThan(
        Math.min(startRadius, endRadius) - 2
      );
      expect(radius(point)).toBeLessThan(Math.max(startRadius, endRadius) + 2);
    }
    // North is the top: clockwise heads right, counterclockwise left.
    expect(cw.at(0.5).left!.x).toBeGreaterThan(CENTER);
    expect(ccw.at(0.5).left!.x).toBeLessThan(CENTER);
  });

  it("sends a mirror straight across the axis", () => {
    const before = drawing(GridLocation.EAST, GridLocation.NORTH);
    const after = drawing(GridLocation.WEST, GridLocation.NORTH);
    const { step, at, startPlacements } = travel(before, after, {
      kind: "reflect",
      axis: "vertical",
    });

    expect(step.motions.left?.motionType).toBe(MotionType.DASH);
    expect(step.motions.left?.pathShape).toBe("linear");
    const mid = at(0.5).left!;
    expect(mid.y).toBeCloseTo(startPlacements.left.y, 0);
    expect(Math.abs(mid.x - CENTER)).toBeLessThan(2);
    // The hand that does not cross the axis spins in place.
    expect(step.motions.right?.motionType).toBe(MotionType.STATIC);
  });

  it("trades the two props' places on a swap", () => {
    const before = drawing(GridLocation.NORTH, GridLocation.EAST);
    const after = drawing(GridLocation.EAST, GridLocation.NORTH);
    const { step, at, endPlacements } = travel(before, after, {
      kind: "swap",
    });

    expect(step.motions.left?.motionType).toBe(MotionType.PRO);
    expect(step.motions.left?.rotationDirection).toBe(
      RotationDirection.CLOCKWISE
    );
    expect(step.motions.right?.rotationDirection).toBe(
      RotationDirection.COUNTER_CLOCKWISE
    );
    expect(at(1).left).toEqual(endPlacements.left);
    expect(at(1).right).toEqual(endPlacements.right);
  });

  it("spins a prop in place when only its orientation changes", () => {
    const before = drawing(GridLocation.NORTH, GridLocation.SOUTH);
    const after = drawing(
      GridLocation.NORTH,
      GridLocation.SOUTH,
      GridMode.DIAMOND,
      [Orientation.OUT, Orientation.IN]
    );
    const step = buildEditTravelStep(before, after, { kind: "spin" });

    expect(step?.motions.left?.motionType).toBe(MotionType.STATIC);
    expect(step?.motions.left?.startOrientation).toBe(Orientation.IN);
    expect(step?.motions.left?.endOrientation).toBe(Orientation.OUT);
  });

  it("returns null when no prop changes place or heading", () => {
    const before = drawing(GridLocation.NORTH, GridLocation.SOUTH);
    const after = {
      ...drawing(GridLocation.NORTH, GridLocation.SOUTH),
      letter: "B",
    };
    expect(buildEditTravelStep(before, after, { kind: "travel" })).toBeNull();
    expect(pictographGeometryKey(before)).toBe(pictographGeometryKey(after));
  });
});

describe("editGridTurn", () => {
  it("turns the grid 45° per step in the rotation's direction", () => {
    const diamond = { gridMode: GridMode.DIAMOND };
    const box = { gridMode: GridMode.BOX };
    expect(
      editGridTurn(diamond, box, {
        kind: "rotate",
        direction: "clockwise",
        steps: 1,
      })
    ).toEqual({ from: 0, to: 45 });
    expect(
      editGridTurn(box, diamond, {
        kind: "rotate",
        direction: "counterclockwise",
        steps: 1,
      })
    ).toEqual({ from: 45, to: 0 });
    expect(editGridTurn(diamond, box, { kind: "swap" })).toBeNull();
    expect(
      editGridTurn(diamond, diamond, {
        kind: "rotate",
        direction: "clockwise",
        steps: 2,
      })
    ).toBeNull();
  });
});

describe("sampleEditTimeline", () => {
  it("fades old arrows, travels, then brings new arrows in", () => {
    const out = EDIT_TIMELINE.arrowsOutMs;
    const travelEnd = out + EDIT_TIMELINE.travelMs;

    expect(sampleEditTimeline(0, EDIT_TIMELINE)).toMatchObject({
      holdingOld: true,
      oldArrowOpacity: 1,
      progress: 0,
    });
    const travelling = sampleEditTimeline(
      out + EDIT_TIMELINE.travelMs / 2,
      EDIT_TIMELINE
    );
    expect(travelling.holdingOld).toBe(false);
    expect(travelling.progress).toBeCloseTo(0.5, 5);
    expect(travelling.newArrowOpacity).toBe(0);
    const landed = sampleEditTimeline(
      editTimelineTotal(EDIT_TIMELINE),
      EDIT_TIMELINE
    );
    expect(landed.progress).toBe(1);
    expect(landed.newArrowOpacity).toBe(1);
    expect(sampleEditTimeline(travelEnd, EDIT_TIMELINE).progress).toBe(1);
  });
});

describe("pictograph edit motion clock", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function fakeClock() {
    vi.useFakeTimers({
      toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"],
    });
  }

  it("shares one run between every drawing an announced edit changes", () => {
    fakeClock();
    const clock = createPictographEditMotion();
    clock.announce({ kind: "rotate", direction: "clockwise", steps: 1 });
    const cell = clock.join({ unannounced: true });
    const editor = clock.join({ unannounced: false });

    expect(cell?.edit.kind).toBe("rotate");
    expect(editor?.epoch).toBe(cell?.epoch);

    // Waits for both drawings, then plays.
    clock.ready(cell!.token);
    vi.advanceTimersByTime(50);
    expect(clock.frameFor(cell!.epoch)?.holdingOld).toBe(true);
    clock.ready(editor!.token);
    vi.advanceTimersByTime(
      EDIT_TIMELINE.arrowsOutMs + EDIT_TIMELINE.travelMs / 2
    );
    expect(clock.frameFor(cell!.epoch)?.holdingOld).toBe(false);

    vi.advanceTimersByTime(editTimelineTotal(EDIT_TIMELINE));
    expect(clock.frameFor(cell!.epoch)).toBeNull();
  });

  it("starts after the cap even if a drawing never reports ready", () => {
    fakeClock();
    const clock = createPictographEditMotion();
    clock.announce({ kind: "swap" });
    const ticket = clock.join({ unannounced: false })!;
    vi.advanceTimersByTime(200 + EDIT_TIMELINE.arrowsOutMs + 40);
    expect(clock.frameFor(ticket.epoch)?.holdingOld).toBe(false);
  });

  it("leaves an unannounced change to cells, and snaps after a generation", () => {
    fakeClock();
    const clock = createPictographEditMotion();
    expect(clock.join({ unannounced: false })).toBeNull();
    expect(clock.join({ unannounced: true })?.edit.kind).toBe("travel");

    clock.snapNext();
    vi.advanceTimersByTime(editTimelineTotal(EDIT_TIMELINE) + 200);
    expect(clock.join({ unannounced: true })).toBeNull();
  });

  it("supersedes a run when a newer edit lands", () => {
    fakeClock();
    const clock = createPictographEditMotion();
    clock.announce({ kind: "reflect", axis: "vertical" });
    const first = clock.join({ unannounced: false })!;
    clock.announce({ kind: "reflect", axis: "horizontal" });
    const second = clock.join({ unannounced: false })!;

    expect(second.epoch).not.toBe(first.epoch);
    expect(clock.frameFor(first.epoch)).toBeNull();
    expect(clock.frameFor(second.epoch)).not.toBeNull();
  });

  it("snaps under reduced motion", () => {
    vi.stubGlobal("window", {
      matchMedia: (query: string) => ({ matches: query.includes("reduce") }),
    });
    const clock = createPictographEditMotion();
    clock.announce({ kind: "rotate", direction: "clockwise", steps: 1 });
    expect(clock.join({ unannounced: true })).toBeNull();
  });
});
