import { describe, expect, it } from "vitest";
import { Plane } from "@austencloud/scene-3d";
import type { GridJoinSpec } from "@tka/render-core";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import { createMotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import {
  HandSide,
  MotionType,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import {
  GRID_RADIUS_3D,
  planeAngleToWorldPosition,
} from "#lib/shared/3d/domain/constants/plane-transforms.js";
import {
  fixedHandDistance,
  type HandDistance,
} from "#lib/shared/3d/domain/performer-hand-distance.js";
import {
  gridJoinScale3D,
  gridJoinOffset3D,
  resolveGridJoin3D,
  scalePerformerHandDistance3D,
} from "#lib/shared/3d/services/grid-join-3d.js";
import { calculatePropState } from "#lib/shared/3d/services/prop-state-interpolator.js";
import {
  getStartPlacementConfigs,
  sequenceToMotionConfigs,
} from "#lib/shared/3d/services/sequence-converter.js";
import {
  createCharacterInstanceState,
  makeStandaloneDeps,
} from "#lib/shared/3d/state/character-instance-state.svelte.js";

function sequence(join?: unknown, gridMode = "diamond"): SequenceData {
  const beat = (stepNumber: number, motionType: MotionType) =>
    ({
      stepNumber,
      gridMode,
      motions: {
        [HandSide.LEFT]: createMotionData({
          hand: HandSide.LEFT,
          motionType,
          startLocation: GridLocation.NORTH,
          endLocation: GridLocation.SOUTH,
        }),
        [HandSide.RIGHT]: createMotionData({
          hand: HandSide.RIGHT,
          motionType,
          startLocation: GridLocation.NORTH,
          endLocation: GridLocation.SOUTH,
        }),
      },
    }) as unknown as StepData;
  return {
    id: "joined-test",
    steps: [beat(1, MotionType.PRO), beat(2, MotionType.DASH)],
    ...(join && { conjoined: join }),
  } as SequenceData;
}

function expectTranslated(
  joined: ReturnType<typeof calculatePropState>,
  plain: ReturnType<typeof calculatePropState>,
  offset: ReturnType<typeof gridJoinOffset3D>
) {
  expect(
    joined.worldPosition.clone().sub(plain.worldPosition).distanceTo(offset)
  ).toBeLessThan(1e-10);
  expect(joined.worldRotation.equals(plain.worldRotation)).toBe(true);
  expect(joined.centerPathAngle).toBe(plain.centerPathAngle);
}

describe("joined-grid 3D motion", () => {
  it("aligns the join with the drawn grid and rejects invalid joins", () => {
    expect(
      resolveGridJoin3D(sequence({ toward: "ne", steps: 1 }, "diamond"))
    ).toEqual({ toward: "e", steps: 1 });
    expect(
      resolveGridJoin3D(sequence({ toward: "e", steps: 2 }, "box"))
    ).toEqual({ toward: "se", steps: 2 });
    expect(resolveGridJoin3D(sequence({ toward: "e", steps: 3 }))).toBeNull();
    expect(resolveGridJoin3D(sequence())).toBeNull();
  });

  it("places blue and red on opposite grids for one and two steps on each plane", () => {
    for (const steps of [1, 2] as const) {
      for (const plane of [Plane.WALL, Plane.WHEEL, Plane.FLOOR]) {
        const join: GridJoinSpec = { toward: "e", steps };
        const left = gridJoinOffset3D(join, "left", plane);
        const right = gridJoinOffset3D(join, "right", plane);
        const east = planeAngleToWorldPosition(
          plane,
          0,
          GRID_RADIUS_3D * steps
        );
        expect(right.clone().sub(left).distanceTo(east)).toBeLessThan(1e-10);
        expect(left.clone().add(right).length()).toBeLessThan(1e-10);
      }
    }
  });

  it("translates the start pose and both beats at zero, middle, and end without changing spin", () => {
    const joined = sequence({ toward: "e", steps: 2 }, "box");
    const plain = sequence(undefined, "box");
    const joinedFrames = [
      getStartPlacementConfigs(joined)!,
      ...sequenceToMotionConfigs(joined),
    ];
    const plainFrames = [
      getStartPlacementConfigs(plain)!,
      ...sequenceToMotionConfigs(plain),
    ];
    expect(joinedFrames[0]?.left?.startLocation).toBe(GridLocation.NORTH);
    joinedFrames.forEach((frame, index) => {
      for (const hand of ["left", "right"] as const) {
        expect(frame[hand]?.gridJoin).toEqual({ toward: "se", steps: 2 });
        for (const progress of [0, 0.5, 1]) {
          expectTranslated(
            calculatePropState(frame[hand]!, progress),
            calculatePropState(plainFrames[index]![hand]!, progress),
            gridJoinOffset3D(frame[hand]!.gridJoin, hand, Plane.WALL)
          );
        }
      }
    });
  });

  it("uses each hand's inward directional reach for its own grid", () => {
    const join: GridJoinSpec = { toward: "e", steps: 2 };
    const directional: HandDistance = {
      toward: (_plane, angle) => (Math.cos(angle) > 0 ? 0.4 : 0.7),
      max: 0.7,
    };
    expect(
      gridJoinOffset3D(join, "left", Plane.WALL, directional).x
    ).toBeCloseTo(0.4);
    expect(
      gridJoinOffset3D(join, "right", Plane.WALL, directional).x
    ).toBeCloseTo(-0.7);
    expect(
      gridJoinOffset3D(join, "left", Plane.WALL, fixedHandDistance(0.5)).x
    ).toBeCloseTo(0.5);
    expect(gridJoinOffset3D(null, "left", Plane.WALL).length()).toBe(0);
  });

  it("recomputes the join in a changed motion plane", () => {
    const joined = sequence({ toward: "n", steps: 1 });
    const plain = sequence();
    for (const plane of [Plane.WHEEL, Plane.FLOOR]) {
      const joinedStep = sequenceToMotionConfigs(joined, plane)[0]!;
      const plainStep = sequenceToMotionConfigs(plain, plane)[0]!;
      for (const hand of ["left", "right"] as const) {
        for (const progress of [0, 0.5, 1]) {
          expectTranslated(
            calculatePropState(joinedStep[hand]!, progress),
            calculatePropState(plainStep[hand]!, progress),
            gridJoinOffset3D(joinedStep[hand]!.gridJoin, hand, plane)
          );
        }
      }
    }
  });

  it("preserves the joined offset when the performer samples arbitrary score times", () => {
    const joined = createCharacterInstanceState(
      { id: "joined", positionX: 0, persistent: false },
      makeStandaloneDeps()
    );
    const plain = createCharacterInstanceState(
      { id: "plain", positionX: 0, persistent: false },
      makeStandaloneDeps()
    );
    joined.loadSequence(sequence({ toward: "e", steps: 1 }));
    plain.loadSequence(sequence());
    const join = resolveGridJoin3D(sequence({ toward: "e", steps: 1 }))!;
    const scale = gridJoinScale3D(join);
    for (const scoreTime of [0, 0.25, 0.5, 0.999, 1, 1.5, 1.999]) {
      const joinedProps = joined.propStatesAtScoreTime(scoreTime);
      const plainProps = plain.propStatesAtScoreTime(scoreTime);
      for (const hand of ["left", "right"] as const) {
        const expected = plainProps[hand]!.worldPosition
          .clone()
          .multiplyScalar(scale)
          .add(gridJoinOffset3D(join, hand, Plane.WALL, joined.handDistance[hand]));
        expect(joinedProps[hand]!.worldPosition.distanceTo(expected)).toBeLessThan(1e-10);
        expect(joinedProps[hand]!.worldRotation.equals(plainProps[hand]!.worldRotation)).toBe(true);
      }
    }
  });

  it("fits one and two joined grids inside the original hand reach", () => {
    const original = {
      left: { toward: (_plane: Plane, angle: number) => 0.4 + 0.1 * Math.cos(angle), max: 0.5 },
      right: fixedHandDistance(0.6),
    };
    for (const steps of [1, 2] as const) {
      const join: GridJoinSpec = { toward: "e", steps };
      const scaled = scalePerformerHandDistance3D(original, gridJoinScale3D(join));
      for (const hand of ["left", "right"] as const) {
        const center = gridJoinOffset3D(join, hand, Plane.FLOOR, scaled[hand]);
        expect(center.length() + scaled[hand].max).toBeLessThanOrEqual(original[hand].max + 1e-10);
      }
    }
    expect(gridJoinScale3D(null)).toBe(1);
    expect(scalePerformerHandDistance3D(original, 1)).toBe(original);
  });

  it("restores original sizes after leaving a joined sequence without changing preferences", () => {
    const performer = createCharacterInstanceState(
      { id: "join-size", positionX: 0, persistent: false },
      makeStandaloneDeps()
    );
    performer.setStaffLengthCm(81);
    performer.setHandDistance({ left: fixedHandDistance(0.48), right: fixedHandDistance(0.6) });
    performer.loadSequence(sequence({ toward: "e", steps: 1 }));
    expect(performer.gridScale).toBeCloseTo(2 / 3);
    expect(performer.staffLength).toBeCloseTo(0.54);
    expect(performer.handDistance.left.max).toBeCloseTo(0.32);
    expect(performer.handDistance.right.max).toBeCloseTo(0.4);
    expect(performer.settings.staffLengthCm).toBe(81);
    performer.loadSequence(sequence({ toward: "e", steps: 2 }));
    expect(performer.staffLength).toBeCloseTo(0.405);
    const joinedSnapshot = performer.captureEditingSnapshot();
    performer.loadSequence(sequence());
    expect(performer.gridScale).toBe(1);
    expect(performer.staffLength).toBeCloseTo(0.81);
    expect(performer.handDistance.left.max).toBeCloseTo(0.48);
    expect(performer.handDistance.right.max).toBeCloseTo(0.6);
    expect(performer.settings.staffLengthCm).toBe(81);
    performer.restoreEditingSnapshot(joinedSnapshot);
    expect(performer.gridScale).toBe(0.5);
    expect(performer.staffLength).toBeCloseTo(0.405);
    expect(performer.handDistance.left.max).toBeCloseTo(0.24);
    expect(performer.handDistance.right.max).toBeCloseTo(0.3);
    expect(performer.settings.staffLengthCm).toBe(81);
    performer.clearSequence();
    expect(performer.gridScale).toBe(1);
    expect(performer.staffLength).toBeCloseTo(0.81);
    expect(performer.handDistance.left.max).toBeCloseTo(0.48);
    expect(performer.handDistance.right.max).toBeCloseTo(0.6);
  });
});
