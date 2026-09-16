import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  HandSide,
  Orientation,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { generatePlacementKey } from "$lib/shared/pictograph/arrow/positioning/key-generation/services/arrow-placement-key-generator";
import { calculateEndOrientation } from "$lib/shared/pictograph/prop/services/orientation-calculator";
import { getGridPlacementFromLocations } from "$lib/shared/pictograph/grid/services/grid-placement-deriver";
import { createCanonicalPlacementContext } from "$lib/shared/pictograph/arrow/positioning/calculation/services/canonical-placement-frame";
import { arrowLocationCalculator } from "$lib/shared/pictograph/arrow/positioning/calculation/services/arrow-location-calculator";
import { applyRotationMatrix } from "$lib/shared/pictograph/arrow/orchestration/services/arrow-coordinate-transformer";
import {
  getInitialPosition,
  getSceneCenter,
} from "$lib/shared/pictograph/arrow/orchestration/services/arrow-grid-coordinator";
import {
  buildPlacementCatalog,
  buildPlacementFixture,
  buildPictographPlacementFixture,
  type PlacementMap,
  type PlacementMotionName,
} from "../../../src/routes/test/arrow-placement-fixture";

const MOTION_TYPES: PlacementMotionName[] = [
  "pro",
  "anti",
  "dash",
  "static",
  "float",
];

function readMaps(): Record<PlacementMotionName, PlacementMap> {
  return Object.fromEntries(
    MOTION_TYPES.map((motionType) => {
      const filePath = path.resolve(
        process.cwd(),
        "static",
        "data",
        "arrow_placement",
        "default",
        `default_${motionType}_placements.json`
      );
      return [
        motionType,
        JSON.parse(readFileSync(filePath, "utf8")) as PlacementMap,
      ];
    })
  ) as Record<PlacementMotionName, PlacementMap>;
}

describe("arrow placement lab catalog", () => {
  it("materializes prop orientations from the selected turn value", () => {
    const zeroTurn = buildPlacementFixture(
      "pro",
      "pro_to_layer1_alpha",
      0,
      RotationDirection.CLOCKWISE
    );
    const oneTurn = buildPlacementFixture(
      "pro",
      "pro_to_layer1_alpha",
      1,
      RotationDirection.CLOCKWISE
    );

    expect(zeroTurn.diamondMotion.endOrientation).toBe(Orientation.IN);
    expect(oneTurn.diamondMotion.endOrientation).toBe(Orientation.OUT);
    expect(oneTurn.boxMotion.endOrientation).toBe(Orientation.OUT);

    for (const fixture of [zeroTurn, oneTurn]) {
      const diamondRed = fixture.diamond.motions.right!;
      const boxRed = fixture.box.motions.right!;

      expect(fixture.diamondMotion.endOrientation).toBe(
        calculateEndOrientation(fixture.diamondMotion, HandSide.LEFT)
      );
      expect(diamondRed.endOrientation).toBe(
        calculateEndOrientation(diamondRed, HandSide.RIGHT)
      );
      expect(fixture.boxMotion.endOrientation).toBe(
        fixture.diamondMotion.endOrientation
      );
      expect(boxRed.endOrientation).toBe(diamondRed.endOrientation);
    }
  });

  it("preserves a selected pictograph while overriding both prop turns", () => {
    const sourceFixture = buildPlacementFixture(
      "anti",
      "anti_to_layer1_beta",
      0,
      RotationDirection.COUNTER_CLOCKWISE
    );
    const source = {
      ...sourceFixture.diamond,
      letter: "H" as never,
      startPlacement: getGridPlacementFromLocations(
        sourceFixture.diamond.motions.left!.startLocation,
        sourceFixture.diamond.motions.right!.startLocation
      ),
      endPlacement: getGridPlacementFromLocations(
        sourceFixture.diamond.motions.left!.endLocation,
        sourceFixture.diamond.motions.right!.endLocation
      ),
    };
    const sourceSnapshot = structuredClone(source);

    const fixture = buildPictographPlacementFixture(source, 0.5);
    const diamondRed = fixture.diamond.motions.right!;
    const boxRed = fixture.box.motions.right!;

    expect(fixture.diamond.letter).toBe("H");
    expect(fixture.box.letter).toBe("H");
    expect(fixture.diamondMotion.turns).toBe(0.5);
    expect(diamondRed.turns).toBe(0.5);
    expect(source.motions.left?.turns).toBe(0);
    expect(source.motions.right?.turns).toBe(0);
    expect(source).toEqual(sourceSnapshot);
    expect(fixture.box.startPlacement).toBe(
      getGridPlacementFromLocations(
        fixture.box.motions.left!.startLocation,
        fixture.box.motions.right!.startLocation
      )
    );
    expect(fixture.box.endPlacement).toBe(
      getGridPlacementFromLocations(
        fixture.box.motions.left!.endLocation,
        fixture.box.motions.right!.endLocation
      )
    );
    expect([
      fixture.box.startPlacement !== source.startPlacement,
      fixture.box.endPlacement !== source.endPlacement,
    ]).toContain(true);
    expect(fixture.diamondMotion.endOrientation).toBe(
      calculateEndOrientation(fixture.diamondMotion, HandSide.LEFT)
    );
    expect(diamondRed.endOrientation).toBe(
      calculateEndOrientation(diamondRed, HandSide.RIGHT)
    );
    expect(fixture.boxMotion.endOrientation).toBe(
      fixture.diamondMotion.endOrientation
    );
    expect(boxRed.endOrientation).toBe(diamondRed.endOrientation);
  });

  it("only exposes fixtures that resolve to an authored production key", () => {
    const maps = readMaps();
    const catalog = buildPlacementCatalog(maps);
    let contextCount = 0;
    let reroutedContextCount = 0;
    let maximumAnchorResidual = 0;

    expect(catalog.map((entry) => entry.motionType)).toEqual(MOTION_TYPES);

    for (const motion of catalog) {
      const availableKeys = Object.keys(maps[motion.motionType]);
      for (const key of motion.keys) {
        for (const turn of key.turns) {
          for (const rotationDirection of turn.rotationDirections) {
            const fixture = buildPlacementFixture(
              motion.motionType,
              key.placementKey,
              turn.value === "fl" ? "fl" : Number(turn.value),
              rotationDirection
            );
            const resolvedKey = generatePlacementKey(
              fixture.diamondMotion,
              fixture.diamond,
              availableKeys
            );
            expect(availableKeys).toContain(resolvedKey);
            if (resolvedKey !== key.placementKey) reroutedContextCount++;

            expect(fixture.diamondMotion.endOrientation).toBe(
              calculateEndOrientation(fixture.diamondMotion, HandSide.LEFT)
            );
            const diamondRed = fixture.diamond.motions.right!;
            expect(diamondRed.endOrientation).toBe(
              calculateEndOrientation(diamondRed, HandSide.RIGHT)
            );

            const canonical = createCanonicalPlacementContext(
              fixture.box,
              fixture.boxMotion,
              fixture.boxMotion.arrowLocation
            );
            expect(canonical.rotationDegrees).toBe(45);
            expect(canonical.motionData.gridMode).toBe(GridMode.DIAMOND);
            expect(canonical.motionData.startLocation).toBe(
              fixture.diamondMotion.startLocation
            );
            expect(canonical.motionData.endLocation).toBe(
              fixture.diamondMotion.endLocation
            );

            const diamondLocation = arrowLocationCalculator.calculateLocation(
              fixture.diamondMotion,
              fixture.diamond
            );
            const boxLocation = arrowLocationCalculator.calculateLocation(
              fixture.boxMotion,
              fixture.box
            );
            const diamondAnchor = getInitialPosition(
              fixture.diamondMotion,
              diamondLocation,
              GridMode.DIAMOND
            );
            const boxAnchor = getInitialPosition(
              fixture.boxMotion,
              boxLocation,
              GridMode.BOX
            );
            const center = getSceneCenter();
            const [expectedX, expectedY] = applyRotationMatrix(
              diamondAnchor.x - center.x,
              diamondAnchor.y - center.y,
              45
            );
            maximumAnchorResidual = Math.max(
              maximumAnchorResidual,
              Math.hypot(
                boxAnchor.x - (center.x + expectedX),
                boxAnchor.y - (center.y + expectedY)
              )
            );
            contextCount++;
          }
        }
      }
    }

    expect(contextCount).toBeGreaterThan(1000);
    expect(reroutedContextCount).toBeGreaterThan(0);
    expect(maximumAnchorResidual).toBeGreaterThan(0);
    expect(maximumAnchorResidual).toBeLessThanOrEqual(0.1);
  });

  it("represents float as one non-numeric state with no rotation direction", () => {
    const floatCatalog = buildPlacementCatalog(readMaps()).find(
      (entry) => entry.motionType === "float"
    );

    expect(floatCatalog).toBeDefined();
    for (const key of floatCatalog!.keys) {
      expect(key.turns.map((turn) => turn.value)).toEqual(["fl"]);
      expect(key.turns[0]!.rotationDirections).toEqual([
        RotationDirection.NO_ROTATION,
      ]);
    }
  });
});
