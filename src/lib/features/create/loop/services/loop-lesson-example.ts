import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
import type {
  LoopOption,
  LoopStepWorkshop,
  MadeLoop,
} from "./loop-step-workshop";

/** One hand of one step: how it moves, and between which points. */
type Hand =
  `${"pro" | "static"} ${"n" | "e" | "s" | "w"}${"n" | "e" | "s" | "w"}`;

/**
 * The explainer's own LOOP: start with the hands apart, the left hand carries
 * its staff down, then the right hand carries its staff up. Two steps that end
 * a quarter turn from where they began, so four turns close the circle.
 */
const START = { left: "e", right: "w" };
const STEPS: readonly { left: Hand; right: Hand }[] = [
  { left: "pro es", right: "static ww" },
  { left: "static ss", right: "pro wn" },
];

function isHand(
  pictograph: PictographData,
  side: "left" | "right",
  hand: Hand
) {
  const motion = pictograph.motions[side];
  return (
    motion !== undefined &&
    Number(motion.turns) === 0 &&
    `${motion.motionType} ${motion.startLocation}${motion.endLocation}` === hand
  );
}

/** Null when the steps can't be loaded; the explainer then keeps to words. */
export async function loadLessonExample(
  workshop: LoopStepWorkshop
): Promise<MadeLoop | null> {
  const pose = workshop
    .startPoses()
    .apart.find(
      (p) =>
        p.motions.left?.endLocation === START.left &&
        p.motions.right?.endLocation === START.right
    );
  if (!pose) return null;
  let sequence = workshop.begin(pose);
  for (const step of STEPS) {
    const options: LoopOption[] = await workshop.loadOptions(sequence);
    const option = options.find(
      ({ pictograph }) =>
        isHand(pictograph, "left", step.left) &&
        isHand(pictograph, "right", step.right)
    );
    if (!option) return null;
    sequence = workshop.addStep(sequence, option.pictograph);
  }
  return workshop.make(sequence, "rotated");
}
