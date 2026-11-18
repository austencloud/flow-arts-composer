/**
 * The step put through each change, with the same transforms Create's Mirror,
 * Flip, Rotate, Swap, Invert and Rewind buttons use, plus its quarter turn and
 * its four reflections. The engine's pair algebra confirms each one.
 *
 * Create has buttons for two reflection lines (Mirror: left-right, Flip:
 * top-bottom). A reflection followed by a quarter turn is the reflection
 * across the line halfway between, so the two diagonals are Mirror then a
 * quarter turn either way.
 *
 * Every twin gets its own id: the player reloads only when the id changes.
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
import { REFLECTION_AXES, TYPE_ORDER, type ReflectionLine, type TypeKind } from "./loop-kinds";

/** Turns, in the transform's 45-degree units. */
const HALF_TURN = 4;
const QUARTER_TURN = 2;

export interface ShowcaseTwins {
  readonly types: Record<TypeKind, SequenceData>;
  readonly lines: Record<ReflectionLine, SequenceData>;
  readonly quarter: SequenceData;
}

function named(sequence: SequenceData, id: string): SequenceData {
  return { ...sequence, id: `loop-words-${id}`, name: `loop-words-${id}` };
}

export async function buildShowcaseTwins(
  base: SequenceData
): Promise<ShowcaseTwins> {
  const [rotated, quarter, reflected, topBottom, inverted, rewound] =
    await Promise.all([
      rotateSequence(base, HALF_TURN),
      rotateSequence(base, QUARTER_TURN),
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
  lines["north-south"] = named(reflected, "north-south");
  lines["east-west"] = named(topBottom, "east-west");
  for (const turned of [turnedOneWay, turnedOther]) {
    const line = reflectionLineOf(step, turned.steps[0]!);
    if (line) lines[line] = named(turned, line);
  }
  return {
    types: {
      rotated: named(rotated, "rotated"),
      reflected: lines["north-south"],
      swapped: named(swapHands(base), "swapped"),
      inverted: named(inverted, "inverted"),
      rewound: named(rewound, "rewound"),
    },
    lines,
    quarter: named(quarter, "quarter"),
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

function simplestRelation(step: StepData, twin: StepData) {
  return relationsForPair(pair(step), pair(twin)).sort(
    (x, y) => x.priority - y.priority
  )[0];
}

/** The line `twin` reflects `step` across (same hands, same spins), if any. */
export function reflectionLineOf(step: StepData, twin: StepData): ReflectionLine | null {
  const relation = relationsForPair(pair(step), pair(twin)).find(
    (r) => r.components.length === 1 && r.reflectionAxis
  );
  return (relation?.reflectionAxis as ReflectionLine | undefined) ?? null;
}

/** True when the simplest relation from `step` to `twin` is a quarter turn. */
export function isQuarterTurnOf(step: StepData, twin: StepData): boolean {
  const simplest = simplestRelation(step, twin);
  return (
    simplest?.components.join() === "rotated" &&
    (simplest.rotation === "90cw" || simplest.rotation === "90ccw")
  );
}

/**
 * True when `twin` is `step` under `kind`'s change, read with the engine's
 * pair algebra: the simplest relation between them is exactly that change.
 * Reflected here is the left-right line and Rotated the half turn. A Rewound
 * twin instead runs the step backwards, so each hand starts where it ended and
 * ends where it started.
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
  const simplest = simplestRelation(step, twin);
  if (kind === "rotated") {
    return simplest?.components.join() === "rotated" && simplest.rotation === "180";
  }
  return simplest?.components.join() === kind;
}

/** Every twin that is not its change, by name; empty when all are. */
export function wrongTwins(step: StepData, built: ShowcaseTwins): string[] {
  const wrong: string[] = TYPE_ORDER.filter(
    (kind) => !isTwinOf(kind, step, built.types[kind].steps[0]!)
  );
  for (const axis of REFLECTION_AXES) {
    const twin = built.lines[axis]?.steps[0];
    if (!twin || reflectionLineOf(step, twin) !== axis) wrong.push(axis);
  }
  if (!isQuarterTurnOf(step, built.quarter.steps[0]!)) wrong.push("quarter");
  return wrong;
}
