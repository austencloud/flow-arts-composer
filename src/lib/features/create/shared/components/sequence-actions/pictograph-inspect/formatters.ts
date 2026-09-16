/**
 * Pictograph Inspect Formatters
 *
 * Pure functions for formatting pictograph data as text.
 */
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { MotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import DefaultPropPositioner from "$lib/shared/pictograph/prop/services/default-prop-positioner";
import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import { propPlacer } from "$lib/shared/pictograph/prop/services/prop-placer";
import { getSettings } from "$lib/shared/application/state/app-state.svelte";
import {
  HandSide,
  Orientation,
  type HandSide as HandSideValue,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import {
  isBuugengFamilyProp,
  isUnilateralProp,
} from "$lib/shared/pictograph/prop/domain/enums/prop-classification";

/** "dash" -> "Dash", "static" -> "Static". For the dense motion-line display. */
export function formatMotionTypeLabel(motionType: string | undefined): string {
  if (!motionType) return "—";
  return motionType.charAt(0).toUpperCase() + motionType.slice(1);
}

/**
 * Rotation-override lookup keys all share the constant `_rot_angle_override`
 * suffix, which duplicates the chip's own label. Strip it and the underscores
 * so only the distinguishing part shows (e.g. "dash", "static from layer1",
 * or the color for special letters). The full raw key stays available on hover.
 */
export function formatRotationOverrideKey(key: string | null): string {
  if (!key) return "";
  return key.replace(/_rot_angle_override$/, "").replace(/_/g, " ") || key;
}

/** "noRotation" -> "No Rotation", "cw" -> "CW", "ccw" -> "CCW". */
export function formatRotationLabel(
  rotationDirection: string | undefined
): string {
  if (!rotationDirection) return "—";
  if (rotationDirection === "cw") return "CW";
  if (rotationDirection === "ccw") return "CCW";
  const spaced = rotationDirection.replace(/([a-z])([A-Z])/g, "$1 $2");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export async function formatMotionText(
  motion: MotionData | undefined,
  color: HandSideValue,
  rotationOverride: { hasOverride: boolean } | null,
  pictographData?: PictographData
): Promise<string> {
  if (!motion) return `${color.toUpperCase()} MOTION: None`;

  const arrow = motion.arrowPlacementData;

  // Calculate actual prop placement using the PropPlacer service
  // Apply settings override for prop type (same as PictographPreparer does)
  let calculatedPlacement: {
    positionX: number;
    positionY: number;
    rotationAngle: number;
  } | null = null;
  if (pictographData) {
    try {
      const settings = getSettings();
      const propTypeOverride =
        color === HandSide.LEFT
          ? settings.leftPropType
          : settings.rightPropType;
      const motionWithOverride = propTypeOverride
        ? { ...motion, propType: propTypeOverride }
        : motion;
      const placement = await propPlacer.calculatePlacement(
        pictographData,
        motionWithOverride,
        undefined,
        {
          leftPropType: settings.leftPropType,
          rightPropType: settings.rightPropType,
          leftBuugengFlipped: settings.leftBuugengFlipped,
          rightBuugengFlipped: settings.rightBuugengFlipped,
        }
      );
      calculatedPlacement = placement;
    } catch (e) {
      console.warn("Failed to calculate prop placement:", e);
    }
  }
  const lines = [
    `${color.toUpperCase()} MOTION:`,
    `  Type: ${motion.motionType}`,
    `  Turns: ${motion.turns === "fl" ? "float" : motion.turns}`,
    `  Rotation: ${motion.rotationDirection}`,
    `  Start Location: ${motion.startLocation}`,
    `  End Location: ${motion.endLocation}`,
    `  Arrow Location: ${motion.arrowLocation}`,
    `  Start Orientation: ${motion.startOrientation}`,
    `  End Orientation: ${motion.endOrientation}`,
  ];

  // Only add prefloat info if present
  if (motion.prefloatMotionType) {
    lines.push(`  Prefloat Type: ${motion.prefloatMotionType}`);
  }
  if (motion.prefloatRotationDirection) {
    lines.push(`  Prefloat Rotation: ${motion.prefloatRotationDirection}`);
  }

  // Arrow placement section
  lines.push(``, `  ARROW PLACEMENT:`);
  lines.push(
    `    Position: (${arrow?.positionX?.toFixed(2) ?? "N/A"}, ${arrow?.positionY?.toFixed(2) ?? "N/A"})`
  );
  lines.push(`    Rotation: ${arrow?.rotationAngle?.toFixed(1) ?? "N/A"}°`);
  lines.push(`    SVG Mirrored: ${arrow?.svgMirrored ? "Yes" : "No"}`);

  // Rotation override info (only for STATIC/DASH)
  if (rotationOverride) {
    lines.push(
      `    Rotation Override: ${rotationOverride.hasOverride ? "YES" : "No"}`
    );
  }

  if (arrow?.manualAdjustmentX || arrow?.manualAdjustmentY) {
    lines.push(
      `    Manual Adjustment: (${arrow?.manualAdjustmentX?.toFixed(2) ?? 0}, ${arrow?.manualAdjustmentY?.toFixed(2) ?? 0})`
    );
  }

  // Prop placement section - use calculated placement, not stale MotionData
  lines.push(``, `  PROP PLACEMENT:`);

  if (calculatedPlacement) {
    lines.push(
      `    Position: (${calculatedPlacement.positionX.toFixed(2)}, ${calculatedPlacement.positionY.toFixed(2)})`
    );
    lines.push(
      `    Rotation: ${calculatedPlacement.rotationAngle.toFixed(1)}°`
    );

    // Calculate expected default position and beta offset
    try {
      const gridMode =
        motion.gridMode === GridMode.BOX ? GridMode.BOX : GridMode.DIAMOND;
      const defaultPos = DefaultPropPositioner.calculatePosition(
        motion.endLocation,
        gridMode
      );
      lines.push(
        `    Default Position: (${defaultPos.x.toFixed(2)}, ${defaultPos.y.toFixed(2)})`
      );

      const offsetX = calculatedPlacement.positionX - defaultPos.x;
      const offsetY = calculatedPlacement.positionY - defaultPos.y;
      const hasOffset = Math.abs(offsetX) > 0.01 || Math.abs(offsetY) > 0.01;
      lines.push(
        `    Beta Offset: ${hasOffset ? `(${offsetX.toFixed(2)}, ${offsetY.toFixed(2)})` : "None"}`
      );
    } catch {
      lines.push(`    Default Position: (calculation error)`);
    }
  } else {
    lines.push(`    Position: (not calculated)`);
  }

  return lines.join("\n");
}

export function formatBasicInfo(
  displayData: StepData | null,
  leftMotion: MotionData | undefined,
  rightMotion: MotionData | undefined
): string {
  if (!displayData) return "";

  const gridMode = leftMotion?.gridMode ?? rightMotion?.gridMode ?? "unknown";
  const propType = leftMotion?.propType ?? rightMotion?.propType ?? "unknown";

  return `STEP INFO:
  Beat Number: ${displayData.stepNumber}
  Letter: ${displayData.letter ?? "None"}
  Grid Mode: ${gridMode}
  Prop Type: ${propType}
  Start Placement: ${displayData.startPlacement ?? "N/A"}
  End Placement: ${displayData.endPlacement ?? "N/A"}
  Blue Reversal: ${displayData.leftReversal}
  Red Reversal: ${displayData.rightReversal}
  ID: ${displayData.id}`;
}

export async function formatAllForAI(
  displayData: StepData | null,
  leftMotion: MotionData | undefined,
  rightMotion: MotionData | undefined,
  leftRotationOverride: { hasOverride: boolean } | null,
  rightRotationOverride: { hasOverride: boolean } | null,
  pictographData?: PictographData
): Promise<string> {
  if (!displayData) return "";

  const [leftText, rightText] = await Promise.all([
    formatMotionText(
      leftMotion,
      HandSide.LEFT,
      leftRotationOverride,
      pictographData
    ),
    formatMotionText(
      rightMotion,
      HandSide.RIGHT,
      rightRotationOverride,
      pictographData
    ),
  ]);

  const betaAnalysis = formatBetaAnalysis(leftMotion, rightMotion);

  return `=== PICTOGRAPH DATA ===

${formatBasicInfo(displayData, leftMotion, rightMotion)}

${betaAnalysis}

${leftText}

${rightText}`;
}

/**
 * Analyze and format beta offset decision factors
 */
function formatBetaAnalysis(
  leftMotion: MotionData | undefined,
  rightMotion: MotionData | undefined
): string {
  if (!leftMotion || !rightMotion) {
    return "BETA ANALYSIS: Insufficient motion data";
  }

  const settings = getSettings();
  const lines: string[] = ["BETA OFFSET ANALYSIS:"];

  // Prop types (stored vs actual)
  const storedLeftProp = leftMotion.propType;
  const storedRightProp = rightMotion.propType;
  const actualLeftProp = settings.leftPropType ?? storedLeftProp;
  const actualRightProp = settings.rightPropType ?? storedRightProp;

  lines.push(
    `  Stored Prop Types: left=${storedLeftProp}, right=${storedRightProp}`
  );
  lines.push(
    `  Actual Prop Types: left=${actualLeftProp}, right=${actualRightProp}`
  );

  // Buugeng family check
  const leftIsBuugeng = isBuugengFamilyProp(actualLeftProp);
  const rightIsBuugeng = isBuugengFamilyProp(actualRightProp);
  const bothBuugeng = leftIsBuugeng && rightIsBuugeng;
  lines.push(`  Left is Buugeng Family: ${leftIsBuugeng}`);
  lines.push(`  Right is Buugeng Family: ${rightIsBuugeng}`);
  lines.push(`  Both are Buugeng Family: ${bothBuugeng}`);

  // Chirality: which mirror-image form of the asymmetric Buugeng is used
  // (separate concept from orientation - orientation affects rotation angle,
  // chirality affects the shape itself)
  const leftChirality = settings.leftBuugengFlipped ?? false;
  const rightChirality = settings.rightBuugengFlipped ?? false;
  const oppositeChirality = leftChirality !== rightChirality;
  lines.push(`  Left Buugeng Chirality: ${leftChirality ? "B" : "A"}`);
  lines.push(`  Right Buugeng Chirality: ${rightChirality ? "B" : "A"}`);
  lines.push(`  Opposite Chirality: ${oppositeChirality}`);

  // End locations
  const sameEndLocation = leftMotion.endLocation === rightMotion.endLocation;
  lines.push(
    `  Same End Location: ${sameEndLocation} (left=${leftMotion.endLocation}, right=${rightMotion.endLocation})`
  );

  // Orientation analysis
  const leftEndOri = leftMotion.endOrientation;
  const rightEndOri = rightMotion.endOrientation;
  const radialOrientations: Orientation[] = [Orientation.IN, Orientation.OUT];
  const nonRadialOrientations: Orientation[] = [
    Orientation.CLOCK,
    Orientation.COUNTER,
  ];

  const leftIsRadial = radialOrientations.includes(leftEndOri);
  const rightIsRadial = radialOrientations.includes(rightEndOri);
  const leftIsNonRadial = nonRadialOrientations.includes(leftEndOri);
  const rightIsNonRadial = nonRadialOrientations.includes(rightEndOri);

  const bothRadial = leftIsRadial && rightIsRadial;
  const bothNonRadial = leftIsNonRadial && rightIsNonRadial;
  const hybridOrientation =
    (leftIsRadial && rightIsNonRadial) || (leftIsNonRadial && rightIsRadial);
  const sameTypeButDifferent =
    (bothRadial || bothNonRadial) && leftEndOri !== rightEndOri;

  lines.push(`  Left End Orientation: ${leftEndOri} (radial=${leftIsRadial})`);
  lines.push(
    `  Right End Orientation: ${rightEndOri} (radial=${rightIsRadial})`
  );
  lines.push(`  Both Radial (IN/OUT): ${bothRadial}`);
  lines.push(`  Both Non-Radial (CLOCK/COUNTER): ${bothNonRadial}`);
  lines.push(`  Hybrid (one radial, one not): ${hybridOrientation}`);
  lines.push(`  Same Type But Different Orientation: ${sameTypeButDifferent}`);

  // Decision summary — mirror EVERY skip gate in render-core calculateBetaOffset()
  // so this readout matches what actually renders. Previously this only checked
  // the buugeng-nesting gate, so it printed "NO" even when the real function
  // skipped (e.g. two clubs ending radial-but-different — the unilateral gate).
  const leftUnilateral = isUnilateralProp(actualLeftProp);
  const rightUnilateral = isUnilateralProp(actualRightProp);

  // Gate 3: one prop radial, the other non-radial.
  const hybridSkip = hybridOrientation;
  // Gate 4: both buugeng family + opposite chirality (nest together).
  const buugengNestSkip = bothBuugeng && oppositeChirality;
  // Gate 5: target prop is unilateral (one-ended) + same-type/different-orientation.
  // The render decides per-target; for the same-prop case both sides agree.
  const unilateralSkip =
    sameTypeButDifferent && (leftUnilateral || rightUnilateral);
  // Gate 6: trigeng + same-type/different-orientation.
  const trigengSkip =
    sameTypeButDifferent &&
    (actualLeftProp?.toLowerCase() === "trigeng" ||
      actualRightProp?.toLowerCase() === "trigeng");

  lines.push(``, `  SKIP CONDITIONS (any one skips the offset):`);
  lines.push(
    `    Hybrid orientation (one radial, one not): ${hybridSkip ? "✓" : "✗"}`
  );
  lines.push(
    `    Buugeng nesting (both buugeng + opposite chirality): ${buugengNestSkip ? "✓" : "✗"}`
  );
  lines.push(
    `    Unilateral one-ended + same-type/different-orientation: ${unilateralSkip ? "✓" : "✗"} (left=${leftUnilateral}, right=${rightUnilateral})`
  );
  lines.push(
    `    Trigeng + same-type/different-orientation: ${trigengSkip ? "✓" : "✗"}`
  );

  const shouldSkipBetaOffset =
    hybridSkip || buugengNestSkip || unilateralSkip || trigengSkip;
  lines.push(
    `  → Should Skip Beta Offset: ${shouldSkipBetaOffset ? "YES" : "NO"}`
  );

  // Orientation analysis (for reference, not part of nesting decision)
  lines.push(``, `  ORIENTATION ANALYSIS (for reference):`);
  lines.push(
    `    Left End Orientation: ${leftEndOri} (radial=${leftIsRadial})`
  );
  lines.push(
    `    Right End Orientation: ${rightEndOri} (radial=${rightIsRadial})`
  );
  lines.push(`    Same Type But Different: ${sameTypeButDifferent}`);

  return lines.join("\n");
}
