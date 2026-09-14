/**
 * buildPlacementTransition shapes the in-place start-position move animation:
 * the moving prop gets a pro-with-zero-turns arc motion (forced "arc" path so
 * the global path-shape setting can't flatten it) and the partner stays a
 * static hold, so calculatePictographMotionPositions resolves its beta offset
 * via the prepared-endpoint correction lerp.
 */

import { describe, expect, it } from "vitest";
import {
  GridLocation,
  GridMode,
} from "../../src/lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  buildPlacementTransition,
  buildPlacementPictographData,
  buildPlacementTransformTransition,
} from "../../src/lib/shared/pictograph/grid/services/prop-placement-view-model";
import { calculatePictographMotionPositions } from "../../src/lib/shared/pictograph/prop/services/pictograph-motion-positioner";
import { PropType } from "../../src/lib/shared/pictograph/prop/domain/enums/prop-type";
import {
  HandSide,
  MotionType,
  Orientation,
  RotationDirection,
} from "../../src/lib/shared/pictograph/shared/domain/enums/pictograph-enums";

const baseInput = {
  gridMode: GridMode.DIAMOND,
  leftOrientation: Orientation.IN,
  rightOrientation: Orientation.IN,
  leftPropType: PropType.STAFF,
  rightPropType: PropType.STAFF,
  betaSwapped: false,
  previewPictographData: null,
};

describe("paired placement transforms", () => {
  const before = buildPlacementPictographData({
    ...baseInput,
    leftLocation: GridLocation.SOUTH,
    rightLocation: GridLocation.NORTH,
  });
  const after = buildPlacementPictographData({
    ...baseInput,
    leftLocation: GridLocation.NORTH,
    rightLocation: GridLocation.SOUTH,
  });
  const startPositions = {
    left: { x: 475, y: 625, rotation: 0 },
    right: { x: 475, y: 325, rotation: 0 },
  };
  const endPositions = {
    left: startPositions.right,
    right: startPositions.left,
  };
  const common = {
    gridMode: GridMode.DIAMOND,
    leftPropType: PropType.HAND,
    rightPropType: PropType.HAND,
    startPositions,
    endPositions,
  };

  it("reflects across an axis in straight lines, keeping hand symbols upright", () => {
    const { transitionStep } = buildPlacementTransformTransition(
      before,
      after,
      "linear"
    );
    const midpoint = calculatePictographMotionPositions({
      ...common,
      step: transitionStep,
      progress: 0.5,
    });
    for (const hand of [HandSide.LEFT, HandSide.RIGHT]) {
      expect(midpoint[hand]?.x).toBeCloseTo(475);
      expect(midpoint[hand]?.y).toBeCloseTo(475);
      expect(midpoint[hand]?.rotation).toBe(0);
    }
    expect(before.motions?.left?.motionType).toBe(MotionType.STATIC);
    expect(after.motions?.left?.motionType).toBe(MotionType.STATIC);
  });

  it("exchanges opposite hands on separate arcs and lands on exact static poses", () => {
    const { transitionStep } = buildPlacementTransformTransition(
      before,
      after,
      "arc"
    );
    const input = { ...common, step: transitionStep };
    const midpoint = calculatePictographMotionPositions({
      ...input,
      progress: 0.5,
    });
    expect(Math.abs(midpoint.left!.x - midpoint.right!.x)).toBeGreaterThan(200);
    expect(midpoint.left?.rotation).toBe(0);
    expect(midpoint.right?.rotation).toBe(0);
    expect(
      calculatePictographMotionPositions({ ...input, progress: 0 })
    ).toEqual(startPositions);
    expect(
      calculatePictographMotionPositions({ ...input, progress: 1 })
    ).toEqual(endPositions);
  });

  it("keeps beta overlap ordering in the final static data", () => {
    const beta = buildPlacementPictographData({
      ...baseInput,
      leftLocation: GridLocation.SOUTH,
      rightLocation: GridLocation.SOUTH,
    });
    const swapped = { ...beta, betaSwapped: true };
    const transition = buildPlacementTransformTransition(beta, swapped, "arc");
    expect(transition.startData.betaSwapped).toBe(false);
    expect(transition.transitionStep.betaSwapped).toBe(true);
    expect(transition.transitionStep.motions.left.motionType).toBe(
      MotionType.STATIC
    );
  });
});

describe("buildPlacementTransition", () => {
  it("gives the moving prop a pro-zero-turns arc and holds the partner static", () => {
    const { startData, transitionStep } = buildPlacementTransition({
      ...baseInput,
      movingColor: HandSide.LEFT,
      fromLocation: GridLocation.SOUTH,
      toLocation: GridLocation.WEST,
      direction: "clockwise",
      leftLocation: GridLocation.WEST,
      rightLocation: GridLocation.NORTH,
    });

    const moving = transitionStep.motions.left;
    expect(moving.motionType).toBe(MotionType.PRO);
    expect(moving.turns).toBe(0);
    expect(moving.rotationDirection).toBe(RotationDirection.CLOCKWISE);
    expect(moving.startLocation).toBe(GridLocation.SOUTH);
    expect(moving.endLocation).toBe(GridLocation.WEST);
    expect(moving.pathShape).toBe("arc");

    const partner = transitionStep.motions.right;
    expect(partner.motionType).toBe(MotionType.STATIC);
    expect(partner.startLocation).toBe(GridLocation.NORTH);
    expect(partner.endLocation).toBe(GridLocation.NORTH);

    // The start pose has the moving prop at its pre-move location.
    expect(startData.motions.left?.startLocation).toBe(GridLocation.SOUTH);
    expect(startData.motions.right?.startLocation).toBe(GridLocation.NORTH);

    // PictographContainer only computes motion overrides for StepData, which
    // it detects via the stepNumber field.
    expect("stepNumber" in transitionStep).toBe(true);
  });

  it("keeps the partner at the shared location when the move departs a beta", () => {
    const { startData, transitionStep } = buildPlacementTransition({
      ...baseInput,
      movingColor: HandSide.RIGHT,
      fromLocation: GridLocation.NORTH,
      toLocation: GridLocation.EAST,
      direction: "counterclockwise",
      leftLocation: GridLocation.NORTH,
      rightLocation: GridLocation.EAST,
    });

    expect(transitionStep.motions.right.motionType).toBe(MotionType.PRO);
    expect(transitionStep.motions.right.rotationDirection).toBe(
      RotationDirection.COUNTER_CLOCKWISE
    );
    expect(transitionStep.motions.left.startLocation).toBe(GridLocation.NORTH);

    // Both props share north at the start — the beta pose the partner
    // animates out of.
    expect(startData.motions.right?.startLocation).toBe(GridLocation.NORTH);
    expect(startData.motions.left?.startLocation).toBe(GridLocation.NORTH);
  });
});
