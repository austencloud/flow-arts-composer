// Injects the card's effective prop types into a step's motions so the arrow
// override key the inspect editor writes (keyed by motionData.propType) equals
// the key the card-front bake reads. Sequence StepData is prop-agnostic; the
// bake applies prop types from render options (leftPropType ?? settings), so
// the editor must edit against those same prop types or a fan/club card would
// edit the "staff" key and show no change on re-bake. Pure; never mutates input.
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";

export function withEffectivePropTypes(
  step: StepData,
  leftPropType: PropType,
  rightPropType: PropType
): StepData {
  const motions = step.motions;
  if (!motions) return step;
  const left = motions[HandSide.LEFT];
  const right = motions[HandSide.RIGHT];
  return {
    ...step,
    motions: {
      ...motions,
      ...(left && { [HandSide.LEFT]: { ...left, propType: leftPropType } }),
      ...(right && { [HandSide.RIGHT]: { ...right, propType: rightPropType } }),
    },
  } as StepData;
}
