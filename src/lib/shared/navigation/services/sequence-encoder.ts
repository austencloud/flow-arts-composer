import {
  compressForURL,
  decompressFromURL,
  compressForQR,
  decompressFromQR,
} from "./sequence-codec";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { StartPositionData } from "$lib/shared/foundation/domain/models/start-position-data";
import { createStartPositionData } from "$lib/shared/foundation/domain/factories/create-start-position-data";
import type { MotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import { createPlaceholderMotion } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import type { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  HandSide,
  RotationDirection,
  Orientation,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import type { MotionType } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import type { ArrowPlacementData } from "$lib/shared/pictograph/arrow/positioning/placement/domain/arrow-placement-data";
import type { PropPlacementData } from "$lib/shared/pictograph/prop/domain/models/prop-placement-data";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import type {
  CompressionResult,
  ShareURLResult,
  ShareURLMetadata,
  DeepLinkParseResult,
  QRSizeEstimate,
  SequenceRouteIdParseResult,
  URLPropOptions,
} from "./types";
import {
  calculateEndOrientation,
  deriveMotionType,
  getHandpathDirection,
} from "$lib/shared/render/core/calculations/orientation";
import {
  decodeLegacySequence,
  detectLegacySequenceFormat,
  encodeLegacySequence,
} from "./legacy-sequence-codec";
import {
  INLINE_PREFIX,
  decodeOnce,
  hasReadableQrEnvelope,
  hasReadableUrlEnvelope,
  isInlineEncoded,
} from "./inline-qr-envelope";

// The envelope owner holds this; re-exported because eight call sites import it
// from the encoder.
export { isInlineEncoded } from "./inline-qr-envelope";

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
  Object.entries(LOCATION_ENCODE).map(([k, v]) => [v, k as GridLocation])
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
  Object.entries(ORIENTATION_ENCODE).map(([k, v]) => [v, k as Orientation])
);

const ROTATION_ENCODE: Record<RotationDirection, string> = {
  [RotationDirection.CLOCKWISE]: "c",
  [RotationDirection.COUNTER_CLOCKWISE]: "u",
  [RotationDirection.NO_ROTATION]: "x",
};

const ROTATION_DECODE: Record<string, RotationDirection> = Object.fromEntries(
  Object.entries(ROTATION_ENCODE).map(([k, v]) => [v, k as RotationDirection])
);

const PROP_TYPE_ENCODE: Record<PropType, string> = {
  [PropType.STAFF]: "S",
  [PropType.SIMPLESTAFF]: "s",
  [PropType.BIGSTAFF]: "1",
  [PropType.STAFF2]: "2",
  // Digit for the same reason the energy pair got one: every letter that reads
  // as "baton", "capsule" or "LED" is taken.
  [PropType.CAPSULE_BATON]: "5",
  // Digit for the same reason: every letter that reads as "fire",
  // "double" or "staff" is taken.
  [PropType.FIRE_DOUBLE_STAFF]: "6",
  [PropType.CLUB]: "C",
  // Visual club build. Digits 0-6 are already assigned or reserved by
  // shipped prop codes; 7 keeps every existing one-character link stable.
  [PropType.CLASSIC_CLUB]: "7",
  [PropType.BIGCLUB]: "c",
  [PropType.FAN]: "F",
  [PropType.BIGFAN]: "f",
  [PropType.TRIAD]: "T",
  [PropType.BIGTRIAD]: "t",
  [PropType.MINIHOOP]: "M",
  [PropType.BIGHOOP]: "H",
  [PropType.BUUGENG]: "B",
  [PropType.BIGBUUGENG]: "b",
  [PropType.TRIGENG]: "J",
  [PropType.HAND]: "X",
  [PropType.TRIQUETRA]: "Q",
  [PropType.TRIQUETRA2]: "q",
  [PropType.SWORD]: "W",
  // Energy pair. Digits, because every letter that reads as "energy", "saber",
  // or "staff" is already spoken for and a short code has one character to give.
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
  Object.entries(PROP_TYPE_ENCODE).map(([k, v]) => [v, k as PropType])
) as Record<string, PropType>;

// Legacy alias: fractalgeng (removed from the codebase 2026-06-30) was encoded
// "R". Decode old short codes / URLs to its base prop, buugeng, so existing
// links still resolve instead of falling through to a missing prop.
PROP_TYPE_DECODE["R"] = PropType.BUUGENG;

// Legacy alias: sickles (removed from the codebase 2026-09-06) was encoded "Y".
// A code is permanent once it reaches a printed card, so decode it to its base
// prop, sword, instead of letting an existing link fall through to a missing
// prop.
PROP_TYPE_DECODE["Y"] = PropType.SWORD;

type FloatWireFormat = "token" | "numeric";

function encodeMotion(
  motion: MotionData | undefined,
  floatWireFormat: FloatWireFormat = "token"
): string {
  // An invisible motion is the both-required step layer's encoding of "this
  // hand is not really there" (placeholder / stripped hand). Encode it as an
  // empty segment — byte-identical to the pre-migration absent-hand output,
  // and the decoder synthesizes the placeholder back on the way in.
  if (!motion || motion.isVisible === false) return "";

  const startLoc = LOCATION_ENCODE[motion.startLocation];
  const endLoc = LOCATION_ENCODE[motion.endLocation];
  const isFloat = motion.turns === "fl";

  // A float does not spin: its own rotation is noRotation. The prefloat rotation
  // (cw/ccw) is appended as a separate char so the type can be derived on decode.
  const prefloatRotation =
    ROTATION_ENCODE[motion.prefloatRotationDirection as RotationDirection] ??
    ROTATION_ENCODE[RotationDirection.CLOCKWISE];
  const rotation = isFloat
    ? floatWireFormat === "numeric"
      ? prefloatRotation
      : ROTATION_ENCODE[RotationDirection.NO_ROTATION]
    : (ROTATION_ENCODE[
        motion.rotationDirection === ("no_rotation" as RotationDirection)
          ? RotationDirection.NO_ROTATION
          : motion.rotationDirection
      ] ??
      (motion.motionType === "static" || motion.motionType === "dash"
        ? ROTATION_ENCODE[RotationDirection.NO_ROTATION]
        : undefined));

  const turns = isFloat
    ? floatWireFormat === "numeric"
      ? "-0.5"
      : "f"
    : String(motion.turns);

  if (!startLoc || !endLoc || !rotation) {
    console.error("❌ Encoder: motion missing required fields", {
      startLocation: motion.startLocation,
      endLocation: motion.endLocation,
      rotationDirection: motion.rotationDirection,
      turns: motion.turns,
    });
    return "";
  }

  if (!isFloat || floatWireFormat === "numeric") {
    return `${startLoc}${endLoc}${rotation}${turns}`;
  }

  // Float: append prefloat rotation (always cw/ccw — floats are always shifts).
  return `${startLoc}${endLoc}${rotation}${turns}${prefloatRotation}`;
}

function encodeBeat(
  beat: StepData | StartPositionData,
  floatWireFormat: FloatWireFormat = "token"
): string {
  const motions = beat.motions ?? { left: undefined, right: undefined };
  const encodedMotions = `${encodeMotion(motions.left, floatWireFormat)}:${encodeMotion(motions.right, floatWireFormat)}`;

  // Keep the legacy byte representation for ordinary one-beat steps. Custom
  // durations get an explicit third segment so old links and their hashes stay
  // stable while newly timed sequences round-trip without a source document.
  if (!("duration" in beat)) return encodedMotions;

  const duration = beat.duration ?? 1;
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`Invalid step duration: ${String(duration)}`);
  }

  return duration === 1 ? encodedMotions : `${encodedMotions}:d${duration}`;
}

function decodeDuration(
  encoded: string | undefined,
  stepNumber: number
): number {
  if (!encoded) return 1;

  if (!encoded.startsWith("d")) {
    throw new Error(
      `Invalid duration encoding at beat ${stepNumber}: ${encoded}`
    );
  }

  const duration = Number(encoded.slice(1));
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(
      `Invalid duration encoding at beat ${stepNumber}: ${encoded}`
    );
  }

  return duration;
}

function decodeMotion(
  encoded: string,
  hand: HandSide,
  chainStartOrientation: Orientation,
  propType: PropType
): MotionData | undefined {
  if (!encoded || encoded.length < 6) return undefined;

  let pos = 0;
  const startLocCode = encoded.slice(pos, pos + 2);
  pos += 2;
  const endLocCode = encoded.slice(pos, pos + 2);
  pos += 2;
  const rotationCode = encoded[pos++];

  const turnsCode = encoded.slice(pos);
  const isTokenFloat = turnsCode === "f" || /^f[cu]$/.test(turnsCode);
  const isNumericFloat = turnsCode === "-0.5";
  const isFloat = isTokenFloat || isNumericFloat;
  const isNumericTurns = /^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(turnsCode);

  if (!isFloat && !isNumericTurns) {
    throw new Error(`Invalid motion encoding: ${encoded}`);
  }

  const prefloatRotCode = isTokenFloat ? turnsCode[1] : rotationCode;

  const startLocation = LOCATION_DECODE[startLocCode];
  const endLocation = LOCATION_DECODE[endLocCode];
  const encodedRotationDirection = ROTATION_DECODE[rotationCode!];
  const rotationDirection = isFloat
    ? RotationDirection.NO_ROTATION
    : encodedRotationDirection;
  const turns = isFloat ? ("fl" as const) : Number(turnsCode);
  const startOrientation = chainStartOrientation;

  if (
    !startLocation ||
    !endLocation ||
    !encodedRotationDirection ||
    !rotationDirection ||
    !startOrientation ||
    (turns !== "fl" && !Number.isFinite(turns))
  ) {
    throw new Error(`Invalid motion encoding: ${encoded}`);
  }

  const motionType = deriveMotionType(
    startLocation as unknown as string,
    endLocation as unknown as string,
    rotationDirection as unknown as string,
    turns
  ) as unknown as MotionType;

  let prefloatRotationDirection: RotationDirection | undefined;
  let prefloatMotionType: MotionType | undefined;
  if (isFloat) {
    prefloatRotationDirection =
      ROTATION_DECODE[prefloatRotCode!] ?? RotationDirection.CLOCKWISE;
    prefloatMotionType = deriveMotionType(
      startLocation as unknown as string,
      endLocation as unknown as string,
      prefloatRotationDirection as unknown as string,
      0
    ) as unknown as MotionType;
  }

  const endOrientation = calculateEndOrientation({
    motionType: motionType as unknown as string,
    turns,
    rotationDirection: rotationDirection as unknown as string,
    startLocation: startLocation as unknown as string,
    endLocation: endLocation as unknown as string,
    startOrientation: startOrientation as unknown as string,
  }) as Orientation;

  const handPath = getHandpathDirection(
    startLocation as unknown as string,
    endLocation as unknown as string
  );

  const gridMode = inferGridModeFromMotion(startLocation, endLocation);

  return {
    motionType,
    rotationDirection,
    startLocation,
    endLocation,
    turns,
    startOrientation,
    endOrientation,
    handPath,
    hand,
    isVisible: true,
    propType,
    gridMode: gridMode as unknown as GridMode,
    arrowLocation: startLocation,
    arrowPlacementData: {} as unknown as ArrowPlacementData,
    propPlacementData: {} as unknown as PropPlacementData,
    ...(prefloatMotionType && { prefloatMotionType }),
    ...(prefloatRotationDirection && { prefloatRotationDirection }),
  } as MotionData;
}

function inferGridModeFromMotion(
  startLocation: GridLocation,
  endLocation: GridLocation
): "diamond" | "box" {
  const cardinalLocations: GridLocation[] = [
    GridLocation.NORTH,
    GridLocation.EAST,
    GridLocation.SOUTH,
    GridLocation.WEST,
  ];

  const intercardinalLocations: GridLocation[] = [
    GridLocation.NORTHEAST,
    GridLocation.SOUTHEAST,
    GridLocation.SOUTHWEST,
    GridLocation.NORTHWEST,
  ];

  if (
    cardinalLocations.includes(startLocation) &&
    cardinalLocations.includes(endLocation)
  ) {
    return "diamond";
  }

  if (
    intercardinalLocations.includes(startLocation) &&
    intercardinalLocations.includes(endLocation)
  ) {
    return "box";
  }

  return "diamond";
}

function buildMetadataQuery(metadata?: ShareURLMetadata): string {
  if (!metadata) return "";

  const params = new URLSearchParams();

  if (metadata.word) params.set("word", metadata.word);
  if (metadata.creator) params.set("creator", metadata.creator);
  if (metadata.notes) params.set("notes", metadata.notes);
  if (metadata.bpm !== undefined) params.set("bpm", String(metadata.bpm));
  if (metadata.darkMode !== undefined)
    params.set("dark", metadata.darkMode ? "1" : "0");
  if (metadata.difficulty) params.set("difficulty", metadata.difficulty);
  if (metadata.birthday) params.set("birthday", metadata.birthday);

  if (metadata.leftPropType && metadata.leftPropType !== PropType.STAFF) {
    const encoded = PROP_TYPE_ENCODE[metadata.leftPropType as PropType];
    if (encoded) params.set("bp", encoded);
  }
  if (metadata.rightPropType && metadata.rightPropType !== PropType.STAFF) {
    const encoded = PROP_TYPE_ENCODE[metadata.rightPropType as PropType];
    if (encoded) params.set("rp", encoded);
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

function findMotionMismatch(a: SequenceData, b: SequenceData): string | null {
  if (a.steps.length !== b.steps.length) {
    return `step count ${a.steps.length} vs ${b.steps.length}`;
  }
  const fields: (keyof MotionData)[] = [
    "motionType",
    "rotationDirection",
    "startLocation",
    "endLocation",
    "startOrientation",
    "endOrientation",
    "turns",
    "handPath",
    "prefloatMotionType",
    "prefloatRotationDirection",
    "skewSteps",
    "skewDir",
  ];
  for (let i = 0; i < a.steps.length; i++) {
    for (const color of [HandSide.LEFT, HandSide.RIGHT] as const) {
      const ma = a.steps[i]?.motions?.[color];
      const mb = b.steps[i]?.motions?.[color];
      if (!ma || !mb) return `step ${i + 1} ${color} motion missing`;
      for (const f of fields) {
        if (ma[f] !== mb[f]) {
          return `step ${i + 1} ${color}.${f}: ${String(ma[f])} vs ${String(mb[f])}`;
        }
      }
    }
  }
  return null;
}

// ============================================================================
// PUBLIC API
// ============================================================================

function encodeSequenceWithFloatFormat(
  sequence: SequenceData,
  floatWireFormat: FloatWireFormat
): string {
  let startPositionStep: StepData | StartPositionData;
  let actualSteps: readonly StepData[];

  if (sequence.startPosition) {
    startPositionStep = sequence.startPosition;
    actualSteps = sequence.steps;
  } else if (sequence.startingPosition) {
    startPositionStep = sequence.startingPosition;
    actualSteps = sequence.steps;
  } else {
    const step0 = sequence.steps.find((b) => b.stepNumber === 0);
    if (step0) {
      startPositionStep = step0;
      actualSteps = sequence.steps.filter((b) => b.stepNumber !== 0);
    } else {
      startPositionStep = createStartPositionData({ id: crypto.randomUUID() });
      actualSteps = sequence.steps;
    }
  }

  const spMotions = startPositionStep.motions ?? {
    left: undefined,
    right: undefined,
  };
  const leftSeed =
    ORIENTATION_ENCODE[spMotions.left?.startOrientation as Orientation] ?? "i";
  const rightSeed =
    ORIENTATION_ENCODE[spMotions.right?.startOrientation as Orientation] ?? "i";
  const leftPropCode =
    PROP_TYPE_ENCODE[
      (spMotions.left?.propType ?? PropType.STAFF) as PropType
    ] ?? PROP_TYPE_ENCODE[PropType.STAFF];
  const rightPropCode =
    PROP_TYPE_ENCODE[
      (spMotions.right?.propType ?? PropType.STAFF) as PropType
    ] ?? PROP_TYPE_ENCODE[PropType.STAFF];

  const header = `${leftSeed}${rightSeed}${leftPropCode}${rightPropCode}${sequence.sequenceKind === "hand-path" ? "H" : ""}`;
  const encodedStartPosition = encodeBeat(startPositionStep, floatWireFormat);
  const encodedSteps = actualSteps.map((step) =>
    encodeBeat(step, floatWireFormat)
  );
  return `${header}|${encodedStartPosition}|${encodedSteps.join("|")}`;
}

export function encodeSequence(sequence: SequenceData): string {
  return encodeSequenceWithFloatFormat(sequence, "token");
}

export function decodeSequence(encoded: string): SequenceData {
  if (!encoded) throw new Error("Cannot decode empty sequence");

  if (detectLegacySequenceFormat(encoded)) {
    return decodeLegacySequence(encoded);
  }

  const parts = encoded.split("|");
  if (parts.length < 2)
    throw new Error("Invalid sequence encoding - missing data");

  const header = parts[0] ?? "iiSS";
  let leftOri = (ORIENTATION_DECODE[header[0] ?? "i"] ??
    Orientation.IN) as Orientation;
  let rightOri = (ORIENTATION_DECODE[header[1] ?? "i"] ??
    Orientation.IN) as Orientation;
  const leftProp = (PROP_TYPE_DECODE[header[2] ?? "S"] ??
    PropType.STAFF) as PropType;
  const rightProp = (PROP_TYPE_DECODE[header[3] ?? "S"] ??
    PropType.STAFF) as PropType;

  const beatEncodings = parts.slice(1);
  if (beatEncodings.length === 0)
    throw new Error("Invalid sequence encoding - no beats");

  // Per-hand location chain: an empty segment ("this hand is not really
  // there") synthesizes an invisible static placeholder at the hand's last
  // known location/orientation, keeping the both-required Step shape while
  // the re-encode path (encodeMotion) drops it back to an empty segment.
  let leftLoc: GridLocation | undefined;
  let rightLoc: GridLocation | undefined;
  const decodeChained = (enc: string, stepNumber: number): StepData => {
    const segs = enc.split(":");
    // Slot order is immutable because these bytes are printed on physical
    // cards: the legacy blue slot is the left hand, and red is the right hand.
    const left = decodeMotion(segs[0] ?? "", HandSide.LEFT, leftOri, leftProp);
    const right = decodeMotion(
      segs[1] ?? "",
      HandSide.RIGHT,
      rightOri,
      rightProp
    );
    if (left) {
      leftOri = left.endOrientation;
      leftLoc = left.endLocation;
    }
    if (right) {
      rightOri = right.endOrientation;
      rightLoc = right.endLocation;
    }
    return {
      stepNumber,
      duration: decodeDuration(segs[2], stepNumber),
      leftReversal: false,
      rightReversal: false,
      isBlank: !(segs[0] ?? "") && !(segs[1] ?? ""),
      motions: {
        left:
          left ??
          createPlaceholderMotion(HandSide.LEFT, {
            location: leftLoc,
            orientation: leftOri,
          }),
        right:
          right ??
          createPlaceholderMotion(HandSide.RIGHT, {
            location: rightLoc,
            orientation: rightOri,
          }),
      },
      id: crypto.randomUUID(),
      letter: null,
      startPosition: null,
      endPosition: null,
    };
  };

  const startBeat = decodeChained(beatEncodings[0]!, 0);
  const startPosition = createStartPositionData({
    id: startBeat.id || crypto.randomUUID(),
    letter: startBeat.letter,
    gridPosition: startBeat.startPosition,
    startPosition: startBeat.startPosition,
    endPosition: startBeat.endPosition,
    motions: startBeat.motions,
  });

  const steps = beatEncodings
    .slice(1)
    .filter((e) => e && e.length > 0)
    .map((enc, index) => decodeChained(enc, index + 1));

  return {
    id: crypto.randomUUID(),
    name: header[4] === "H" ? "Hand path" : "Shared Sequence",
    ...(header[4] === "H" && { sequenceKind: "hand-path" as const }),
    word: "",
    steps,
    startingPosition: startPosition,
    startPosition,
    thumbnails: [],
    isFavorite: false,
    isCircular: false,
    tags: [],
    metadata: {},
    sequenceLength: steps.length,
  };
}

export function encodeSequenceWithCompression(
  sequence: SequenceData
): CompressionResult {
  const rawEncoded = encodeSequence(sequence);
  const compressed = compressForURL(rawEncoded);
  const isCompressed = compressed.startsWith("d1:");

  return {
    encoded: compressed,
    compressed: isCompressed,
    originalLength: rawEncoded.length,
    finalLength: compressed.length,
  };
}

export function decodeSequenceWithCompression(encoded: string): SequenceData {
  if (encoded.startsWith("d1:") || encoded.startsWith("raw:")) {
    return decodeSequence(decompressFromURL(encoded));
  }

  return decodeSequence(encoded);
}

export function generateShareURL(
  sequence: SequenceData,
  module: string,
  options: { compress?: boolean } = { compress: true }
): ShareURLResult {
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  if (options.compress) {
    const { encoded, compressed, originalLength, finalLength } =
      encodeSequenceWithCompression(sequence);
    const url = `${baseUrl}/?open=${module}:${encoded}`;
    const savings = compressed
      ? Math.round(((originalLength - finalLength) / originalLength) * 100)
      : 0;

    return { url, length: url.length, compressed, savings };
  }

  const encoded = encodeSequence(sequence);
  const url = `${baseUrl}/?open=${module}:${encoded}`;

  return { url, length: url.length, compressed: false, savings: 0 };
}

export function parseDeepLink(url: string): DeepLinkParseResult | null {
  try {
    const params = new URLSearchParams(
      url.includes("?") ? url.split("?")[1] : url
    );
    const openParam = params.get("open");

    if (!openParam) return null;

    const colonIndex = openParam.indexOf(":");
    if (colonIndex === -1) return null;

    const module = openParam.slice(0, colonIndex);
    const encoded = openParam.slice(colonIndex + 1);

    if (!module || !encoded) return null;

    const sequence = decodeSequenceWithCompression(encoded);
    return { module, sequence };
  } catch (error) {
    console.error("Failed to parse deep link:", error);
    return null;
  }
}

export function estimateURLLength(
  sequence: SequenceData,
  module: string,
  compress = true
): number {
  const result = generateShareURL(sequence, module, { compress });
  return result.length;
}

export function generateViewerURL(
  sequence: SequenceData,
  options: {
    compress?: boolean;
    metadata?: ShareURLMetadata;
    /**
     * A minted short code for this sequence. When present the path is
     * `/sequence/<code>` — the route resolves it through the short-code
     * manager — instead of the inline-encoded sequence, so the link stays
     * short even when it carries a full viewer-state snapshot.
     */
    shortCode?: string;
  } = {
    compress: true,
  }
): ShareURLResult {
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const metadataQuery = buildMetadataQuery(options.metadata);

  if (options.shortCode) {
    const url = `${baseUrl}/sequence/${encodeURIComponent(options.shortCode)}${metadataQuery}`;
    return { url, length: url.length, compressed: false, savings: 0 };
  }

  if (options.compress) {
    const { encoded, compressed, originalLength, finalLength } =
      encodeSequenceWithCompression(sequence);
    const url = `${baseUrl}/sequence/${encodeURIComponent(encoded)}${metadataQuery}`;
    const savings = compressed
      ? Math.round(((originalLength - finalLength) / originalLength) * 100)
      : 0;

    return { url, length: url.length, compressed, savings };
  }

  const encoded = encodeSequence(sequence);
  const url = `${baseUrl}/sequence/${encodeURIComponent(encoded)}${metadataQuery}`;

  return { url, length: url.length, compressed: false, savings: 0 };
}

export function generateSequenceRoutePath(sequence: SequenceData): string {
  const { encoded } = encodeSequenceWithCompression(sequence);
  return `/sequence/${encodeURIComponent(encoded)}`;
}

/**
 * The spellings a `/sequence/[id]` parameter may arrive under.
 *
 * The router hands the parameter over already percent-decoded — SvelteKit's
 * `decode_params` runs `decodeURIComponent` over every matched segment — so the
 * id itself is always the first candidate. A second decode survives only as a
 * fallback for historically double-encoded links, and never throws: a legacy
 * QR payload is base45 (RFC 9285), whose alphabet includes `%`, and
 * `decodeURIComponent` rejects a `%` that is not followed by two hex digits.
 */
function sequenceRouteIdCandidates(id: string): readonly string[] {
  const decoded = decodeOnce(id);
  return decoded === id ? [id] : [id, decoded];
}

function isInlineUrlEncoded(candidate: string): boolean {
  return (
    candidate.startsWith("d1:") ||
    candidate.startsWith("raw:") ||
    candidate.startsWith("z:") ||
    // A flat encoding that was short enough to skip compression keeps its beat
    // separators, so a pipe is the remaining tell for an uncompressed blob.
    candidate.includes("|")
  );
}

/** Which decoder a candidate belongs to, or null when it names neither. */
function classifyRouteIdCandidate(
  candidate: string
): "inlineQr" | "encoded" | null {
  if (isInlineEncoded(candidate)) return "inlineQr";
  if (isInlineUrlEncoded(candidate)) return "encoded";
  return null;
}

/** Whether the delimiters this candidate's decoder needs are unescaped. */
function isDecodable(candidate: string, kind: "inlineQr" | "encoded"): boolean {
  return kind === "inlineQr"
    ? hasReadableQrEnvelope(candidate)
    : hasReadableUrlEnvelope(candidate);
}

function routeIdResult(
  kind: "inlineQr" | "encoded",
  candidate: string
): SequenceRouteIdParseResult {
  return kind === "inlineQr"
    ? { encoded: null, inlineQr: candidate, legacyId: null }
    : { encoded: candidate, inlineQr: null, legacyId: null };
}

/**
 * Classify a `/sequence/[id]` route parameter.
 *
 * Two things decide the answer, and both are load-bearing.
 *
 * **Which decoder.** The inline-QR test runs before the URL-encoding test. An
 * `s~` payload whose envelope is `raw:` still contains the flat encoding's
 * pipes, so the pipe heuristic used to claim it and hand it to the URL decoder,
 * which silently read `s~raw:iiSS` as the header and produced a sequence with
 * the wrong seed orientations and props instead of the one on the card.
 *
 * **Which spelling.** A recognizable prefix is not proof that a candidate is
 * readable: `s~` needs no escaping, so a double-encoded `s~q1%3A…` link matched
 * the inline test while its envelope was still escaped, and the QR decoder then
 * failed on `q1%3A`. So a candidate is taken only when its own delimiters are
 * intact, and the once-decoded spelling gets the same test before the escaped
 * one is accepted as a last resort. That ordering is what keeps a genuine
 * base45 `%4A` in the body from being rewritten to `J`.
 */
export function parseSequenceRouteId(id: string): SequenceRouteIdParseResult {
  if (!id) {
    return { encoded: null, inlineQr: null, legacyId: null };
  }

  const candidates = sequenceRouteIdCandidates(id);

  for (const candidate of candidates) {
    const kind = classifyRouteIdCandidate(candidate);
    if (kind && isDecodable(candidate, kind)) {
      return routeIdResult(kind, candidate);
    }
  }

  // No spelling is readable. Keep the historical classification of the id as it
  // arrived rather than inventing a decode: an `s~` id is still an inline
  // payload even when we cannot make sense of its envelope, and its decoder
  // reports the failure better than this parser can.
  for (const candidate of candidates) {
    const kind = classifyRouteIdCandidate(candidate);
    if (kind) return routeIdResult(kind, candidate);
  }

  return { encoded: null, inlineQr: null, legacyId: id };
}

export async function encodeSequenceForQR(
  sequence: SequenceData
): Promise<string> {
  const flatEncoded = encodeSequence(sequence);

  // Recipe reconstruction predates authored subjects; retain the H header.
  if (sequence.sequenceKind === "hand-path") {
    return `${INLINE_PREFIX}${compressForQR(flatEncoded)}`;
  }

  try {
    const { CompositionalEncoder } =
      await import("$lib/shared/qr/services/compositional-encoder");
    const encoder = new CompositionalEncoder(
      { encode: (s) => encodeSequence(s) },
      { decode: (s) => decodeSequence(s) },
      { compressString: (s) => compressForQR(s) }
    );
    const recipe = await encoder.tryEncode(flatEncoded, sequence);
    if (recipe) {
      return `${INLINE_PREFIX}${recipe}`;
    }
  } catch (err) {
    console.warn("[QR] Compositional encoding error:", err);
  }

  const compressed = compressForQR(flatEncoded);
  return `${INLINE_PREFIX}${compressed}`;
}

export async function decodeSequenceFromQR(
  encoded: string
): Promise<SequenceData> {
  const data = encoded.startsWith(INLINE_PREFIX)
    ? encoded.slice(INLINE_PREFIX.length)
    : encoded;

  if (data.startsWith("r1:")) {
    const { CompositionalDecoder } =
      await import("$lib/shared/qr/services/compositional-decoder");
    // A recipe's hash covers the flat wire representation, not just its
    // motions. Recipes printed before 2026-05-30 therefore have to be
    // reconstructed with the matching historical encoder before the hash can
    // be verified. The decompressed seed tells us which immutable format was
    // used; current recipes continue through the current encoder.
    const recipeParts = data.split(":");
    const compressedSeed = recipeParts.slice(3).join(":");
    const seedFlat = decompressFromQR(compressedSeed);
    const legacyFormat = detectLegacySequenceFormat(seedFlat);
    // A short-lived encoder build wrote floats as numeric -0.5 values. The
    // decoder normalizes those motions to today's `fl` token, but historical
    // recipe hashes still cover the original numeric wire representation.
    const usesNumericFloatWireFormat = seedFlat.includes("-0.5");
    const decoder = new CompositionalDecoder(
      {
        encode: (s) =>
          legacyFormat
            ? encodeLegacySequence(s, legacyFormat)
            : usesNumericFloatWireFormat
              ? encodeSequenceWithFloatFormat(s, "numeric")
              : encodeSequence(s),
      },
      { decode: (s) => decodeSequence(s) },
      { decompressString: (s) => decompressFromQR(s) }
    );
    const flatEncoded = await decoder.decode(data);
    return decodeSequence(flatEncoded);
  }

  if (data.startsWith("q1:") || data.startsWith("raw:")) {
    return decodeSequence(decompressFromQR(data));
  }

  return decodeSequenceWithCompression(data);
}

export async function estimateOfflineQRSize(
  sequence: SequenceData
): Promise<QRSizeEstimate> {
  const encoded = await encodeSequenceForQR(sequence);
  const length = encoded.length;

  const VERSION_CAPACITIES = [
    { version: 5, capacity: 224, comfortable: true },
    { version: 10, capacity: 395, comfortable: true },
    { version: 15, capacity: 589, comfortable: false },
    { version: 20, capacity: 858, comfortable: false },
    { version: 25, capacity: 1182, comfortable: false },
  ];

  let recommendedVersion = 40;
  let comfortable = false;

  for (const {
    version,
    capacity,
    comfortable: isComfortable,
  } of VERSION_CAPACITIES) {
    if (length <= capacity) {
      recommendedVersion = version;
      comfortable = isComfortable;
      break;
    }
  }

  const result: QRSizeEstimate = {
    encodedLength: length,
    recommendedVersion,
    offlineRecommended: comfortable,
  };

  if (recommendedVersion > 15) {
    result.warning =
      `Sequence produces a dense QR code (${length} chars). ` +
      `Consider using online mode for better scanning reliability.`;
    result.offlineRecommended = false;
  } else if (recommendedVersion > 10) {
    result.warning =
      `Sequence is moderately large (${length} chars). ` +
      `QR code will require good lighting and a steady hand to scan.`;
  }

  return result;
}

export function encodePropForURL(propType: PropType): string {
  return PROP_TYPE_ENCODE[propType] ?? PROP_TYPE_ENCODE[PropType.STAFF];
}

/**
 * QR links in circulation use both the compact one-character form and the
 * full enum value. Normalize either representation at the URL boundary so
 * scan rendering and telemetry agree on one durable PropType value.
 */
export function parsePropTypeFromURLValue(
  value: unknown
): PropType | undefined {
  if (typeof value !== "string" || !value) return undefined;
  const compact = PROP_TYPE_DECODE[value];
  if (compact) return compact;
  return Object.values(PropType).includes(value as PropType)
    ? (value as PropType)
    : undefined;
}

export function parsePropsFromURL(
  searchParams: URLSearchParams
): URLPropOptions {
  const result: URLPropOptions = {};

  const leftPropType = parsePropTypeFromURLValue(searchParams.get("bp"));
  if (leftPropType) result.leftPropType = leftPropType;

  const rightPropType = parsePropTypeFromURLValue(searchParams.get("rp"));
  if (rightPropType) result.rightPropType = rightPropType;
  if (leftPropType && rightPropType) {
    result.catDogMode = leftPropType !== rightPropType;
  }

  return result;
}

export function verifySequenceRoundTrip(
  encoded: string
): { ok: true; decoded: SequenceData } | { ok: false; reason: string } {
  let decoded: SequenceData;
  try {
    decoded = decodeSequenceWithCompression(encoded);
  } catch (err) {
    return { ok: false, reason: `decode threw: ${(err as Error).message}` };
  }

  let reencoded: string;
  try {
    ({ encoded: reencoded } = encodeSequenceWithCompression(decoded));
  } catch (err) {
    return { ok: false, reason: `re-encode threw: ${(err as Error).message}` };
  }

  let redecoded: SequenceData;
  try {
    redecoded = decodeSequenceWithCompression(reencoded);
  } catch (err) {
    return { ok: false, reason: `re-decode threw: ${(err as Error).message}` };
  }

  const mismatch = findMotionMismatch(decoded, redecoded);
  if (mismatch) return { ok: false, reason: mismatch };

  return { ok: true, decoded };
}

/** Test-only handles for unit tests. Not part of the public API. */
export const __test__ = { encodeMotion, decodeMotion, encodeBeat };
