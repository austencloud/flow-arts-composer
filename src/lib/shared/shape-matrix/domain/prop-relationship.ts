import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import {
  TND_BY_FAMILY,
  type TnDElement,
} from "$lib/features/choreo-card/domain/tnd-element";
import type { Flower } from "./flower-signature";
import {
  classifyPropRelationship,
  propPhase,
  timingFromPhase,
} from "@tka/sequence-engine/generation";
import type { ElementalType } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import {
  isVisibleMotion,
  type MotionData,
} from "$lib/shared/pictograph/shared/domain/models/motion-data";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";

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

type RelationshipMotion = Pick<
  MotionData,
  | "motionType"
  | "rotationDirection"
  | "startOrientation"
  | "startLocation"
  | "endOrientation"
  | "endLocation"
>;

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
  sequence: SequenceData,
  pair: {
    left: Pick<Flower, "turns">;
    right: Pick<Flower, "turns">;
  }
): PropRelationship {
  const step = sequence.steps.find(
    (candidate) => candidate.motions.left && candidate.motions.right
  );
  const left = step?.motions.left;
  const right = step?.motions.right;
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

/**
 * A sequence already carries the two turn values needed to classify its prop
 * relationship. This adapter keeps ordinary viewers out of the Shape Matrix's
 * flower-selection model while routing the calculation through the same owner.
 */
export function derivePropElementalType(
  sequence: SequenceData
): ElementalType | null {
  const step = sequence.steps.find(
    (candidate) => candidate.motions.left && candidate.motions.right
  );
  const left = step?.motions.left;
  const right = step?.motions.right;
  if (!left || !right) return null;
  const relationship = derivePropRelationship(sequence, {
    left: { turns: left.turns },
    right: { turns: right.turns },
  });
  return relationship.kind === "full"
    ? (relationship.element.element as ElementalType)
    : null;
}

/**
 * The prop relationship of ONE step, read from its own two motions. This is
 * the entry point for per-pictograph surfaces (viewer cells, card fronts,
 * exports): a start position or a float step has no prop element, so those
 * pictographs draw no prop glyph.
 */
export function derivePropElementalTypeForStep(
  step: Pick<PictographData, "motions"> | null | undefined
): ElementalType | null {
  const left = step?.motions?.left;
  const right = step?.motions?.right;
  if (!isVisibleMotion(left) || !isVisibleMotion(right)) return null;
  const relationship = relationshipFromMotions(
    left,
    right,
    left.turns,
    right.turns
  );
  return relationship.kind === "full"
    ? (relationship.element.element as ElementalType)
    : null;
}
