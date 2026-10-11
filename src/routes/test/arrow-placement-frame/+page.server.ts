import { readFile } from "node:fs/promises";
import path from "node:path";

import { Point } from "fabric";
import type { PageServerLoad } from "./$types";
import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import {
  HandSide,
  RotationDirection,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
import { generatePlacementKey } from "#lib/shared/pictograph/arrow/positioning/key-generation/services/arrow-placement-key-generator.js";
import { arrowLocationCalculator } from "#lib/shared/pictograph/arrow/positioning/calculation/services/arrow-location-calculator.js";
import { directionalTupleProcessor } from "#lib/shared/pictograph/arrow/positioning/calculation/services/directional-tuple-processor.js";
import { rotatePlacementVectorToDisplayed } from "#lib/shared/pictograph/arrow/positioning/calculation/services/canonical-placement-frame.js";
import { getInitialPosition } from "#lib/shared/pictograph/arrow/orchestration/services/arrow-grid-coordinator.js";
import {
  buildPlacementFixture,
  type PlacementMap,
  type PlacementMotionName,
} from "../arrow-placement-fixture";

interface Candidate {
  motionType: PlacementMotionName;
  placementKey: string;
  turns: string;
  rotationDirection: string;
  displacement: number;
  legacyAdjustment: { x: number; y: number };
  canonicalAdjustment: { x: number; y: number };
  legacyPoint: { x: number; y: number };
  canonicalPoint: { x: number; y: number };
  legacyPictograph: PictographData;
  canonicalPictograph: PictographData;
}

interface LegacyOutlierBaseline {
  motionType: PlacementMotionName;
  placementKey: string;
  turns: string;
  rotationDirection: RotationDirection;
  legacyAdjustment: { x: number; y: number };
}

// Frozen from the retirement audit that evaluated all 1,020 valid combinations
// in the former box default maps. Keeping five vectors is enough to replay the
// worst case in each motion family after the 75 duplicate source files are gone.
const AUDITED_CANDIDATE_COUNT = 1_020;
const LEGACY_OUTLIERS: LegacyOutlierBaseline[] = [
  {
    motionType: "dash",
    placementKey: "dash_to_radial_layer3_beta",
    turns: "2",
    rotationDirection: RotationDirection.NO_ROTATION,
    legacyAdjustment: { x: 0, y: 100 },
  },
  {
    motionType: "static",
    placementKey: "static_to_layer2_beta",
    turns: "0.5",
    rotationDirection: RotationDirection.NO_ROTATION,
    legacyAdjustment: { x: 160, y: 0 },
  },
  {
    motionType: "anti",
    placementKey: "anti_to_radial_layer3_beta",
    turns: "0",
    rotationDirection: RotationDirection.CLOCKWISE,
    legacyAdjustment: { x: 5, y: 10 },
  },
  {
    motionType: "pro",
    placementKey: "pro_to_radial_layer3_beta",
    turns: "1",
    rotationDirection: RotationDirection.CLOCKWISE,
    legacyAdjustment: { x: -55, y: -50 },
  },
  {
    motionType: "float",
    placementKey: "float_to_layer1_gamma",
    turns: "fl",
    rotationDirection: RotationDirection.NO_ROTATION,
    legacyAdjustment: { x: 0, y: 0 },
  },
];

export const load: PageServerLoad = async () => {
  const cases = await Promise.all(LEGACY_OUTLIERS.map(replayLegacyOutlier));

  return {
    cases: cases.sort((a, b) => b.displacement - a.displacement),
    analyzedCandidateCount: AUDITED_CANDIDATE_COUNT,
  };
};

async function replayLegacyOutlier(
  baseline: LegacyOutlierBaseline
): Promise<Candidate> {
  const diamondData = await readPlacementMap(baseline.motionType);
  const diamondValue = diamondData[baseline.placementKey]?.[baseline.turns];
  if (!diamondValue) {
    throw new Error(
      `Canonical placement missing: ${baseline.motionType}/${baseline.placementKey}/${baseline.turns}`
    );
  }

  const numericTurns = Number(baseline.turns);
  const fixture = buildPlacementFixture(
    baseline.motionType,
    baseline.placementKey,
    baseline.turns === "fl" ? baseline.turns : numericTurns,
    baseline.rotationDirection
  );
  const generatedKey = generatePlacementKey(
    fixture.diamondMotion,
    fixture.diamond,
    Object.keys(diamondData)
  );
  if (generatedKey !== baseline.placementKey) {
    throw new Error(
      `Outlier fixture drifted: expected ${baseline.placementKey}, generated ${generatedKey}`
    );
  }

  const diamondLocation = arrowLocationCalculator.calculateLocation(
    fixture.diamondMotion,
    fixture.diamond
  );
  const boxLocation = arrowLocationCalculator.calculateLocation(
    fixture.boxMotion,
    fixture.box
  );
  const diamondScreen = directionalTupleProcessor.processDirectionalTuples(
    new Point(diamondValue[0], diamondValue[1]),
    fixture.diamondMotion,
    diamondLocation
  );
  const canonicalAdjustment = rotatePlacementVectorToDisplayed(
    diamondScreen,
    45
  );
  const displacement = Math.hypot(
    baseline.legacyAdjustment.x - canonicalAdjustment.x,
    baseline.legacyAdjustment.y - canonicalAdjustment.y
  );
  const anchor = getInitialPosition(
    fixture.boxMotion,
    boxLocation,
    GridMode.BOX
  );
  const correction = {
    x: baseline.legacyAdjustment.x - canonicalAdjustment.x,
    y: baseline.legacyAdjustment.y - canonicalAdjustment.y,
  };

  return {
    ...baseline,
    displacement,
    canonicalAdjustment,
    legacyPoint: {
      x: anchor.x + baseline.legacyAdjustment.x,
      y: anchor.y + baseline.legacyAdjustment.y,
    },
    canonicalPoint: {
      x: anchor.x + canonicalAdjustment.x,
      y: anchor.y + canonicalAdjustment.y,
    },
    canonicalPictograph: fixture.box,
    legacyPictograph: withManualAdjustment(
      fixture.box,
      HandSide.LEFT,
      correction
    ),
  };
}

async function readPlacementMap(
  motionType: PlacementMotionName
): Promise<PlacementMap> {
  const filePath = path.resolve(
    process.cwd(),
    "static",
    "data",
    "arrow_placement",
    "default",
    `default_${motionType}_placements.json`
  );
  return JSON.parse(await readFile(filePath, "utf8")) as PlacementMap;
}

function withManualAdjustment(
  pictograph: PictographData,
  color: HandSide,
  adjustment: { x: number; y: number }
): PictographData {
  const motion = pictograph.motions[color];
  if (!motion) return pictograph;
  return {
    ...pictograph,
    id: `${pictograph.id}-legacy`,
    motions: {
      ...pictograph.motions,
      [color]: {
        ...motion,
        arrowPlacementData: {
          ...motion.arrowPlacementData,
          manualAdjustmentX: adjustment.x,
          manualAdjustmentY: adjustment.y,
        },
      },
    },
  };
}
