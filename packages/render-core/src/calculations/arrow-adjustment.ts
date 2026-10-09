/**
 * Arrow adjustment from the static placement JSON
 *
 * The app's special-then-default nudge lookup, its directional tuples and
 * quadrant choice, its rotation override flags and its arrow mirroring, as
 * pure functions over a JSON loader. Renderers without the app's Firestore
 * and local overrides (card renderers, the MCP) read the same files the app
 * ships in static/data/arrow_placement and land where the app does.
 *
 * Every lookup takes the canonical placement frame: a box arrow is looked up
 * as the diamond arrow it presents, and the caller turns the result back.
 */

import { calculateArrowRotation } from "./arrow-rotation.js";
import { defaultPlacementCandidateKeys } from "./default-placement-key.js";
import {
  DASH_CLOCKWISE_OVERRIDE_MAP,
  DASH_COUNTER_CLOCKWISE_OVERRIDE_MAP,
  DASH_NO_ROTATION_MAP,
  STATIC_NON_RADIAL_OVERRIDE_MAP,
  STATIC_RADIAL_OVERRIDE_MAP,
} from "../constants/rotation-maps.js";

export type ArrowHand = "left" | "right";

export interface ArrowAdjustmentMotion {
  hand: ArrowHand;
  motionType: string;
  rotationDirection: string;
  startLocation: string;
  endLocation: string;
  startOrientation?: string | null;
  endOrientation?: string | null;
  turns?: number | string | null;
  propType?: string | null;
}

export interface ArrowAdjustmentPictograph {
  letter: string;
  leftMotion: ArrowAdjustmentMotion;
  rightMotion: ArrowAdjustmentMotion;
  /** The app's turns tuple for the pictograph, e.g. "(s, 2.5, 3)". */
  turnsTuple: string;
  /** "skewed" reads the skewed placement folder; anything else canonical. */
  placementFrame?: "canonical" | "skewed";
  betaSwapped?: boolean;
}

/**
 * Reads one JSON file under the arrow_placement root, e.g.
 * "special/from_layer1/A_placements.json". Returns null when it is missing.
 */
export type ArrowPlacementJsonLoader = (relativePath: string) => unknown;

type Json = Record<string, unknown>;

const RADIAL = ["in", "out"];

const HYBRID_LETTERS = new Set([
  "C", "F", "I", "L", "O", "R", "U", "V", "W", "X", "Y", "Z",
  "W-", "X-", "Y-", "Z-", "Σ", "Δ", "Θ", "Ω", "Σ-", "Δ-", "Θ-", "Ω-",
  "Φ", "Ψ", "Λ",
]);

const NON_HYBRID_LETTERS = new Set([
  "A", "B", "D", "E", "G", "H", "J", "K", "M", "N", "P", "Q", "S", "T",
]);

const COLOR_OVERRIDE_LETTERS = new Set(["α", "β", "γ", "Φ-", "Ψ-", "Λ-"]);

/** Props with their own default placement folder; others read the root. */
const SEEDED_DEFAULT_PROPS = new Set([
  "fan", "bigfan", "club", "bigclub", "triad", "bigtriad", "minihoop",
  "bighoop", "triangle", "buugeng", "bigbuugeng", "doublestar",
  "bigdoublestar", "eightrings", "bigeightrings",
]);

function isRadial(orientation: string | null | undefined): boolean {
  return RADIAL.includes(orientation ?? "");
}

function layerOf(orientation: string | null | undefined): 1 | 2 {
  return isRadial(orientation) ? 1 : 2;
}

function startsFromMixedOrientation(pictograph: ArrowAdjustmentPictograph): boolean {
  return (
    isRadial(pictograph.leftMotion.startOrientation) !==
    isRadial(pictograph.rightMotion.startOrientation)
  );
}

function endsInMixedOrientation(pictograph: ArrowAdjustmentPictograph): boolean {
  return (
    isRadial(pictograph.leftMotion.endOrientation) !==
    isRadial(pictograph.rightMotion.endOrientation)
  );
}

function legacyColor(hand: ArrowHand): "blue" | "red" {
  return hand === "left" ? "blue" : "red";
}

function lower(value: string | null | undefined): string {
  return (value ?? "").toLowerCase();
}

/** The legacy folder for a "<leftStart>_<rightStart>" orientation key. */
export function legacyOrientationBucket(orientationKey: string): string {
  const separator = orientationKey.indexOf("_");
  const left = separator >= 0 ? orientationKey.slice(0, separator) : orientationKey;
  const right = separator >= 0 ? orientationKey.slice(separator + 1) : "in";
  const leftLayer = layerOf(left);
  const rightLayer = layerOf(right);
  if (leftLayer === 1 && rightLayer === 1) return "from_layer1";
  if (leftLayer === 2 && rightLayer === 2) return "from_layer2";
  if (leftLayer === 1 && rightLayer === 2) return "from_layer3_blue1_red2";
  return "from_layer3_blue2_red1";
}

/**
 * The special placement folders for a pictograph, keyed on both hands' START
 * orientations. Two staffs read the legacy folder; other props try their
 * exact orientation folder first, then the legacy one.
 */
export function specialPlacementOrientationKeys(pictograph: ArrowAdjustmentPictograph): {
  orientationKey: string;
  legacyKey: string;
} {
  const rawKey = `${pictograph.leftMotion.startOrientation || "in"}_${
    pictograph.rightMotion.startOrientation || "in"
  }`;
  const legacyKey = legacyOrientationBucket(rawKey);
  const leftProp = lower(pictograph.leftMotion.propType) || "staff";
  const rightProp = lower(pictograph.rightMotion.propType) || "staff";
  const bothStaffs = leftProp === "staff" && rightProp === "staff";
  return { orientationKey: bothStaffs ? legacyKey : rawKey, legacyKey };
}

/** The special placement entry key the app tries first for this arrow. */
export function specialPlacementAttributeKey(
  pictograph: ArrowAdjustmentPictograph,
  motion: ArrowAdjustmentMotion
): string {
  const color = legacyColor(motion.hand);
  if (!startsFromMixedOrientation(pictograph)) return color;
  const letter = pictograph.letter;
  if (letter === "S" || letter === "T") return color;
  if (pictograph.leftMotion.motionType !== pictograph.rightMotion.motionType) {
    const start = motion.startOrientation ?? "";
    if (isRadial(start)) return `${motion.motionType}_from_layer1`;
    if (["clock", "counter"].includes(start)) return `${motion.motionType}_from_layer2`;
    return color;
  }
  if (NON_HYBRID_LETTERS.has(letter)) return color;
  return motion.motionType;
}

function letterEntries(letterData: Json, letter: string): Json {
  const nested = letterData[letter];
  return nested && typeof nested === "object" ? (nested as Json) : letterData;
}

function pair(value: unknown): [number, number] | null {
  return Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number"
    ? [value[0], value[1]]
    : null;
}

/**
 * The nudge for one arrow in a letter's special placement file: the attribute
 * key first, then the app's fallback (motion type for hybrid letters from a
 * standard start, otherwise colour, then motion type).
 */
export function lookupSpecialPlacementAdjustment(
  letterData: Json,
  pictograph: ArrowAdjustmentPictograph,
  motion: ArrowAdjustmentMotion,
  attributeKey: string
): [number, number] | null {
  const turnData = letterEntries(letterData, pictograph.letter)[pictograph.turnsTuple];
  if (!turnData || typeof turnData !== "object") return null;
  const entries = turnData as Json;

  if (attributeKey in entries) {
    const found = pair(entries[attributeKey]);
    if (found) return found;
  }

  const byMotionType = () => pair(entries[lower(motion.motionType)]);
  if (HYBRID_LETTERS.has(pictograph.letter) && !startsFromMixedOrientation(pictograph)) {
    return byMotionType();
  }
  let color: string = legacyColor(motion.hand);
  if (pictograph.betaSwapped) color = color === "blue" ? "red" : "blue";
  return pair(entries[color]) ?? byMotionType();
}

/** The app's rotation-angle override key for this arrow. */
export function rotationOverrideKey(
  pictograph: ArrowAdjustmentPictograph,
  motion: ArrowAdjustmentMotion
): string {
  const motionType = lower(motion.motionType);
  if (startsFromMixedOrientation(pictograph) || endsInMixedOrientation(pictograph)) {
    return `${motionType}_from_layer${layerOf(motion.startOrientation)}_rot_angle_override`;
  }
  if (COLOR_OVERRIDE_LETTERS.has(pictograph.letter)) {
    return `${motion.hand}_rot_angle_override`;
  }
  return `${motionType}_rot_angle_override`;
}

function specialPlacementPath(
  pictograph: ArrowAdjustmentPictograph,
  orientationKey: string
): string {
  const root = pictograph.placementFrame === "skewed" ? "skewed/" : "";
  return `${root}special/${orientationKey}/${pictograph.letter}_placements.json`;
}

function manifestListsLetter(
  load: ArrowPlacementJsonLoader,
  pictograph: ArrowAdjustmentPictograph,
  orientationKey: string
): boolean {
  const root = pictograph.placementFrame === "skewed" ? "skewed/" : "";
  const manifest = load(`${root}special/placement_manifest.json`) as Record<
    string,
    string[]
  > | null;
  return manifest?.[orientationKey]?.includes(pictograph.letter) ?? false;
}

function loadLetterData(
  load: ArrowPlacementJsonLoader,
  pictograph: ArrowAdjustmentPictograph,
  orientationKey: string
): Json | null {
  if (!pictograph.letter) return null;
  if (!manifestListsLetter(load, pictograph, orientationKey)) return null;
  const data = load(specialPlacementPath(pictograph, orientationKey)) as Json | null;
  return data && Object.keys(data).length > 0 ? data : null;
}

/** Whether the letter's special placement turns this arrow by its override map. */
export function hasRotationOverride(
  pictograph: ArrowAdjustmentPictograph,
  motion: ArrowAdjustmentMotion,
  load: ArrowPlacementJsonLoader
): boolean {
  const motionType = lower(motion.motionType);
  if (motionType !== "dash" && motionType !== "static") return false;
  const { orientationKey, legacyKey } = specialPlacementOrientationKeys(pictograph);
  const buckets = [
    ...new Set([orientationKey, legacyKey, `from_layer${layerOf(motion.startOrientation)}`]),
  ];
  const keys = [
    ...new Set([
      rotationOverrideKey(pictograph, motion),
      `${motionType}_rot_angle_override`,
      `${motion.hand}_rot_angle_override`,
      `${legacyColor(motion.hand)}_rot_angle_override`,
    ]),
  ];
  for (const bucket of buckets) {
    const letterData = loadLetterData(load, pictograph, bucket);
    if (!letterData) continue;
    const turnData = letterEntries(letterData, pictograph.letter)[pictograph.turnsTuple];
    if (!turnData || typeof turnData !== "object") continue;
    if (keys.some((key) => (turnData as Json)[key] === true)) return true;
  }
  return false;
}

function isClockwise(direction: string): boolean {
  const d = direction.toLowerCase();
  return d === "cw" || d === "clockwise";
}

function isNoRotation(direction: string): boolean {
  const d = direction.toLowerCase();
  return d === "norotation" || d === "none" || d === "no_rotation" || d === "no_rot";
}

/** The override angle the app uses when a rotation override flag is set. */
export function rotationOverrideAngle(
  motion: ArrowAdjustmentMotion,
  location: string
): number {
  if (lower(motion.motionType) === "dash") {
    if (isNoRotation(motion.rotationDirection) || motion.turns === 0) {
      return DASH_NO_ROTATION_MAP[`${motion.startLocation},${motion.endLocation}`] ?? 0;
    }
    const map = isClockwise(motion.rotationDirection)
      ? DASH_CLOCKWISE_OVERRIDE_MAP
      : DASH_COUNTER_CLOCKWISE_OVERRIDE_MAP;
    return map[location] ?? 0;
  }
  const map = isRadial(motion.startOrientation)
    ? STATIC_RADIAL_OVERRIDE_MAP
    : STATIC_NON_RADIAL_OVERRIDE_MAP;
  const angles = map[location];
  if (!angles) return 0;
  return (isClockwise(motion.rotationDirection) ? angles.cw : angles.ccw) || 0;
}

/**
 * The arrow's glyph angle in the canonical frame: the override map when the
 * letter's special placement flags it, otherwise the motion's rotation map.
 */
export function resolveArrowRotation(
  pictograph: ArrowAdjustmentPictograph,
  motion: ArrowAdjustmentMotion,
  location: string,
  load: ArrowPlacementJsonLoader,
  options: { solo?: boolean } = {}
): number {
  if (!options.solo && hasRotationOverride(pictograph, motion, load)) {
    return rotationOverrideAngle(motion, location);
  }
  return calculateArrowRotation(
    motion.motionType,
    location,
    motion.rotationDirection,
    motion.startLocation,
    motion.endLocation,
    isRadial(motion.startOrientation),
    typeof motion.turns === "number" ? motion.turns : undefined
  );
}

/** Floats are never mirrored; anti mirrors clockwise, the rest counter. */
export function shouldMirrorArrow(motionType: string, rotationDirection: string): boolean {
  const type = motionType.toLowerCase();
  if (type === "float") return false;
  const direction = rotationDirection.toLowerCase();
  if (type === "anti") return direction === "cw";
  return direction === "ccw";
}

const CARDINALS = ["n", "e", "s", "w"];
const DIAGONALS = ["ne", "se", "sw", "nw"];

function isShift(motionType: string): boolean {
  return ["pro", "anti", "float"].includes(motionType);
}

/** Which of the four directional tuples applies at this location. */
export function arrowQuadrantIndex(motion: ArrowAdjustmentMotion, location: string): number {
  const motionType = lower(motion.motionType);
  const shift = isShift(motionType);
  const diamond = shift
    ? DIAGONALS.includes(location)
    : CARDINALS.includes(motion.startLocation) || CARDINALS.includes(motion.endLocation);
  const order = diamond === shift ? DIAGONALS : CARDINALS;
  return Math.max(0, order.indexOf(location));
}

type Tuple = [number, number];

/** The app's four directional variants of a base nudge. */
export function arrowDirectionalTuples(
  motion: ArrowAdjustmentMotion,
  x: number,
  y: number
): Tuple[] {
  const motionType = lower(motion.motionType);
  const rotation = lower(motion.rotationDirection);
  const diamond =
    CARDINALS.includes(motion.startLocation) || CARDINALS.includes(motion.endLocation);
  const cw = rotation === "clockwise" || rotation === "cw";
  const ccw = rotation === "counter_clockwise" || rotation === "ccw";
  const noRotation = rotation === "norotation";

  const turning: Tuple[] = [[x, y], [-y, x], [-x, -y], [y, -x]];
  const reflected: Tuple[] = [[-y, -x], [x, -y], [y, x], [-x, y]];
  const uniform: Tuple[] = [[x, y], [x, y], [x, y], [x, y]];

  if (motionType === "dash" || motionType === "static") {
    const dash = motionType === "dash";
    if (diamond) {
      if (cw) return [[x, -y], [y, x], [-x, y], [-y, -x]];
      if (ccw) return [[-x, -y], [y, -x], [x, y], [-y, x]];
      if (dash) return noRotation ? [[x, y], [-y, -x], [x, -y], [y, x]] : uniform;
      return [[x, y], [-x, -y], [-y, x], [y, -x]];
    }
    if (dash) {
      if (cw) return [[-y, x], [-x, -y], [y, -x], [x, y]];
      if (ccw) return [[-x, y], [-y, -x], [x, -y], [y, x]];
      return noRotation ? turning : uniform;
    }
    if (cw) return turning;
    if (ccw) return reflected;
    return turning;
  }

  if (motionType === "float") {
    // A clockwise hand path turns the nudge; a counter-clockwise one reflects it.
    const order = diamond ? CARDINALS : DIAGONALS;
    const start = order.indexOf(motion.startLocation);
    const end = order.indexOf(motion.endLocation);
    return (start + 1) % 4 === end ? turning : reflected;
  }

  const boxMirror: Tuple[] = [[-x, y], [-y, -x], [x, -y], [y, x]];
  if (motionType === "pro") {
    if (cw) return diamond ? turning : boxMirror;
    if (ccw) return diamond ? reflected : turning;
  }
  if (motionType === "anti") {
    if (cw) return diamond ? reflected : boxMirror;
    if (ccw) return turning;
  }
  return uniform;
}

function defaultPlacementTable(
  load: ArrowPlacementJsonLoader,
  motionType: string,
  propType: string
): Record<string, Record<string, unknown>> | null {
  const folder = SEEDED_DEFAULT_PROPS.has(propType) ? `${propType}/` : "";
  return load(`default/${folder}default_${motionType}_placements.json`) as Record<
    string,
    Record<string, unknown>
  > | null;
}

function turnsKey(turns: number | string | null | undefined): string {
  if (typeof turns === "string") return turns;
  const value = turns || 0;
  return value === Math.floor(value) ? Math.floor(value).toString() : value.toString();
}

/**
 * The default nudge: the placement key is chosen from the staff table's keys,
 * and read from the prop's own table when it has one.
 */
export function defaultArrowAdjustment(
  pictograph: ArrowAdjustmentPictograph,
  motion: ArrowAdjustmentMotion,
  load: ArrowPlacementJsonLoader,
  options: { solo?: boolean } = {}
): [number, number] {
  const motionType = lower(motion.motionType);
  const requested = lower(motion.propType) || "staff";
  const propType = requested === "classic_club" ? "club" : requested;
  const keys = defaultPlacementTable(load, motionType, "staff");
  const table = defaultPlacementTable(load, motionType, propType);
  if (!keys || !table) return [0, 0];
  const solo = !!options.solo;
  const candidates = defaultPlacementCandidateKeys({
    motionType,
    letter: solo ? null : pictograph.letter,
    endOrientation: motion.endOrientation,
    leftEndOrientation: solo ? motion.endOrientation : pictograph.leftMotion.endOrientation,
    rightEndOrientation: solo ? null : pictograph.rightMotion.endOrientation,
  });
  const placementKey = candidates.find((key) => key in keys) ?? motionType;
  return pair(table[placementKey]?.[turnsKey(motion.turns)]) ?? [0, 0];
}

/**
 * The arrow's nudge in the canonical frame: the letter's special placement
 * when it has one, otherwise the default table, turned by the directional
 * tuple for the arrow's quadrant. `solo` places a hand alone, as on a joined
 * grid: no special placement, and the default reads alpha.
 */
export function calculateArrowAdjustment(
  pictograph: ArrowAdjustmentPictograph,
  motion: ArrowAdjustmentMotion,
  location: string,
  load: ArrowPlacementJsonLoader,
  options: { solo?: boolean } = {}
): [number, number] {
  let base: [number, number] | null = null;
  if (!options.solo && pictograph.letter) {
    const { orientationKey, legacyKey } = specialPlacementOrientationKeys(pictograph);
    const letterData =
      loadLetterData(load, pictograph, orientationKey) ??
      loadLetterData(load, pictograph, legacyKey);
    if (letterData) {
      base = lookupSpecialPlacementAdjustment(
        letterData,
        pictograph,
        motion,
        specialPlacementAttributeKey(pictograph, motion)
      );
    }
  }
  base ??= defaultArrowAdjustment(pictograph, motion, load, options);
  const tuples = arrowDirectionalTuples(motion, base[0], base[1]);
  return tuples[arrowQuadrantIndex(motion, location)] ?? [0, 0];
}
