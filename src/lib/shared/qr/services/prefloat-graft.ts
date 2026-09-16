/**
 * Graft mint-time testimony from a shortcode record's embedded sequence data
 * onto a blob-decoded sequence: float prefloat pairs, and beat letters the
 * wire never carried.
 *
 * Why: the legacy wire formats physically dropped `prefloatMotionType` /
 * `prefloatRotationDirection` (the encoder wrote the float's own noRotation
 * into the rotation slot), so blob-decoded floats carry no prefloat pair and
 * derive no letter — and the wire carries no letter column at all, so the
 * runtime lookup must re-derive every beat, which for prefloat-less floats
 * degrades to a same-family guess (proven ~50% wrong against mint witnesses,
 * parity-repair spec round 4). Records minted in the durability-embed era —
 * and the quarantine-recovery restores of 2026-07-27 — carry the mint truth
 * in `sequenceData`, but that raw JSON is NOT renderable (it skips the
 * decoder's normalization, which breaks pictographs and orientation
 * continuity). The blob-decoded steps therefore stay the base and ONLY the
 * prefloat pair and the stored letter are copied over.
 *
 * Grafting is strictly conservative:
 * - a prefloat pair is copied only when the decoded motion is a
 *   prefloat-less float, the embedded motion at the same content position is
 *   a float over the SAME start→end path, and the embedded pair is real
 *   testimony (a rotation other than noRotation — the fabricated pairs the
 *   legacy decoder used to manufacture are prefloat type + literal
 *   noRotation, and must never propagate);
 * - a letter is copied only when the decoded step has none, the embedded
 *   step carries one, and BOTH channels' motion identity (type + start→end)
 *   matches between the two steps.
 */
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import {
  HandSide,
  MotionType,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";

type LooseMotion = {
  motionType?: unknown;
  startLocation?: unknown;
  endLocation?: unknown;
  prefloatMotionType?: unknown;
  prefloatRotationDirection?: unknown;
};

type LooseStep = {
  letter?: unknown;
  motions?: Partial<Record<HandSide, LooseMotion>>;
};

function isRealPrefloat(motion: LooseMotion): boolean {
  return (
    typeof motion.prefloatMotionType === "string" &&
    typeof motion.prefloatRotationDirection === "string" &&
    motion.prefloatRotationDirection !== RotationDirection.NO_ROTATION
  );
}

function isPrefloatlessFloat(motion: LooseMotion): boolean {
  return (
    motion.motionType === MotionType.FLOAT &&
    motion.prefloatMotionType == null &&
    motion.prefloatRotationDirection == null
  );
}

/** Both channels agree on motion identity (type + start→end path) — the
 *  step-level alignment proof required before trusting the embedded letter. */
function stepMotionsMatch(dec: LooseStep, emb: LooseStep): boolean {
  for (const color of [HandSide.LEFT, HandSide.RIGHT]) {
    const d = dec.motions?.[color];
    const e = emb.motions?.[color];
    if (!d && !e) continue;
    if (!d || !e) return false;
    if (
      d.motionType !== e.motionType ||
      d.startLocation !== e.startLocation ||
      d.endLocation !== e.endLocation
    )
      return false;
  }
  return true;
}

/**
 * Steps arrays may or may not lead with a start-placement entry depending on
 * era and channel. Content beats are the shared tail, so align from the end:
 * a one-entry length difference means one side carries a leading start step.
 * Anything further apart is a different sequence — no graft.
 */
function alignedTailOffset(a: number, b: number): number | null {
  const diff = a - b;
  return diff >= 0 && diff <= 1 ? diff : null;
}

export function graftPrefloatFromEmbedded<T extends SequenceData>(
  decoded: T,
  embedded: Record<string, unknown> | undefined
): T {
  const embeddedSteps = (embedded as { steps?: unknown } | undefined)?.steps;
  const decodedSteps = decoded.steps as unknown as LooseStep[] | undefined;
  if (!Array.isArray(embeddedSteps) || !decodedSteps?.length) return decoded;

  const embSteps = embeddedSteps as LooseStep[];
  const decOffset = alignedTailOffset(decodedSteps.length, embSteps.length);
  const embOffset = alignedTailOffset(embSteps.length, decodedSteps.length);
  if (decOffset === null && embOffset === null) return decoded;
  const tail = Math.min(decodedSteps.length, embSteps.length);

  for (let i = 0; i < tail; i++) {
    const dec = decodedSteps[decodedSteps.length - tail + i];
    const emb = embSteps[embSteps.length - tail + i];
    if (!dec || !emb) continue;
    for (const color of [HandSide.LEFT, HandSide.RIGHT]) {
      const decMotion = dec.motions?.[color];
      const embMotion = emb.motions?.[color];
      if (!decMotion || !embMotion) continue;
      if (!isPrefloatlessFloat(decMotion)) continue;
      if (embMotion.motionType !== MotionType.FLOAT) continue;
      if (
        embMotion.startLocation !== decMotion.startLocation ||
        embMotion.endLocation !== decMotion.endLocation
      )
        continue;
      if (!isRealPrefloat(embMotion)) continue;
      decMotion.prefloatMotionType = embMotion.prefloatMotionType;
      decMotion.prefloatRotationDirection = embMotion.prefloatRotationDirection;
    }

    const decLetter = dec.letter;
    const embLetter = emb.letter;
    if (
      (typeof decLetter !== "string" || decLetter.length === 0) &&
      typeof embLetter === "string" &&
      embLetter.length > 0 &&
      stepMotionsMatch(dec, emb)
    ) {
      dec.letter = embLetter;
    }
  }
  return decoded;
}
