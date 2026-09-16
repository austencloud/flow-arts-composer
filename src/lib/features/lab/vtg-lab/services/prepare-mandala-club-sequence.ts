import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import type { MotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

export type MandalaPathShape = "arc" | "linear" | "concave";

/** The motions map carried by both StartPlacementData and StepData (via PictographData). */
type MotionsMap = PictographData["motions"];

/**
 * Produce a single-club, single-hand SequenceData: the non-shown hand is
 * marked `isVisible: false` on the start placement and every step, and the
 * shown hand's motion is tagged with club + the path shape. The engine and
 * renderers skip invisible hands (isVisibleMotion guards — the both-required
 * Step layer's absence encoding), so the hidden hand has no prop, no
 * endpoints, and no path line — a genuine solo animation, not a dimmed hand.
 */
export function prepareMandalaPropSequence(
  seq: SequenceData,
  opts: {
    show: "left" | "right";
    pathShape: MandalaPathShape;
    propType?: PropType;
  }
): SequenceData {
  const { show, pathShape, propType = PropType.CLUB } = opts;
  const tag = (m: MotionData | undefined): MotionData | undefined =>
    m ? { ...m, propType, pathShape, isVisible: true } : undefined;
  const hide = (m: MotionData | undefined): MotionData | undefined =>
    m ? { ...m, isVisible: false } : undefined;
  const soloMotions = (motions: MotionsMap): MotionsMap => ({
    left: show === "left" ? tag(motions.left) : hide(motions.left),
    right: show === "right" ? tag(motions.right) : hide(motions.right),
  });
  // The spread is structurally `T` with a refined `motions`; TS can't narrow a
  // generic spread back to `T`, so assert it (input shape is otherwise preserved).
  const apply = <T extends PictographData>(d: T): T =>
    d.motions ? ({ ...d, motions: soloMotions(d.motions) } as T) : d;
  return {
    ...seq,
    startPlacement: seq.startPlacement
      ? apply(seq.startPlacement)
      : seq.startPlacement,
    steps: (seq.steps ?? []).map(apply),
  } as SequenceData;
}

/** Legacy lab name retained while the Shape Matrix becomes prop-selectable. */
export const prepareMandalaClubSequence = prepareMandalaPropSequence;
