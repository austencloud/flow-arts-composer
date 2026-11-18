/**
 * What the right-hand player shows on each play. Each type plays the step
 * twice; Rotated plays a half turn, then a quarter turn; Reflected plays once
 * across each of its four lines.
 */
import { REFLECTION_AXES, TYPE_ORDER, type ReflectionLine, type TypeKind } from "./loop-kinds";

/** Which twin of the step a play shows. */
export type TwinId = "half-turn" | "quarter-turn" | "plain" | ReflectionLine;

export interface Pass {
  readonly kind: TypeKind;
  readonly twin: TwinId;
}

/**
 * One type's plays. Without a confirmed quarter turn, Rotated shows its half
 * turn both times.
 */
export function passesOf(kind: TypeKind, hasQuarter: boolean): Pass[] {
  if (kind === "rotated") {
    return [
      { kind, twin: "half-turn" },
      { kind, twin: hasQuarter ? "quarter-turn" : "half-turn" },
    ];
  }
  if (kind === "reflected") return REFLECTION_AXES.map((twin) => ({ kind, twin }));
  return [
    { kind, twin: "plain" },
    { kind, twin: "plain" },
  ];
}

/** The self-running tour: every type in order, then round again. */
export function tourPasses(hasQuarter: boolean): Pass[] {
  return TYPE_ORDER.flatMap((kind) => passesOf(kind, hasQuarter));
}

/** True for a twin that is a reflection, so its line is drawn. */
export function lineOf(twin: TwinId): ReflectionLine | undefined {
  return (REFLECTION_AXES as readonly string[]).includes(twin)
    ? (twin as ReflectionLine)
    : undefined;
}
