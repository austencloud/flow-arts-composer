/**
 * Decoder for the three flat sequence formats used before 2026-05-30.
 *
 * These bytes are already printed on physical cards. Keep this module
 * intentionally separate from the current codec: the historical wire format
 * is immutable even when today's MotionData model changes.
 */
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { StartPlacementData } from "$lib/shared/foundation/domain/models/start-placement-data";
import { createStartPlacementData } from "$lib/shared/foundation/domain/factories/create-start-placement-data";
import { createStepData } from "$lib/shared/foundation/domain/factories/create-step-data";
import {
  createMotionData,
  createPlaceholderMotion,
  type MotionData,
} from "$lib/shared/pictograph/shared/domain/models/motion-data";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import {
  GridLocation,
  GridMode,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  HandSide,
  MotionType,
  Orientation,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import {
  calculateEndOrientation,
  deriveMotionType,
  getHandpathDirection,
} from "$lib/shared/render/core/calculations/orientation";

export type LegacySequenceFormat = 1 | 2 | 3;

const LOCATION_ENCODE: Record<GridLocation, string> = {
  [GridLocation.NORTH]: "no",
  [GridLocation.EAST]: "ea",
  [GridLocation.SOUTH]: "so",
  [GridLocation.WEST]: "we",
  [GridLocation.NORTHEAST]: "ne",
  [GridLocation.SOUTHEAST]: "se",
  [GridLocation.SOUTHWEST]: "sw",
  [GridLocation.NORTHWEST]: "nw",
  [GridLocation.CENTER]: "c",
};

const LOCATION_DECODE: Record<string, GridLocation> = Object.fromEntries(
  Object.entries(LOCATION_ENCODE).map(([location, code]) => [
    code,
    location as GridLocation,
  ])
);

const ORIENTATION_ENCODE: Record<Orientation, string> = {
  [Orientation.IN]: "i",
  [Orientation.OUT]: "o",
  [Orientation.CLOCK]: "k",
  [Orientation.COUNTER]: "t",
  [Orientation.CLOCK_IN]: "I",
  [Orientation.CLOCK_OUT]: "O",
  [Orientation.COUNTER_IN]: "N",
  [Orientation.COUNTER_OUT]: "U",
  [Orientation.CENTER_N]: "1",
  [Orientation.CENTER_NE]: "2",
  [Orientation.CENTER_E]: "3",
  [Orientation.CENTER_SE]: "4",
  [Orientation.CENTER_S]: "5",
  [Orientation.CENTER_SW]: "6",
  [Orientation.CENTER_W]: "7",
  [Orientation.CENTER_NW]: "8",
};

const ORIENTATION_DECODE: Record<string, Orientation> = Object.fromEntries(
  Object.entries(ORIENTATION_ENCODE).map(([orientation, code]) => [
    code,
    orientation as Orientation,
  ])
);

const ROTATION_ENCODE: Record<RotationDirection, string> = {
  [RotationDirection.CLOCKWISE]: "c",
  [RotationDirection.COUNTER_CLOCKWISE]: "u",
  [RotationDirection.NO_ROTATION]: "x",
};

const ROTATION_DECODE: Record<string, RotationDirection> = Object.fromEntries(
  Object.entries(ROTATION_ENCODE).map(([rotation, code]) => [
    code,
    rotation as RotationDirection,
  ])
);

const MOTION_TYPE_ENCODE: Record<MotionType, string> = {
  [MotionType.PRO]: "p",
  [MotionType.ANTI]: "a",
  [MotionType.FLOAT]: "l",
  [MotionType.DASH]: "d",
  [MotionType.STATIC]: "s",
};

const MOTION_TYPE_DECODE: Record<string, MotionType> = Object.fromEntries(
  Object.entries(MOTION_TYPE_ENCODE).map(([motionType, code]) => [
    code,
    motionType as MotionType,
  ])
);

const PROP_TYPE_ENCODE: Record<PropType, string> = {
  [PropType.STAFF]: "S",
  [PropType.SIMPLESTAFF]: "s",
  [PropType.BIGSTAFF]: "1",
  [PropType.STAFF2]: "2",
  // Same code the current codec uses, so a sequence keeps its prop across formats.
  [PropType.CAPSULE_BATON]: "5",
  // Digit for the same reason: every letter that reads as "fire",
  // "double" or "staff" is taken.
  [PropType.FIRE_DOUBLE_STAFF]: "6",
  [PropType.CLUB]: "C",
  [PropType.CLASSIC_CLUB]: "7",
  [PropType.BIGCLUB]: "c",
  [PropType.FAN]: "F",
  [PropType.BIGFAN]: "f",
  [PropType.TRIAD]: "T",
  [PropType.BIGTRIAD]: "t",
  [PropType.MINIHOOP]: "M",
  [PropType.BIGHOOP]: "H",
  // A lowercase letter in this table usually means "the big build of that
  // uppercase code" (c/f/t/b/d/e/a/v/k), but not always: s/q/u below encode
  // simple staff, triquetra2, and ukulele, none of which are big builds.
  // Triangle is not a big build either, so it takes the next free digit
  // after 7, the way the earlier standard-size variants (baton, fire staff,
  // classic club) did.
  [PropType.TRIANGLE]: "8",
  [PropType.BUUGENG]: "B",
  [PropType.BIGBUUGENG]: "b",
  [PropType.TRIGENG]: "J",
  [PropType.HAND]: "X",
  [PropType.TRIQUETRA]: "Q",
  [PropType.TRIQUETRA2]: "q",
  [PropType.SWORD]: "W",
  // Same two codes the current codec uses, so a sequence keeps its prop when it
  // moves between formats.
  [PropType.ENERGY_SABER]: "3",
  [PropType.ENERGY_STAFF]: "4",
  [PropType.CHICKEN]: "K",
  [PropType.BIGCHICKEN]: "k",
  [PropType.GUITAR]: "G",
  [PropType.UKULELE]: "u",
  [PropType.DOUBLESTAR]: "D",
  [PropType.BIGDOUBLESTAR]: "d",
  [PropType.EIGHTRINGS]: "E",
  [PropType.BIGEIGHTRINGS]: "e",
  [PropType.CONTACTBALL]: "A",
  [PropType.BIGCONTACTBALL]: "a",
  [PropType.DOUBLECONTACTBALL]: "V",
  [PropType.BIGDOUBLECONTACTBALL]: "v",
  [PropType.QUIAD]: "I",
  [PropType.TORCH]: "O",
  [PropType.BIGTORCH]: "L",
  [PropType.POI]: "P",
};

const PROP_TYPE_DECODE: Record<string, PropType> = Object.fromEntries(
  Object.entries(PROP_TYPE_ENCODE).map(([propType, code]) => [
    code,
    propType as PropType,
  ])
);

// Fractalgeng used R until the prop was retired. Existing cards render it as
// its base prop, buugeng, just like the current codec's compatibility alias.
PROP_TYPE_DECODE.R = PropType.BUUGENG;

// Sickles used Y until the prop was retired 2026-09-06. Same treatment: an
// existing card decodes to its base prop, sword.
PROP_TYPE_DECODE.Y = PropType.SWORD;

export function detectLegacySequenceFormat(
  encoded: string
): LegacySequenceFormat | null {
  if (encoded.startsWith("v3|")) return 3;
  if (encoded.startsWith("v2|")) return 2;

  const firstPart = encoded.split("|", 1)[0] ?? "";
  return firstPart.includes(":") || /^\d+$/.test(firstPart) ? 1 : null;
}

function encodeLegacyMotion(
  motion: MotionData | undefined,
  format: LegacySequenceFormat
): string {
  if (!motion || motion.isVisible === false) return "";

  const startLocation = LOCATION_ENCODE[motion.startLocation];
  const endLocation = LOCATION_ENCODE[motion.endLocation];
  const startOrientation = ORIENTATION_ENCODE[motion.startOrientation];
  const endOrientation = ORIENTATION_ENCODE[motion.endOrientation];
  const legacyRotation =
    motion.motionType === MotionType.FLOAT
      ? (motion.prefloatRotationDirection ?? motion.rotationDirection)
      : motion.rotationDirection;
  const rotation =
    ROTATION_ENCODE[legacyRotation] ??
    (motion.motionType === MotionType.STATIC ||
    motion.motionType === MotionType.DASH
      ? ROTATION_ENCODE[RotationDirection.NO_ROTATION]
      : undefined);
  const turns = motion.turns === "fl" ? "f" : String(motion.turns);
  const motionType = MOTION_TYPE_ENCODE[motion.motionType];
  const propType = PROP_TYPE_ENCODE[motion.propType] ?? "S";

  if (
    !startLocation ||
    !endLocation ||
    (format !== 3 && !startOrientation) ||
    (format === 1 && !endOrientation) ||
    !rotation ||
    !motionType
  ) {
    throw new Error("Cannot re-encode legacy motion with missing fields");
  }

  if (format === 1) {
    return `${startLocation}${endLocation}${startOrientation}${endOrientation}${rotation}${turns}${motionType}${propType}`;
  }
  if (format === 2) {
    return `${startLocation}${endLocation}${startOrientation}${rotation}${turns}${motionType}${propType}`;
  }
  return `${startLocation}${endLocation}${rotation}${turns}${motionType}${propType}`;
}

function encodeLegacyBeat(
  beat: StepData | StartPlacementData,
  format: LegacySequenceFormat
): string {
  return `${encodeLegacyMotion(beat.motions.left, format)}:${encodeLegacyMotion(beat.motions.right, format)}`;
}

function decodeLegacyMotion(
  encoded: string,
  hand: HandSide,
  format: LegacySequenceFormat,
  chainStartOrientation?: Orientation
): MotionData | undefined {
  const minimumLength = format === 1 ? 10 : format === 2 ? 9 : 8;
  if (!encoded || encoded.length < minimumLength) return undefined;

  let position = 0;
  const startLocationCode = encoded.slice(position, position + 2);
  position += 2;
  const endLocationCode = encoded.slice(position, position + 2);
  position += 2;
  const startOrientationCode = format === 3 ? undefined : encoded[position++];
  const endOrientationCode = format === 1 ? encoded[position++] : undefined;
  const rotationCode = encoded[position++];

  let turnsCode = "";
  while (position < encoded.length && !MOTION_TYPE_DECODE[encoded[position]!]) {
    turnsCode += encoded[position++];
  }

  const motionTypeCode = encoded[position++];
  const propTypeCode = encoded[position];
  const startLocation = LOCATION_DECODE[startLocationCode];
  const endLocation = LOCATION_DECODE[endLocationCode];
  const startOrientation =
    format === 3
      ? chainStartOrientation
      : ORIENTATION_DECODE[startOrientationCode ?? ""];
  const legacyRotation = ROTATION_DECODE[rotationCode ?? ""];
  const turns = turnsCode === "f" ? ("fl" as const) : Number(turnsCode);
  const motionType = MOTION_TYPE_DECODE[motionTypeCode ?? ""];
  const propType = PROP_TYPE_DECODE[propTypeCode ?? ""];

  const endOrientation =
    format === 1
      ? ORIENTATION_DECODE[endOrientationCode ?? ""]
      : startLocation &&
          endLocation &&
          startOrientation &&
          legacyRotation &&
          motionType
        ? (calculateEndOrientation({
            motionType,
            turns,
            rotationDirection: legacyRotation,
            startLocation,
            endLocation,
            startOrientation,
          }) as Orientation)
        : undefined;

  if (
    !startLocation ||
    !endLocation ||
    !startOrientation ||
    !endOrientation ||
    !legacyRotation ||
    !motionType ||
    !propType ||
    (turns !== "fl" && !Number.isFinite(turns))
  ) {
    throw new Error(`Invalid legacy motion encoding: ${encoded}`);
  }

  const isFloat = motionType === MotionType.FLOAT;
  const handPath = getHandpathDirection(startLocation, endLocation);
  // A float's wire rotation slot carries prefloatRotationDirection when the
  // encoder knew it (modern saves). Blobs minted before prefloat fields
  // existed wrote the float's own rotation — literally NO_ROTATION — so
  // their wire carries NO prefloat information at all. Deriving a
  // prefloatMotionType from NO_ROTATION FABRICATES data (deriveMotionType
  // returns an arbitrary same-family type), which produced confident wrong
  // letters downstream — proven against embedded mint-time witnesses,
  // parity-repair spec 2026-07-27. Unknown decodes as ABSENT, never
  // manufactured.
  const hasRealPrefloatRotation =
    isFloat && legacyRotation !== RotationDirection.NO_ROTATION;
  const prefloatMotionType = hasRealPrefloatRotation
    ? (deriveMotionType(
        startLocation,
        endLocation,
        legacyRotation,
        0
      ) as MotionType)
    : undefined;

  return createMotionData({
    motionType,
    rotationDirection: isFloat ? RotationDirection.NO_ROTATION : legacyRotation,
    startLocation,
    endLocation,
    turns,
    startOrientation,
    endOrientation,
    propType,
    hand,
    isVisible: true,
    handPath: handPath as MotionData["handPath"],
    gridMode: inferGridMode(startLocation, endLocation),
    arrowLocation: startLocation,
    ...(hasRealPrefloatRotation && {
      prefloatMotionType,
      prefloatRotationDirection: legacyRotation,
    }),
  });
}

function inferGridMode(
  startLocation: GridLocation,
  endLocation: GridLocation
): GridMode {
  const intercardinal: GridLocation[] = [
    GridLocation.NORTHEAST,
    GridLocation.SOUTHEAST,
    GridLocation.SOUTHWEST,
    GridLocation.NORTHWEST,
  ];

  return intercardinal.includes(startLocation) &&
    intercardinal.includes(endLocation)
    ? GridMode.BOX
    : GridMode.DIAMOND;
}

function decodeLegacyBeat(
  encoded: string,
  stepNumber: number,
  format: LegacySequenceFormat,
  chained?: { left: Orientation; right: Orientation }
): StepData {
  const parts = encoded.split(":");
  if (parts.length !== 2) {
    throw new Error(`Invalid legacy beat encoding: ${encoded}`);
  }

  const left = decodeLegacyMotion(
    parts[0] ?? "",
    HandSide.LEFT,
    format,
    chained?.left
  );
  const right = decodeLegacyMotion(
    parts[1] ?? "",
    HandSide.RIGHT,
    format,
    chained?.right
  );

  return createStepData({
    stepNumber,
    duration: 1,
    isBlank: !left && !right,
    motions: {
      left:
        left ??
        createPlaceholderMotion(HandSide.LEFT, {
          orientation: chained?.left,
        }),
      right:
        right ??
        createPlaceholderMotion(HandSide.RIGHT, {
          orientation: chained?.right,
        }),
    },
  });
}

function sequenceFromParts(
  startPlacement: StartPlacementData | undefined,
  steps: StepData[]
): SequenceData {
  return {
    id: crypto.randomUUID(),
    name: "Shared Sequence",
    word: "",
    steps,
    ...(startPlacement && {
      startPlacement,
      startingPlacement: startPlacement,
    }),
    thumbnails: [],
    isFavorite: false,
    isCircular: false,
    tags: [],
    metadata: {},
    sequenceLength: steps.length,
  };
}

export function decodeLegacySequence(encoded: string): SequenceData {
  const format = detectLegacySequenceFormat(encoded);
  if (!format) throw new Error("Not a legacy sequence encoding");

  const body = format === 1 ? encoded : encoded.slice(3);
  const parts = body.split("|");

  if (format === 3) {
    const seed = parts[0] ?? "ii";
    const chained = {
      left: ORIENTATION_DECODE[seed[0] ?? ""] ?? Orientation.IN,
      right: ORIENTATION_DECODE[seed[1] ?? ""] ?? Orientation.IN,
    };
    const beats = parts.slice(1);
    if (beats.length === 0) {
      throw new Error("Invalid legacy v3 sequence encoding: no beats");
    }

    const decoded = beats.map((beat, index) => {
      const step = decodeLegacyBeat(beat, index, 3, chained);
      if (step.motions.left.isVisible) {
        chained.left = step.motions.left.endOrientation;
      }
      if (step.motions.right.isVisible) {
        chained.right = step.motions.right.endOrientation;
      }
      return step;
    });
    const startStep = decoded.shift();
    const startPlacement = startStep
      ? createStartPlacementData({
          id: startStep.id,
          motions: startStep.motions,
        })
      : undefined;
    return sequenceFromParts(startPlacement, decoded);
  }

  const firstPart = parts[0];
  if (!firstPart) {
    throw new Error("Invalid legacy sequence encoding: empty first part");
  }

  if (/^\d+$/.test(firstPart)) {
    const firstStepNumber = Number(firstPart);
    const steps = parts
      .slice(1)
      .filter(Boolean)
      .map((beat, index) =>
        decodeLegacyBeat(beat, firstStepNumber + index, format)
      );
    return sequenceFromParts(undefined, steps);
  }

  const startStep = decodeLegacyBeat(firstPart, 0, format);
  const startPlacement = createStartPlacementData({
    id: startStep.id,
    motions: startStep.motions,
  });
  const steps = parts
    .slice(1)
    .filter(Boolean)
    .map((beat, index) => decodeLegacyBeat(beat, index + 1, format));
  return sequenceFromParts(startPlacement, steps);
}

export function encodeLegacySequence(
  sequence: SequenceData,
  format: LegacySequenceFormat
): string {
  const startPlacement =
    sequence.startPlacement ??
    sequence.startingPlacement ??
    createStartPlacementData({ id: crypto.randomUUID() });
  const encodedStart = encodeLegacyBeat(startPlacement, format);
  const encodedSteps = sequence.steps.map((step) =>
    encodeLegacyBeat(step, format)
  );

  if (format === 3) {
    const leftSeed =
      ORIENTATION_ENCODE[
        startPlacement.motions.left?.startOrientation ?? Orientation.IN
      ] ?? "i";
    const rightSeed =
      ORIENTATION_ENCODE[
        startPlacement.motions.right?.startOrientation ?? Orientation.IN
      ] ?? "i";
    return `v3|${leftSeed}${rightSeed}|${encodedStart}|${encodedSteps.join("|")}`;
  }

  const prefix = format === 2 ? "v2|" : "";
  return `${prefix}${encodedStart}|${encodedSteps.join("|")}`;
}
