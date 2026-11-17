/**
 * Screen 2's twins and screen 5's four reflections: one step put through each
 * change with the same transforms Create's Mirror, Flip, Rotate, Swap, Invert
 * and Rewind buttons use. They run in the browser because the transforms look
 * up the changed step's letter in the motion data.
 *
 * Create has buttons for two reflection lines (Mirror: left-right, Flip:
 * top-bottom). A reflection followed by a quarter turn is the reflection
 * across the line halfway between, so the two diagonals are Mirror then a
 * quarter turn either way. The engine's pair algebra confirms each line.
 */
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import {
  flipSequence,
  invertSequence,
  mirrorSequence,
  rewindSequence,
  rotateSequence,
  swapHands,
} from "#lib/shared/create/services/sequence-transformer.js";
import { relationsForPair } from "@tka/sequence-engine/loop";
import type { PairMotions } from "@tka/sequence-engine/loop";
import type { ReflectionLine, TypeKind } from "./loop-words-examples";

/** Turns, in the transform's 45-degree units. */
const HALF_TURN = 4;
const QUARTER_TURN = 2;

export interface ShowcaseTwins {
  readonly types: Record<TypeKind, SequenceData>;
  readonly lines: Record<ReflectionLine, SequenceData>;
}

export async function buildShowcaseTwins(
  base: SequenceData
): Promise<ShowcaseTwins> {
  const [rotated, reflected, topBottom, inverted, rewound] = await Promise.all([
    rotateSequence(base, HALF_TURN),
    mirrorSequence(base),
    flipSequence(base),
    invertSequence(base),
    rewindSequence(base),
  ]);
  const [turnedOneWay, turnedOther] = await Promise.all([
    rotateSequence(reflected, QUARTER_TURN),
    rotateSequence(reflected, -QUARTER_TURN),
  ]);
  const step = base.steps[0]!;
  const lines = {} as Record<ReflectionLine, SequenceData>;
  lines["north-south"] = reflected;
  lines["east-west"] = topBottom;
  for (const turned of [turnedOneWay, turnedOther]) {
    const line = reflectionLineOf(step, turned.steps[0]!);
    if (line) lines[line] = turned;
  }
  return {
    types: {
      rotated,
      reflected,
      swapped: swapHands(base),
      inverted,
      rewound,
    },
    lines,
  };
}

function pair(step: StepData): PairMotions {
  const view = (hand: "left" | "right") => ({
    startLocation: String(step.motions[hand]?.startLocation ?? ""),
    endLocation: String(step.motions[hand]?.endLocation ?? ""),
    motionType: String(step.motions[hand]?.motionType ?? ""),
  });
  return { left: view("left"), right: view("right") };
}

/** The line `twin` reflects `step` across (same hands, same spins), if any. */
export function reflectionLineOf(step: StepData, twin: StepData): ReflectionLine | null {
  const relation = relationsForPair(pair(step), pair(twin)).find(
    (r) => r.components.length === 1 && r.reflectionAxis
  );
  return (relation?.reflectionAxis as ReflectionLine | undefined) ?? null;
}

/**
 * True when `twin` is `step` under `kind`'s change, read with the engine's
 * pair algebra: the simplest relation between them is exactly that change.
 * Reflected here is the left-right line. A Rewound twin instead runs the
 * step backwards, so each hand starts where it ended and ends where it
 * started.
 */
export function isTwinOf(kind: TypeKind, step: StepData, twin: StepData): boolean {
  if (kind === "rewound") {
    return (["left", "right"] as const).every((hand) => {
      const a = step.motions[hand];
      const b = twin.motions[hand];
      return (
        !!a &&
        !!b &&
        a.startLocation === b.endLocation &&
        a.endLocation === b.startLocation
      );
    });
  }
  if (kind === "reflected") return reflectionLineOf(step, twin) === "north-south";
  const simplest = relationsForPair(pair(step), pair(twin)).sort(
    (x, y) => x.priority - y.priority
  )[0];
  if (kind === "rotated") {
    return simplest?.components.join() === "rotated" && simplest.rotation === "180";
  }
  return simplest?.components.join() === kind;
}
