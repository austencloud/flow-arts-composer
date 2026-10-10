/**
 * Pure gating logic for the Rhythm tier in the combo overlay.
 *
 * Given the selected components + rhythm knobs + the target sequence length,
 * decides whether the resulting spec is buildable AND the length actually
 * divides evenly into the seed the user would be authoring. Kept separate
 * from the Svelte overlay so it's testable without a browser.
 */
import type { LOOPComponent } from "#lib/shared/foundation/domain/models/generation/generate-models.js";
import {
  buildLoopSpec,
  expanderMultiplier,
  specHasExpandInversion,
  type LoopRhythm,
} from "./loop-type-utils";

export type RhythmGate =
  | { ok: true; seedLength: number; multiplier: number }
  | { ok: false; reason: string };

export interface FittedLoopRhythm {
  rhythm: LoopRhythm;
  gate: Extract<RhythmGate, { ok: true }>;
  changed: boolean;
}

export function gateRhythm(
  components: Set<LOOPComponent>,
  rhythm: LoopRhythm,
  sequenceLength: number
): RhythmGate {
  const wire = buildLoopSpec(components, rhythm);
  if (!wire)
    return { ok: false, reason: "No LOOP type matches this exact combination" };
  const multiplier = expanderMultiplier(wire);
  if (sequenceLength % multiplier !== 0) {
    return {
      ok: false,
      reason: `${sequenceLength} beats can't split into ${multiplier} equal parts`,
    };
  }
  const seedLength = sequenceLength / multiplier;
  if (seedLength < 2 && specHasExpandInversion(wire)) {
    return {
      ok: false,
      reason: "Too short. A one-step seed has nothing for inversion to flip",
    };
  }
  return { ok: true, seedLength, multiplier };
}

/**
 * Keeps an exact requested sequence length by relaxing only LOOP expansion
 * intervals. Component semantics, inversion mode, and reflection axis stay
 * untouched. Callers can turn LOOP off when no compatible rhythm exists.
 */
export function fitLoopRhythmToLength(
  components: Set<LOOPComponent>,
  rhythm: LoopRhythm,
  sequenceLength: number
): FittedLoopRhythm | null {
  const candidates: LoopRhythm[] = [
    rhythm,
    ...(rhythm.rotationInterval === 4
      ? [{ ...rhythm, rotationInterval: 2 as const }]
      : []),
    ...(rhythm.inversionInterval === 4
      ? [{ ...rhythm, inversionInterval: 2 as const }]
      : []),
    ...(rhythm.rotationInterval === 4 && rhythm.inversionInterval === 4
      ? [
          {
            ...rhythm,
            rotationInterval: 2 as const,
            inversionInterval: 2 as const,
          },
        ]
      : []),
  ];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    const key = JSON.stringify(candidate);
    if (seen.has(key)) continue;
    seen.add(key);

    const gate = gateRhythm(components, candidate, sequenceLength);
    if (!gate.ok) continue;
    return {
      rhythm: candidate,
      gate,
      changed: key !== JSON.stringify(rhythm),
    };
  }

  return null;
}
