import { readFile } from "node:fs/promises";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { ArrowRotationCalculator } from "#lib/shared/pictograph/arrow/positioning/calculation/services/arrow-rotation-calculator.js";
import { rotationAngleOverrideKeyGenerator } from "#lib/shared/pictograph/arrow/positioning/key-generation/services/rotation-angle-override-key-generator.js";
import { SpecialPlacementDataProvider } from "#lib/shared/pictograph/arrow/positioning/placement/services/special-placement-data-provider.js";
import { SpecialPlacementLookup } from "#lib/shared/pictograph/arrow/positioning/placement/services/special-placement-lookup.js";
import { SpecialPlacer } from "#lib/shared/pictograph/arrow/positioning/placement/services/special-placer.js";
import { TurnsTupleGenerator } from "#lib/shared/pictograph/arrow/positioning/placement/services/turns-tuple-generator.js";
import { ROTATION_OVERRIDE_STORAGE_KEY } from "#lib/shared/pictograph/arrow/positioning/placement/services/rotation-override-store.js";
import { calculateEndOrientation } from "#lib/shared/pictograph/prop/services/orientation-calculator.js";
import {
  GridLocation,
  GridMode,
  GridPlacement,
} from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import { Letter } from "#lib/shared/foundation/domain/models/letter.js";
import {
  HandSide,
  MotionType,
  Orientation,
  RotationDirection,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { createMotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
import { SimpleJsonCache } from "#lib/shared/pictograph/shared/services/simple-json-cache.js";

// The authored special-placement JSON still spells per-hand rotation flags
// with the legacy colors (static/data/arrow_placement/special/from_layer1/
// β_placements.json: "(s, 1, 1)" has blue_rot_angle_override, "(s, 1, 3)" has
// red_rot_angle_override). These cases read the real files, so they fail if
// the reader stops translating left/right back to blue/red.

// The provider requests β as %CE%B2; the shared test fetch shim does not
// decode, so read the authored file from static/ directly.
class StaticPlacementCache extends SimpleJsonCache {
  override async get<T = unknown>(assetPath: string): Promise<T> {
    const file = path.join(
      process.cwd(),
      "static",
      decodeURIComponent(assetPath)
    );
    return JSON.parse(await readFile(file, "utf8")) as T;
  }
}

function betaStatic(hand: HandSide, turns: number) {
  const motion = createMotionData({
    hand,
    motionType: MotionType.STATIC,
    turns,
    rotationDirection: RotationDirection.CLOCKWISE,
    startLocation: GridLocation.NORTH,
    endLocation: GridLocation.NORTH,
    arrowLocation: GridLocation.NORTH,
    startOrientation: Orientation.IN,
    endOrientation: Orientation.IN,
    propType: PropType.STAFF,
  });
  return createMotionData({
    ...motion,
    endOrientation: calculateEndOrientation(motion, hand),
  });
}

function betaPictograph(leftTurns: number, rightTurns: number): PictographData {
  return {
    id: `beta1-in-in-${leftTurns}-${rightTurns}`,
    letter: Letter.BETA,
    gridMode: GridMode.DIAMOND,
    startPlacement: GridPlacement.BETA1,
    endPlacement: GridPlacement.BETA1,
    motions: {
      left: betaStatic(HandSide.LEFT, leftTurns),
      right: betaStatic(HandSide.RIGHT, rightTurns),
    },
  };
}

function createPlacer() {
  const tupleGenerator = new TurnsTupleGenerator();
  const placer = new SpecialPlacer(
    new SpecialPlacementDataProvider(new StaticPlacementCache()),
    tupleGenerator,
    new SpecialPlacementLookup()
  );
  return { tupleGenerator, placer };
}

async function hasOverride(
  placer: SpecialPlacer,
  pictograph: PictographData,
  hand: HandSide
): Promise<boolean> {
  const motion = pictograph.motions[hand]!;
  return placer.hasRotationAngleOverride(
    motion,
    pictograph,
    rotationAngleOverrideKeyGenerator.generateRotationAngleOverrideKey(
      motion,
      pictograph
    )
  );
}

describe("rotation override flags authored with legacy color keys", () => {
  beforeEach(() => {
    localStorage.removeItem("tka_rotation_overrides");
    localStorage.removeItem(ROTATION_OVERRIDE_STORAGE_KEY);
  });

  it("reads blue_ as the left hand and red_ as the right hand", async () => {
    const { tupleGenerator, placer } = createPlacer();

    const sameOne = betaPictograph(1, 1);
    expect(tupleGenerator.generateTurnsTuple(sameOne)).toBe("(s, 1, 1)");
    await expect(hasOverride(placer, sameOne, HandSide.LEFT)).resolves.toBe(
      true
    );
    await expect(hasOverride(placer, sameOne, HandSide.RIGHT)).resolves.toBe(
      false
    );

    const sameOneThree = betaPictograph(1, 3);
    expect(tupleGenerator.generateTurnsTuple(sameOneThree)).toBe("(s, 1, 3)");
    await expect(
      hasOverride(placer, sameOneThree, HandSide.LEFT)
    ).resolves.toBe(false);
    await expect(
      hasOverride(placer, sameOneThree, HandSide.RIGHT)
    ).resolves.toBe(true);
  });

  it("turns the flagged static arrow with the radial override map", async () => {
    const { placer } = createPlacer();
    const calculator = new ArrowRotationCalculator(
      placer,
      rotationAngleOverrideKeyGenerator
    );
    const pictograph = betaPictograph(1, 1);

    // Normal radial clockwise map puts a static arrow at NORTH on 0 degrees;
    // the flagged hand takes the radial override (normal + 180).
    await expect(
      calculator.calculateRotation(
        pictograph.motions.left!,
        GridLocation.NORTH,
        pictograph
      )
    ).resolves.toBe(180);
    await expect(
      calculator.calculateRotation(
        pictograph.motions.right!,
        GridLocation.NORTH,
        pictograph
      )
    ).resolves.toBe(0);
  });

  it("keeps a pre-rename local toggle stored under the legacy color key", async () => {
    const { placer } = createPlacer();
    localStorage.setItem(
      ROTATION_OVERRIDE_STORAGE_KEY,
      JSON.stringify({
        canonical: {
          from_layer1: {
            [Letter.BETA]: {
              "(s, 1, 1)": { blue_rot_angle_override: false },
            },
          },
        },
      })
    );

    await expect(
      hasOverride(placer, betaPictograph(1, 1), HandSide.LEFT)
    ).resolves.toBe(false);
  });
});
