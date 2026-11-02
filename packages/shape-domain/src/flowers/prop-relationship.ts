import {
  TND_BY_FAMILY,
  type TnDElement,
} from "../elements/tnd-elements.js";
import type { Flower } from "./flower-signature";
import {
  classifyPropRelationship,
  propPhase,
  timingFromPhase,
  type PropRelationshipMotion,
} from "@tka/sequence-engine/generation";

/**
 * The two motions of a step, as the relationship reads them. A structural
 * subset of the Composer's MotionData
 * (src/lib/shared/pictograph/shared/domain/models/motion-data.ts).
 */
export type RelationshipMotion = Omit<PropRelationshipMotion, "turns"> & {
  readonly turns?: number | "fl";
  readonly isVisible?: boolean;
};

/** One step's two hands, as the relationship reads them. */
export interface RelationshipStep {
  readonly motions?: {
    readonly left?: RelationshipMotion | null;
    readonly right?: RelationshipMotion | null;
  } | null;
}

/** The part of the Composer's SequenceData the relationship reads. */
export interface RelationshipSequence {
  readonly steps: readonly RelationshipStep[];
}

export type PropDirectionRelationship = "same" | "opp";
export type PropTimingRelationship = "tog" | "split" | "quarter";

export type PropRelationship =
  | { kind: "float"; direction: null; timing: null; element: null }
  | {
      kind: "direction-only";
      direction: PropDirectionRelationship;
      timing: null;
      element: null;
    }
  | {
      kind: "full";
      direction: PropDirectionRelationship;
      timing: PropTimingRelationship;
      element: TnDElement;
    };

/**
 * The prop timing between two prop bearings, in radians.
 *
 * Exported because a surface with no sequence to read bearings off has to
 * classify the same three cases. The Theory ratios take their bearings from
 * the QfT knobs rather than from a step's start orientation. The thresholds
 * and the phase rule (bearing difference for same-spin props, mirror sum for
 * opposite-spin props) live in the engine; this is the app's one door to them.
 */
export function propTimingBetween(
  a: number,
  b: number,
  direction: PropDirectionRelationship = "same"
): PropTimingRelationship {
  return timingFromPhase(propPhase(a, b, direction));
}

const FLOAT: PropRelationship = {
  kind: "float",
  direction: null,
  timing: null,
  element: null,
};

/**
 * Classify the props separately from the hands. Direction survives unequal
 * turn rates; timing does not. Float is neither clockwise nor counter-clockwise,
 * so it deliberately returns no VTG direction/timing classification.
 */
export function derivePropRelationship(
  sequence: RelationshipSequence,
  pair: {
    left: { readonly turns: Flower["turns"] | undefined };
    right: { readonly turns: Flower["turns"] | undefined };
  }
): PropRelationship {
  const step = sequence.steps.find(
    (candidate) => candidate.motions?.left && candidate.motions?.right
  );
  const left = step?.motions?.left;
  const right = step?.motions?.right;
  if (!left || !right) return FLOAT;
  return relationshipFromMotions(
    left,
    right,
    pair.left.turns,
    pair.right.turns
  );
}

/**
 * The engine owns the geometry: which bearings the props hold, how the phase
 * between them is measured for each spin direction, and where the tog, quarter
 * and split bands fall. The generator's prop constraint and every reader in the
 * app therefore agree by construction. The one gate the engine cannot apply
 * stays here: it reads a single beat and has no turn rates to compare.
 */
function relationshipFromMotions(
  left: RelationshipMotion,
  right: RelationshipMotion,
  leftTurns: number | "fl" | undefined,
  rightTurns: number | "fl" | undefined
): PropRelationship {
  const reading = classifyPropRelationship(
    { ...left, turns: leftTurns },
    { ...right, turns: rightTurns }
  );
  if (reading.kind === "float") return FLOAT;
  const { direction } = reading;
  if (reading.kind === "direction-only" || leftTurns !== rightTurns) {
    return { kind: "direction-only", direction, timing: null, element: null };
  }
  const { timing } = reading;
  const element = TND_BY_FAMILY[`${timing}-${direction}`];
  if (!element) {
    throw new Error(`No element for prop relationship ${timing}-${direction}`);
  }
  return { kind: "full", direction, timing, element };
}

/** The whole prop relationship of one step, direction included when timing
 *  can't be read because the two props turn at different rates. */
export function derivePropRelationshipForStep(
  step: RelationshipStep | null | undefined
): PropRelationship {
  const left = step?.motions?.left;
  const right = step?.motions?.right;
  if (!isVisible(left) || !isVisible(right)) return FLOAT;
  return relationshipFromMotions(left, right, left.turns, right.turns);
}

/** The Composer's isVisibleMotion: a hidden hand has no prop relationship. */
function isVisible(
  m: RelationshipMotion | null | undefined
): m is RelationshipMotion {
  return !!m && m.isVisible !== false;
}

/** The element name the full relationship carries, or null. */
export function derivePropElementName(
  sequence: RelationshipSequence
): TnDElement["element"] | null {
  const step = sequence.steps.find(
    (candidate) => candidate.motions?.left && candidate.motions?.right
  );
  const left = step?.motions?.left;
  const right = step?.motions?.right;
  if (!left || !right) return null;
  const relationship = derivePropRelationship(sequence, {
    left: { turns: left.turns },
    right: { turns: right.turns },
  });
  return relationship.kind === "full" ? relationship.element.element : null;
}

/** The element name of ONE step's prop relationship, or null. */
export function derivePropElementNameForStep(
  step: RelationshipStep | null | undefined
): TnDElement["element"] | null {
  const relationship = derivePropRelationshipForStep(step);
  return relationship.kind === "full" ? relationship.element.element : null;
}
