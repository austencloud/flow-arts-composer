/**
 * The Cinder Court states three forms of fire, cumulatively: each court adds a
 * voice rather than replacing the previous one. The performer carries the voice
 * its own court adds, so every mouth announces exactly one new thing; the
 * accumulated layers burn at the court perimeter.
 *
 * Design: docs/superpowers/specs/first-fire-cinder-court/2026-08-09-first-fire-gate3-visual-target-design.md
 */
import type { FirstFireShrineId } from "#lib/features/museum/data/first-fire-procession-plan.js";

export interface FirstFireCourtVoice {
  shrineId: FirstFireShrineId;
  /** Effect registry id this court introduces. */
  addsEffectId: string;
  /** What the visitor is meant to feel at this mouth. */
  intent: string;
}

export const FIRST_FIRE_COURT_VOCABULARY: readonly FirstFireCourtVoice[] = [
  {
    shrineId: "dj",
    addsEffectId: "charcoal",
    intent: "Coal is the hotter fire. Too close to something lethal.",
  },
  {
    shrineId: "ek",
    addsEffectId: "fire",
    intent: "Release. Fire gains a shape instead of only a temperature.",
  },
  {
    shrineId: "fl",
    addsEffectId: "zap",
    intent: "The full instrument, and the only fire that arrives from outside.",
  },
] as const;

export function firstFireCourtEffectId(shrineId: FirstFireShrineId): string {
  const voice = FIRST_FIRE_COURT_VOCABULARY.find(
    (entry) => entry.shrineId === shrineId
  );
  return voice?.addsEffectId ?? "charcoal";
}

/** Every voice burning by the time the visitor reaches this court. */
export function firstFireCourtLayers(
  shrineId: FirstFireShrineId
): readonly string[] {
  const index = FIRST_FIRE_COURT_VOCABULARY.findIndex(
    (entry) => entry.shrineId === shrineId
  );
  if (index < 0) return [];
  return FIRST_FIRE_COURT_VOCABULARY.slice(0, index + 1).map(
    (entry) => entry.addsEffectId
  );
}
