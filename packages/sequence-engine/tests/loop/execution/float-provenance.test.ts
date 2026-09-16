import { describe, expect, it } from "vitest";
import type {
  MotionData,
  SequenceStep,
} from "../../../src/core/types/sequence-engine-types.js";
import { materializeTurn } from "../../../src/generation/turns/TurnMaterializer.js";
import {
  FusedExecutor,
  type FusedTransformFlags,
} from "../../../src/loop/execution/FusedExecutor.js";
import { rewoundExecutor } from "../../../src/loop/execution/RewoundExecutor.js";
import { applyOverlayInversion } from "../../../src/loop/execution/overlay-inversion.js";
import { Period } from "../../../src/loop/loop-types.js";
import { loadDiamondVariations } from "../../helpers/csv-variations.js";

type Hand = "left" | "right";
type Transform = (sequence: SequenceStep[]) => SequenceStep[];

const variations = loadDiamondVariations();
const first = variations.find(
  (row) =>
    row.leftMotion.motionType === "pro" && row.rightMotion.motionType === "pro"
)!;
const second = variations.find(
  (row) =>
    row.startPlacement === first.endPlacement &&
    row.leftMotion.motionType === "pro" &&
    row.rightMotion.motionType === "pro"
)!;

function seed(floated: readonly Hand[]): SequenceStep[] {
  const steps = [first, second].map(
    (row, index) =>
      ({
        id: `step-${index + 1}`,
        stepNumber: index + 1,
        duration: 1,
        letter: row.letter,
        startPlacement: row.startPlacement,
        endPlacement: row.endPlacement,
        motions: Object.fromEntries(
          (["left", "right"] as const).map((hand) => {
            const motion = hand === "left" ? row.leftMotion : row.rightMotion;
            return [
              hand,
              {
                ...motion,
                ...materializeTurn(motion, floated.includes(hand) ? "fl" : 0),
              },
            ];
          })
        ),
      }) as SequenceStep
  );
  const start = {
    ...steps[0]!,
    id: "start",
    stepNumber: 0,
    endPlacement: first.startPlacement,
    motions: Object.fromEntries(
      (["left", "right"] as const).map((hand) => {
        const motion = steps[0]!.motions[hand];
        return [hand, { ...motion, endLocation: motion.startLocation }];
      })
    ),
  } as SequenceStep;
  return [start, ...steps];
}

function fused(flags: Partial<FusedTransformFlags>): Transform {
  return (sequence) =>
    new FusedExecutor({
      mirror: false,
      flip: false,
      swap: false,
      invert: false,
      ...flags,
    }).execute(sequence, 2);
}

const transforms: [string, Transform][] = [
  ["mirror", fused({ mirror: true })],
  ["flip", fused({ flip: true })],
  ["invert", fused({ invert: true })],
  ["mirror and invert", fused({ mirror: true, invert: true })],
  ["mirror and swap", fused({ mirror: true, swap: true })],
  ["swap", fused({ swap: true })],
  [
    "rewind",
    (sequence) => rewoundExecutor.executeLOOP(sequence, Period.HALVED),
  ],
  ["overlay inversion", (sequence) => applyOverlayInversion(sequence, 2)],
];

describe.each(transforms)("%s float provenance", (_name, transform) => {
  it.each<{ floated: Hand[]; label: string }>([
    { floated: ["left"], label: "left" },
    { floated: ["right"], label: "right" },
    { floated: ["left", "right"], label: "both hands" },
  ])("preserves the transformed source when floating $label", ({ floated }) => {
    const reference = transform(seed([]));
    const result = transform(seed(floated));
    let checked = 0;
    for (let i = 1; i < result.length; i++) {
      for (const hand of ["left", "right"] as const) {
        const motion: MotionData = result[i]!.motions[hand];
        const original: MotionData = reference[i]!.motions[hand];
        if (motion.motionType === "float") {
          expect(motion.prefloatMotionType, `step ${i} ${hand} type`).toBe(
            original.motionType
          );
          expect(
            motion.prefloatRotationDirection,
            `step ${i} ${hand} direction`
          ).toBe(original.rotationDirection);
          expect(motion.rotationDirection).toBe("noRotation");
          expect(motion.turns).toBe("fl");
          checked++;
        } else {
          expect(motion).not.toHaveProperty("prefloatMotionType");
          expect(motion).not.toHaveProperty("prefloatRotationDirection");
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});
