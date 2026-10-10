/**
 * What an observation of a body at one instant is, and what it is filed under.
 *
 * The important decision here is that an annotation is NOT identified by its
 * video timestamp. "At 4.732 seconds the thumb end passes behind the head" is a
 * fact about one clip and dies with it. "At the midpoint of a blue pro clockwise
 * motion travelling south to west, in to out, the thumb end passes behind the
 * head" is a fact about the motion itself, and it holds for every performance of
 * that motion by anyone, forever.
 *
 * So the timestamp is kept as evidence - it is how you jump back to the frame
 * that justified the call - while the motion signature plus the phase is the
 * identity. That is what turns a pile of labeled frames into a map of the finite
 * space of movements, which is the entire point of the exercise.
 */

import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { isVisibleMotion } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";

/**
 * One hand's movement, stripped to the fields that determine what the arm has
 * to do. Two different letters that ask the same thing of one arm share a
 * signature, and an observation of either is an observation of both.
 */
export interface HandMotionSignature {
  readonly motionType: string;
  readonly rotationDirection: string;
  readonly startLocation: string;
  readonly endLocation: string;
  readonly startOrientation: string;
  readonly endOrientation: string;
}

export function signatureKey(signature: HandMotionSignature): string {
  return [
    signature.motionType,
    signature.rotationDirection,
    signature.startLocation,
    signature.endLocation,
    signature.startOrientation,
    signature.endOrientation,
  ].join("|");
}

export function describeSignature(signature: HandMotionSignature): string {
  const turn =
    signature.rotationDirection === "noRotation"
      ? ""
      : ` ${signature.rotationDirection}`;
  return (
    `${signature.motionType}${turn} ` +
    `${signature.startLocation}→${signature.endLocation} ` +
    `(${signature.startOrientation}→${signature.endOrientation})`
  );
}

/** Null when the hand is an invisible placeholder rather than a real motion. */
export function signatureFromStep(
  step: StepData,
  hand: HandSide
): HandMotionSignature | null {
  const motion = step.motions?.[hand];
  if (!motion || !isVisibleMotion(motion)) return null;
  if (!motion.startOrientation || !motion.endOrientation) return null;

  return {
    motionType: String(motion.motionType),
    rotationDirection: String(motion.rotationDirection),
    startLocation: String(motion.startLocation),
    endLocation: String(motion.endLocation),
    startOrientation: String(motion.startOrientation),
    endOrientation: String(motion.endOrientation),
  };
}

/**
 * Where inside a step the observation sits. A step is not an instant - the arm
 * travels through it - and the interesting anatomy usually happens between the
 * endpoints, which is why a phase is required rather than assumed to be the
 * landing.
 */
export const PHASE_ANCHORS = [
  { id: "launch", label: "Launch", phase: 0 },
  { id: "early", label: "Early", phase: 0.25 },
  { id: "mid", label: "Mid", phase: 0.5 },
  { id: "late", label: "Late", phase: 0.75 },
  { id: "arrival", label: "Arrival", phase: 1 },
] as const;

export type PhaseAnchorId = (typeof PHASE_ANCHORS)[number]["id"];

export function nearestPhaseAnchor(phase: number): PhaseAnchorId {
  let best: (typeof PHASE_ANCHORS)[number] = PHASE_ANCHORS[0];
  for (const anchor of PHASE_ANCHORS) {
    if (Math.abs(anchor.phase - phase) < Math.abs(best.phase - phase)) {
      best = anchor;
    }
  }
  return best.id;
}

/** Dimension id to value id. Every dimension is optional. */
export type AnatomyReading = Readonly<Record<string, string>>;

export interface MovementAnnotation {
  readonly id: string;

  /**
   * What each arm was being asked to do at this instant. Either may be null
   * when that hand is a placeholder. Coverage counts against both, so one
   * annotation of a two-handed step advances two signatures at once.
   */
  readonly leftSignature: HandMotionSignature | null;
  readonly rightSignature: HandMotionSignature | null;

  /** 0 at the step's launch, 1 at its arrival. */
  readonly phase: number;

  readonly left: AnatomyReading;
  readonly right: AnatomyReading;
  readonly body: AnatomyReading;

  /**
   * Everything the vocabulary cannot yet say. This is not a leftovers field:
   * recurring phrases here are the evidence that a dimension or value is
   * missing, and promoting them is how the vocabulary grows.
   */
  readonly notes: string;

  // ---- Evidence: how to get back to the frame that justified this ----
  readonly videoId: string;
  readonly videoLabel: string;
  readonly timestamp: number;
  /** Index into the sequence, so the annotation can be replayed in context. */
  readonly stepIndex: number;
  readonly stepLetter: string | null;
  readonly sequenceId: string;
  readonly sequenceWord: string;

  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AnnotationDraft {
  readonly left: AnatomyReading;
  readonly right: AnatomyReading;
  readonly body: AnatomyReading;
  readonly notes: string;
}

export const EMPTY_DRAFT: AnnotationDraft = {
  left: {},
  right: {},
  body: {},
  notes: "",
};

export function isDraftEmpty(draft: AnnotationDraft): boolean {
  return (
    Object.keys(draft.left).length === 0 &&
    Object.keys(draft.right).length === 0 &&
    Object.keys(draft.body).length === 0 &&
    draft.notes.trim().length === 0
  );
}

/** How many dimensions this annotation actually records, across all scopes. */
export function readingCount(annotation: MovementAnnotation): number {
  return (
    Object.keys(annotation.left).length +
    Object.keys(annotation.right).length +
    Object.keys(annotation.body).length
  );
}

/**
 * Two annotations collide when they describe the same instant of the same step
 * in the same clip. Editing then replaces rather than accumulating duplicates,
 * which matters over months of labeling where the same frame gets revisited.
 */
const PHASE_COLLISION_TOLERANCE = 0.01;

export function isSameInstant(
  a: Pick<MovementAnnotation, "videoId" | "stepIndex" | "phase">,
  b: Pick<MovementAnnotation, "videoId" | "stepIndex" | "phase">
): boolean {
  return (
    a.videoId === b.videoId &&
    a.stepIndex === b.stepIndex &&
    Math.abs(a.phase - b.phase) < PHASE_COLLISION_TOLERANCE
  );
}
