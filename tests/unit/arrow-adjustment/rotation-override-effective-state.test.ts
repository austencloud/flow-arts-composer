import { beforeEach, describe, expect, it } from "vitest";
import { ArrowRotationCalculator } from "$lib/shared/pictograph/arrow/positioning/calculation/services/arrow-rotation-calculator";
import { rotationAngleOverrideKeyGenerator } from "$lib/shared/pictograph/arrow/positioning/key-generation/services/rotation-angle-override-key-generator";
import { RotationOverrideManager } from "$lib/shared/pictograph/arrow/positioning/placement/services/rotation-override-manager";
import { SpecialPlacementDataProvider } from "$lib/shared/pictograph/arrow/positioning/placement/services/special-placement-data-provider";
import { SpecialPlacementLookup } from "$lib/shared/pictograph/arrow/positioning/placement/services/special-placement-lookup";
import { SpecialPlacer } from "$lib/shared/pictograph/arrow/positioning/placement/services/special-placer";
import { TurnsTupleGenerator } from "$lib/shared/pictograph/arrow/positioning/placement/services/turns-tuple-generator";
import {
  GridLocation,
  GridMode,
  GridPlacement,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import { Letter } from "$lib/shared/foundation/domain/models/letter";
import {
  HandSide,
  MotionType,
  Orientation,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import { SimpleJsonCache } from "$lib/shared/pictograph/shared/services/simple-json-cache";

const THETA_DASH_PLACEMENTS = {
  [Letter.THETA_DASH]: {
    "(s, 3, 3)": {
      dash_rot_angle_override: true,
    },
  },
};

class ThetaDashPlacementCache extends SimpleJsonCache {
  override async get<T = unknown>(path: string): Promise<T> {
    if (path.endsWith("placement_manifest.json")) {
      return { from_layer2: [Letter.THETA_DASH] } as T;
    }
    if (path.includes("/from_layer2/")) {
      return THETA_DASH_PLACEMENTS as T;
    }
    throw new Error(`Unexpected fixture path: ${path}`);
  }
}

function createThetaDashPictograph(): PictographData {
  return {
    id: "56def412-1c85-4baa-b9c8-3247a93e1f60",
    letter: Letter.THETA_DASH,
    gridMode: GridMode.DIAMOND,
    startPlacement: GridPlacement.ALPHA5,
    endPlacement: GridPlacement.GAMMA7,
    motions: {
      left: createMotionData({
        hand: HandSide.LEFT,
        motionType: MotionType.DASH,
        turns: 3,
        rotationDirection: RotationDirection.CLOCKWISE,
        startLocation: GridLocation.NORTH,
        endLocation: GridLocation.SOUTH,
        arrowLocation: GridLocation.EAST,
        startOrientation: Orientation.COUNTER,
        endOrientation: Orientation.COUNTER,
        propType: PropType.CLUB,
      }),
      right: createMotionData({
        hand: HandSide.RIGHT,
        motionType: MotionType.PRO,
        turns: 3,
        rotationDirection: RotationDirection.CLOCKWISE,
        startLocation: GridLocation.SOUTH,
        endLocation: GridLocation.WEST,
        arrowLocation: GridLocation.SOUTHWEST,
        startOrientation: Orientation.OUT,
        endOrientation: Orientation.IN,
        propType: PropType.CLUB,
      }),
    },
  };
}

describe("rotation override effective state", () => {
  beforeEach(() => {
    localStorage.removeItem("tka_rotation_overrides");
    localStorage.removeItem("tka_rotation_overrides_v2");
  });

  it("inherits Θ- (s, 3, 3) from layer2 and lets the toggle turn it off and on", async () => {
    const pictograph = createThetaDashPictograph();
    const leftMotion = pictograph.motions.left!;
    const tupleGenerator = new TurnsTupleGenerator();
    const specialPlacement = new SpecialPlacer(
      new SpecialPlacementDataProvider(new ThetaDashPlacementCache()),
      tupleGenerator,
      new SpecialPlacementLookup()
    );
    const manager = new RotationOverrideManager(
      tupleGenerator,
      rotationAngleOverrideKeyGenerator,
      specialPlacement
    );
    const calculator = new ArrowRotationCalculator(
      specialPlacement,
      rotationAngleOverrideKeyGenerator
    );

    expect(tupleGenerator.generateTurnsTuple(pictograph)).toBe("(s, 3, 3)");
    await expect(
      manager.hasRotationOverride(leftMotion, pictograph)
    ).resolves.toBe(true);
    await expect(
      calculator.calculateRotation(leftMotion, GridLocation.EAST, pictograph)
    ).resolves.toBe(0);

    await expect(
      manager.toggleRotationOverride(leftMotion, pictograph)
    ).resolves.toBe(false);
    await expect(
      calculator.calculateRotation(leftMotion, GridLocation.EAST, pictograph)
    ).resolves.toBe(90);

    await expect(
      manager.toggleRotationOverride(leftMotion, pictograph)
    ).resolves.toBe(true);
    await expect(
      calculator.calculateRotation(leftMotion, GridLocation.EAST, pictograph)
    ).resolves.toBe(0);
  });

  it("propagates a manifest failure and leaves the request retryable", async () => {
    let attempts = 0;
    const provider = new SpecialPlacementDataProvider({
      get: async () => {
        attempts++;
        throw new Error("fixture network failure");
      },
    } as never);

    await expect(
      provider.getLetterData(GridMode.DIAMOND, "from_layer1", "A")
    ).rejects.toThrow("fixture network failure");
    await expect(
      provider.getLetterData(GridMode.BOX, "from_layer1", "A")
    ).rejects.toThrow("fixture network failure");
    expect(attempts).toBe(2);
  });
});
