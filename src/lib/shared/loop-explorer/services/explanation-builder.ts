/**
 * Loop Explorer — Explanation Builder
 *
 * Structured explanation for the two-pane linked-explanation UI: an intro
 * sentence (built ON `loop-explanation-text-generator.ts`, not forked),
 * per-relation citation sentences (from `relation-extractor.ts`'s step-pair
 * tuples), and a closing length-math line (`seed × multiplier = length`,
 * using the canonical `expanderMultiplier`).
 *
 * Terminology guard: rotation slices are ALWAYS "180°"/"90°"/"halved"/
 * "quartered" — never "turns" (reserved for prop/body turns, tka-domain.md).
 * This module contains no "turn" phrasing; a grep of its output strings
 * covers the guard (see explanation-builder.test.ts).
 */

import type { LOOPComponent } from "#lib/shared/foundation/domain/models/generation/generate-models.js";
import { generateExplanationText } from "#lib/features/create/generate/shared/services/loop-explanation-text-generator.js";
import { expanderMultiplier } from "#lib/shared/create/services/loop-type-utils.js";
import type { LOOPSpecWire, PairComponentId, RotationAngle } from "@tka/sequence-engine/loop";
import type { StepPairRelation } from "./relation-extractor";
import type { LoopSlice } from "../domain/legality";

export interface LoopExplanation {
  /** What the selection means, reused from `generateExplanationText`. */
  readonly intro: string;
  /** One sentence per step-pair relation, index-aligned with `relations`. */
  readonly citations: readonly string[];
  readonly relations: readonly StepPairRelation[];
  /** "seed × multiplier = length" line. */
  readonly lengthMath: string;
}

const TRANSFORM_VERB: Partial<Record<PairComponentId, string>> = {
  rotated: "rotated",
  mirrored: "mirrored",
  flipped: "flipped",
  swapped: "swapped",
  inverted: "inverted",
};

export interface BuildExplanationParams {
  readonly components: Set<LOOPComponent>;
  readonly slice: LoopSlice;
  readonly relations: readonly StepPairRelation[];
  readonly seedLength: number;
  readonly totalLength: number;
  readonly wire?: LOOPSpecWire;
}

export function buildExplanation(params: BuildExplanationParams): LoopExplanation {
  const intro = generateExplanationText(params.components);
  const citations = params.relations.map((r) => citationSentence(r));

  const multiplier = params.wire
    ? expanderMultiplier(params.wire)
    : params.seedLength > 0
      ? Math.round(params.totalLength / params.seedLength)
      : 1;
  const lengthMath = `${params.seedLength} × ${multiplier} = ${params.totalLength} steps.`;

  return { intro, citations, relations: params.relations, lengthMath };
}

function citationSentence(relation: StepPairRelation): string {
  if (relation.transform.length === 0) {
    return `Step ${relation.stepB} repeats step ${relation.stepA}.`;
  }

  const verbs = relation.transform
    .map((t) => TRANSFORM_VERB[t])
    .filter((v): v is string => Boolean(v));

  if (verbs.length === 0) {
    return `Step ${relation.stepB} relates to step ${relation.stepA}.`;
  }

  const rotationSuffix = relation.rotation ? ` ${rotationLabel(relation.rotation)}` : "";
  return `Step ${relation.stepB} = step ${relation.stepA} ${joinVerbs(verbs)}${rotationSuffix}.`;
}

function joinVerbs(verbs: readonly string[]): string {
  if (verbs.length === 1) return verbs[0]!;
  if (verbs.length === 2) return `${verbs[0]} and ${verbs[1]}`;
  return `${verbs.slice(0, -1).join(", ")}, and ${verbs[verbs.length - 1]}`;
}

/** "180°" / "90° clockwise" / "90° counterclockwise" — never "turns". */
function rotationLabel(angle: RotationAngle): string {
  switch (angle) {
    case "180":
      return "180°";
    case "90cw":
      return "90° clockwise";
    case "90ccw":
      return "90° counterclockwise";
    default:
      return "";
  }
}
