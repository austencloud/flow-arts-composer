/**
 * A sequence's mandala density for sorting and sectioning the library.
 *
 * Runs the mandala geometry on the sequence's steps and measures it (see
 * `mandala-density.ts`). A sort pass asks for every sequence in the pool, so
 * each answer is kept by sequence id, word and step count; a later pass pays
 * nothing.
 */
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { calculate } from "#lib/shared/mandala/services/mandala-geometry-calculator.js";
import {
  EMPTY_MANDALA_SIGNATURE,
  mandalaSignature,
  type MandalaSignature,
} from "#lib/shared/mandala/services/mandala-density.js";

const MAX_CACHE = 4000;
const cache = new Map<string, MandalaSignature>();

export function resolveMandalaSignature(sequence: SequenceData): MandalaSignature {
  const steps = sequence.steps ?? [];
  if (steps.length === 0) return EMPTY_MANDALA_SIGNATURE;

  const key = `${sequence.id}|${sequence.word ?? ""}|${steps.length}`;
  const cached = cache.get(key);
  if (cached) {
    cache.delete(key);
    cache.set(key, cached);
    return cached;
  }

  const signature = mandalaSignature(calculate(steps));
  if (cache.size >= MAX_CACHE) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, signature);
  return signature;
}

/** Share of the mandala's square its lines cover, 0 to 1. */
export function resolveMandalaDensity(sequence: SequenceData): number {
  return resolveMandalaSignature(sequence).coverage;
}

export type DensityBandId = "sparse" | "medium" | "dense";

export interface DensityBand {
  id: DensityBandId;
  label: string;
  /** Coverage below this belongs to the band. */
  below: number;
}

/**
 * The library's sections when sorted by density. The adjective sits on the
 * mandala, never on the sequence. Thresholds come from the 36 showcase
 * mandalas' spread on 2026-10-20 (16% to 64% coverage): the sparsest third
 * sits under the first line and the densest third over the second.
 */
export const DENSITY_BANDS: readonly DensityBand[] = [
  { id: "sparse", label: "Sparse mandala", below: 0.31 },
  { id: "medium", label: "Medium mandala", below: 0.38 },
  { id: "dense", label: "Dense mandala", below: Number.POSITIVE_INFINITY },
];

export function densityBandOf(coverage: number): DensityBand {
  return DENSITY_BANDS.find((band) => coverage < band.below) ?? DENSITY_BANDS[DENSITY_BANDS.length - 1]!;
}

export function densityBandById(id: string): DensityBand | undefined {
  return DENSITY_BANDS.find((band) => band.id === id || band.label === id);
}

/** Coverage as "14%" for titles and accessible names. */
export function formatDensity(coverage: number): string {
  return `${Math.round(coverage * 100)}%`;
}
