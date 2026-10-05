import { describe, expect, it, vi } from "vitest";
import { PictographPreparer } from "$lib/shared/pictograph/shared/services/pictograph-preparer";
import {
  createMotionData,
  type MotionData,
} from "$lib/shared/pictograph/shared/domain/models/motion-data";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import {
  HandSide,
  MotionType,
  Orientation,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { DIAMOND_HAND_POINTS } from "$lib/shared/render/core/constants/grid-coordinates";

const STAFF_NUDGE = 950 / 45;

function staticMotion(hand: HandSide, location: GridLocation) {
  return createMotionData({
    motionType: MotionType.STATIC,
    rotationDirection: RotationDirection.NO_ROTATION,
    startLocation: location,
    endLocation: location,
    startOrientation: Orientation.IN,
    endOrientation: Orientation.IN,
    turns: 0,
    hand,
  });
}

function createPreparer() {
  const arrowCalls: { motions: string[]; soloMode?: boolean }[] = [];
  const placementGridModes: (string | undefined)[] = [];
  const arrowManager = {
    coordinateArrowLifecycle: vi.fn(
      async (pictograph: PictographData, options: { soloMode?: boolean }) => {
        const keys = Object.keys(pictograph.motions).filter(
          (key) => pictograph.motions[key as HandSide]
        );
        arrowCalls.push({ motions: keys, soloMode: options.soloMode });
        const entries = (value: unknown) =>
          Object.fromEntries(keys.map((key) => [key, value]));
        return {
          positions: entries({ x: 500, y: 450, rotation: 0 }),
          assets: entries({ imageSrc: "<path/>", viewBox: {}, center: {} }),
          mirroring: entries(false),
        };
      }
    ),
  };
  const propLoader = {
    loadPropSvg: vi.fn(async () => ({
      svgData: {
        svgContent: "<path/>",
        viewBox: { width: 252.8, height: 77.8 },
        center: { x: 126.4, y: 38.9 },
      },
    })),
  };
  // Each hand alone on its own grid: its hand point, staff lying flat.
  const propPlacer = {
    calculatePlacement: vi.fn(
      async (pictograph: PictographData, motion: MotionData) => {
        placementGridModes.push(pictograph.gridMode);
        const point =
          DIAMOND_HAND_POINTS[
            motion.endLocation as keyof typeof DIAMOND_HAND_POINTS
          ]!;
        return { positionX: point.x, positionY: point.y, rotationAngle: 0 };
      }
    ),
  };
  const preparer = new PictographPreparer(
    arrowManager as never,
    propLoader as never,
    propPlacer as never
  );
  return { preparer, arrowCalls, placementGridModes };
}

const facingPair: PictographData = {
  id: "facing-pair",
  motions: {
    left: staticMotion(HandSide.LEFT, GridLocation.EAST),
    right: staticMotion(HandSide.RIGHT, GridLocation.WEST),
  },
};

describe("PictographPreparer joined grids", () => {
  it("prepares each hand alone on its own grid and moves it by that grid's offset", async () => {
    const { preparer, arrowCalls, placementGridModes } = createPreparer();
    const prepared = await preparer.prepareSingle({
      ...facingPair,
      conjoined: { toward: "e", steps: 2 },
    });
    const data = prepared._prepared!;

    expect(data.join).toEqual({ toward: "e", steps: 2 });
    expect(arrowCalls).toHaveLength(2);
    expect(arrowCalls.every((call) => call.soloMode)).toBe(true);
    expect(arrowCalls.map((call) => call.motions).sort()).toEqual([
      ["left"],
      ["right"],
    ]);
    expect(placementGridModes).toEqual(["diamond", "diamond"]);

    // Arrows move with their grid, 143.1 each way.
    expect(data.arrowPositions.left!.x).toBeCloseTo(500 - 143.1, 6);
    expect(data.arrowPositions.right!.x).toBeCloseTo(500 + 143.1, 6);

    // Both hands meet at the scene center, so the staffs, lying along one
    // line, part by a beta offset each: red up, blue down.
    expect(data.propPositions.left!.x).toBeCloseTo(475, 6);
    expect(data.propPositions.right!.x).toBeCloseTo(475, 6);
    expect(data.propPositions.left!.y).toBeCloseTo(475 + STAFF_NUDGE, 6);
    expect(data.propPositions.right!.y).toBeCloseTo(475 - STAFF_NUDGE, 6);
  });

  it("never shares a cache entry between one grid and joined grids", async () => {
    const { preparer } = createPreparer();
    const single = await preparer.prepareSingle(facingPair);
    const joined = await preparer.prepareSingle({
      ...facingPair,
      conjoined: { toward: "e", steps: 2 },
    });
    const singleAgain = await preparer.prepareSingle({
      ...facingPair,
      conjoined: null,
    });

    expect(single._prepared!.join).toBeUndefined();
    expect(joined._prepared!.join).toBeDefined();
    expect(singleAgain._prepared).toBe(single._prepared);
    expect(single._prepared!.propPositions.left!.x).toBeCloseTo(618.1, 6);
  });
});
