/**
 * Choreography fidelity: what a short code must play, compared field by field.
 *
 * A printed QR resolves to a short-code record, and that record must play the
 * choreography that was saved. The compact wire blob does not store motion
 * types or end orientations; the decoder rebuilds them from locations,
 * rotation and turns, chained from a header seed. Real saved sequences exist
 * where that rebuild differs (e.g. "pro s->w ccw 0 turns out->out" decodes as
 * anti, out->in). Word, step count and hash equality cannot see that, so the
 * mint path, dedup and readers compare this projection instead.
 *
 * The projection keeps only what the performer does per hand per step:
 * motion type, rotation, turns, start/end location, start/end orientation,
 * duration, skew, the effective float rotation when the source records one,
 * and the start pose. Rendering data (arrow/prop placement, letters, grid
 * mode, reversals) is derived downstream and deliberately left out.
 *
 * Pure: no Firebase, no browser APIs beyond Web Crypto for the digest.
 */

import { normalizeLegacySequence } from "@tka/tka-types";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { canonicalDigest } from "$lib/shared/foundation/utils/canonical-digest";
import { decodeSequenceFromQR } from "$lib/shared/navigation/services/sequence-encoder";

type Hand = "left" | "right";
const HANDS: readonly Hand[] = ["left", "right"];

type LooseMotion = Record<string, unknown>;
type LooseBeat = {
  stepNumber?: unknown;
  duration?: unknown;
  motions?: Record<string, LooseMotion | null | undefined> | null;
};
type LooseSequence = {
  sequenceKind?: unknown;
  steps?: readonly LooseBeat[] | null;
  startPlacement?: LooseBeat | null;
  startingPlacement?: LooseBeat | null;
};

export interface ChoreographyMotion {
  motionType: string;
  rotationDirection: string;
  turns: number | "fl" | string;
  startLocation: string;
  endLocation: string;
  startOrientation: string;
  endOrientation: string;
  /**
   * Float only, and only when the source testifies to one: the rotation the
   * float replaced (its prefloat rotation, or the legacy float's own
   * rotation). Readers use it for reversal and continuity.
   */
  floatRotation?: string;
  /** Float only, and only when the source carries a real prefloat pair. */
  prefloatMotionType?: string;
  skewSteps?: number;
  skewDir?: string;
}

export interface ChoreographyPose {
  location: string;
  orientation: string;
}

export interface ChoreographyStep {
  duration: number;
  left: ChoreographyMotion | null;
  right: ChoreographyMotion | null;
}

export interface ChoreographyProjection {
  kind: "prop" | "hand-path";
  start: { left: ChoreographyPose | null; right: ChoreographyPose | null };
  steps: ChoreographyStep[];
}

const NO_ROTATION = "noRotation";
const NO_ROTATION_ALIASES = new Set(["noRotation", "no_rotation", "no_rot"]);
const REAL_ROTATIONS = new Set(["cw", "ccw"]);

function str(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

export function normalizeRotationDirection(value: unknown): string {
  const raw = str(value);
  return NO_ROTATION_ALIASES.has(raw) ? NO_ROTATION : raw;
}

function normalizeTurns(value: unknown): number | "fl" | string {
  if (value === "fl") return "fl";
  if (typeof value === "number" && Number.isFinite(value)) {
    return value === 0 ? 0 : value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed === 0 ? 0 : parsed;
  }
  return `invalid:${str(value)}`;
}

function motionFor(
  beat: LooseBeat | null | undefined,
  hand: Hand
): LooseMotion | undefined {
  const motions = beat?.motions;
  if (!motions) return undefined;
  const motion =
    hand === "left"
      ? (motions.left ?? motions.blue)
      : (motions.right ?? motions.red);
  return motion ?? undefined;
}

function isPresent(motion: LooseMotion | undefined): motion is LooseMotion {
  return !!motion && motion.isVisible !== false;
}

function projectMotion(
  motion: LooseMotion | undefined
): ChoreographyMotion | null {
  if (!isPresent(motion)) return null;

  const motionType = str(motion.motionType);
  const projected: ChoreographyMotion = {
    motionType,
    rotationDirection: normalizeRotationDirection(motion.rotationDirection),
    turns: normalizeTurns(motion.turns),
    startLocation: str(motion.startLocation),
    endLocation: str(motion.endLocation),
    startOrientation: str(motion.startOrientation),
    endOrientation: str(motion.endOrientation),
  };

  if (motionType === "float") {
    const prefloatRotation = normalizeRotationDirection(
      motion.prefloatRotationDirection
    );
    const ownRotation = projected.rotationDirection;
    // Same precedence as getEffectiveRotationDirection: a real prefloat
    // rotation wins, otherwise a legacy float's own cw/ccw is its testimony.
    const floatRotation = REAL_ROTATIONS.has(prefloatRotation)
      ? prefloatRotation
      : REAL_ROTATIONS.has(ownRotation)
        ? ownRotation
        : undefined;
    if (floatRotation) projected.floatRotation = floatRotation;
    if (
      REAL_ROTATIONS.has(prefloatRotation) &&
      typeof motion.prefloatMotionType === "string" &&
      motion.prefloatMotionType
    ) {
      projected.prefloatMotionType = motion.prefloatMotionType;
    }
    // A float does not spin; its own rotation slot is not choreography.
    projected.rotationDirection = NO_ROTATION;
    // One short-lived encoder build stored floats as numeric -0.5 turns.
    if (projected.turns === -0.5) projected.turns = "fl";
  }

  const skewSteps = Number(motion.skewSteps);
  if (Number.isFinite(skewSteps) && skewSteps > 0) {
    projected.skewSteps = skewSteps;
    projected.skewDir = str(motion.skewDir);
  }

  return projected;
}

function beatObject(value: unknown): LooseBeat | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as LooseBeat)
    : undefined;
}

function startBeatOf(sequence: LooseSequence): LooseBeat | undefined {
  return (
    beatObject(sequence.startPlacement) ??
    beatObject(sequence.startingPlacement) ??
    (sequence.steps ?? []).find((beat) => beat?.stepNumber === 0) ??
    undefined
  );
}

/** Current shape: left/right motions, startPlacement (not startPosition). */
function normalized(sequence: SequenceData | LooseSequence): LooseSequence {
  return normalizeLegacySequence(sequence as LooseSequence);
}

/** Steps that play. Beat 0 is the start position, never a step. */
export function contentStepsOf<T extends { stepNumber?: unknown }>(
  steps: readonly T[] | null | undefined
): T[] {
  return (steps ?? []).filter((beat) => beat?.stepNumber !== 0);
}

function startPose(
  startBeat: LooseBeat | undefined,
  firstStep: LooseBeat | undefined,
  hand: Hand
): ChoreographyPose | null {
  const startMotion = motionFor(startBeat, hand);
  if (isPresent(startMotion) && startMotion.startLocation) {
    return {
      location: str(startMotion.startLocation),
      orientation: str(startMotion.startOrientation),
    };
  }
  const firstMotion = motionFor(firstStep, hand);
  if (isPresent(firstMotion)) {
    return {
      location: str(firstMotion.startLocation),
      orientation: str(firstMotion.startOrientation),
    };
  }
  return null;
}

/** Project a sequence (current or legacy blue/red shape) onto what it plays. */
export function projectChoreography(
  sequence: SequenceData | LooseSequence
): ChoreographyProjection {
  const loose = normalized(sequence);
  const steps = contentStepsOf(loose.steps);
  const startBeat = startBeatOf(loose);
  return {
    kind: loose.sequenceKind === "hand-path" ? "hand-path" : "prop",
    start: {
      left: startPose(startBeat, steps[0], "left"),
      right: startPose(startBeat, steps[0], "right"),
    },
    steps: steps.map((beat) => {
      const duration = Number(beat.duration ?? 1);
      return {
        duration: Number.isFinite(duration) ? duration : 1,
        left: projectMotion(motionFor(beat, "left")),
        right: projectMotion(motionFor(beat, "right")),
      };
    }),
  };
}

const COMPARED_MOTION_FIELDS = [
  "motionType",
  "rotationDirection",
  "turns",
  "startLocation",
  "endLocation",
  "startOrientation",
  "endOrientation",
  "skewSteps",
  "skewDir",
] as const satisfies readonly (keyof ChoreographyMotion)[];

/** Testimony fields: checked only when the expected side carries them. */
const TESTIMONY_MOTION_FIELDS = [
  "floatRotation",
  "prefloatMotionType",
] as const satisfies readonly (keyof ChoreographyMotion)[];

function describe(value: unknown): string {
  return value === undefined ? "(none)" : String(value);
}

/**
 * First difference between what should play (`expected`) and what would play
 * (`actual`), or null when they play the same choreography.
 */
export function findChoreographyMismatch(
  expected: ChoreographyProjection,
  actual: ChoreographyProjection
): string | null {
  if (expected.kind !== actual.kind) {
    return `kind: ${expected.kind} vs ${actual.kind}`;
  }
  if (expected.steps.length !== actual.steps.length) {
    return `step count: ${expected.steps.length} vs ${actual.steps.length}`;
  }
  for (const hand of HANDS) {
    const e = expected.start[hand];
    const a = actual.start[hand];
    if (!e && !a) continue;
    if (!e || !a) {
      return `start ${hand}: ${e ? "present" : "absent"} vs ${a ? "present" : "absent"}`;
    }
    if (e.location !== a.location || e.orientation !== a.orientation) {
      return `start ${hand}: ${e.location}/${e.orientation} vs ${a.location}/${a.orientation}`;
    }
  }
  for (let i = 0; i < expected.steps.length; i++) {
    const e = expected.steps[i]!;
    const a = actual.steps[i]!;
    if (e.duration !== a.duration) {
      return `step ${i + 1} duration: ${e.duration} vs ${a.duration}`;
    }
    for (const hand of HANDS) {
      const em = e[hand];
      const am = a[hand];
      if (!em && !am) continue;
      if (!em || !am) {
        return `step ${i + 1} ${hand}: ${em ? "present" : "absent"} vs ${am ? "present" : "absent"}`;
      }
      for (const field of COMPARED_MOTION_FIELDS) {
        if (em[field] !== am[field]) {
          return `step ${i + 1} ${hand}.${field}: ${describe(em[field])} vs ${describe(am[field])}`;
        }
      }
      for (const field of TESTIMONY_MOTION_FIELDS) {
        if (em[field] !== undefined && em[field] !== am[field]) {
          return `step ${i + 1} ${hand}.${field}: ${describe(em[field])} vs ${describe(am[field])}`;
        }
      }
    }
  }
  return null;
}

/** Whether two sequences play the same choreography (`expected` testifies). */
export function playsSameChoreography(
  expected: SequenceData | LooseSequence,
  actual: SequenceData | LooseSequence
): boolean {
  return (
    findChoreographyMismatch(
      projectChoreography(expected),
      projectChoreography(actual)
    ) === null
  );
}

/** Per-hand prop codes the wire header carries; part of a code's identity. */
function headerProps(sequence: LooseSequence): { left: string; right: string } {
  const startBeat = startBeatOf(sequence) ?? contentStepsOf(sequence.steps)[0];
  return {
    left: str(motionFor(startBeat, "left")?.propType),
    right: str(motionFor(startBeat, "right")?.propType),
  };
}

export const CHOREOGRAPHY_DIGEST_VERSION = 1;

/**
 * Content address of what a sequence plays (plus its header props, which the
 * encoder hash has always distinguished). Stored on new records as
 * `payloadDigest` so a code minted without an encoderHash claim can still be
 * found and reused by an identical sequence.
 */
export async function choreographyDigest(
  sequence: SequenceData | LooseSequence
): Promise<string> {
  const loose = normalized(sequence);
  return canonicalDigest({
    v: CHOREOGRAPHY_DIGEST_VERSION,
    choreography: stripUndefined(projectChoreography(loose)),
    props: headerProps(loose),
  });
}

function stripUndefined<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export type EncodedFidelity =
  | { exact: true; decoded: SequenceData }
  | { exact: false; reason: string };

/**
 * Decode `encoded` exactly as an offline scan would (no embedded graft) and
 * compare it with the source, field by field.
 */
export async function verifyEncodedChoreography(
  encoded: string,
  source: SequenceData | LooseSequence
): Promise<EncodedFidelity> {
  let decoded: SequenceData;
  try {
    decoded = await decodeSequenceFromQR(encoded);
  } catch (error) {
    return {
      exact: false,
      reason: `decode failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  const mismatch = findChoreographyMismatch(
    projectChoreography(source),
    projectChoreography(decoded)
  );
  return mismatch === null
    ? { exact: true, decoded }
    : { exact: false, reason: mismatch };
}
