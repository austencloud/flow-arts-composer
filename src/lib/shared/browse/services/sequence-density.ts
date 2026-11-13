/**
 * A sequence's mandala density for sorting and sectioning the library.
 *
 * Runs the mandala geometry on the sequence's steps and measures it (see
 * `mandala-density.ts`). A sort pass asks for every sequence in the pool, so
 * each answer is kept by sequence id, word and step count; a later pass pays
 * nothing. Each answer carries the mandala's coverage, its key and how many
 * spaces its lines enclose, all from one geometry. The mandala index (`mandala-index.svelte.ts`) fills the same cache
 * in idle slices and from IndexedDB, and the Mandala filter reads it with
 * `peekMandalaKey`, which never measures.
 */
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { calculate } from "#lib/shared/mandala/services/mandala-geometry-calculator.js";
import {
  EMPTY_MANDALA_SIGNATURE,
  mandalaSignature,
  type MandalaSignature,
} from "#lib/shared/mandala/services/mandala-density.js";

/**
 * Bumped whenever the measure changes (grid size, marking rule, key hash, a
 * new field), so signatures saved by an older measure are ignored and
 * rewritten. Version 2 added enclosed spaces; the key is unchanged.
 */
export const MANDALA_MEASURE_VERSION = 2;

const MAX_CACHE = 4000;
const cache = new Map<string, MandalaSignature>();

/** The cache key of a sequence, or undefined when it has no steps to measure. */
export function mandalaCacheKey(sequence: SequenceData): string | undefined {
  const steps = sequence.steps ?? [];
  if (steps.length === 0) return undefined;
  return `${sequence.id}|${sequence.word ?? ""}|${steps.length}`;
}

function remember(key: string, signature: MandalaSignature): void {
  if (cache.size >= MAX_CACHE && !cache.has(key)) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, signature);
}

export function resolveMandalaSignature(sequence: SequenceData): MandalaSignature {
  const key = mandalaCacheKey(sequence);
  if (!key) return EMPTY_MANDALA_SIGNATURE;

  const cached = cache.get(key);
  if (cached) {
    cache.delete(key);
    cache.set(key, cached);
    return cached;
  }

  const signature = mandalaSignature(calculate(sequence.steps ?? []));
  remember(key, signature);
  return signature;
}

/** The remembered signature, or undefined; never measures. */
export function peekMandalaSignature(sequence: SequenceData): MandalaSignature | undefined {
  const key = mandalaCacheKey(sequence);
  return key ? cache.get(key) : undefined;
}

/** The remembered key, or undefined; never measures. */
export function peekMandalaKey(sequence: SequenceData): string | undefined {
  return peekMandalaSignature(sequence)?.key;
}

/** Remember a signature measured elsewhere (a saved row, another tab's work). */
export function seedMandalaSignature(sequence: SequenceData, signature: MandalaSignature): void {
  const key = mandalaCacheKey(sequence);
  if (key) remember(key, signature);
}

/** Share of the mandala's square its lines cover, 0 to 1. */
export function resolveMandalaDensity(sequence: SequenceData): number {
  return resolveMandalaSignature(sequence).coverage;
}

/** How many spaces the sequence's mandala encloses. */
export function resolveMandalaSpaces(sequence: SequenceData): number {
  return resolveMandalaSignature(sequence).spaces;
}

export type MandalaSectionId = "simple" | "busier" | "complex";

export interface MandalaSection {
  id: MandalaSectionId;
  label: string;
  /** Enclosed spaces below this belong to the section. */
  below: number;
}

/**
 * The library's sections when sorted by mandala: roughly thirds of the
 * community pool by enclosed spaces (2026-11-11). The adjective sits on the
 * mandala, never on the sequence. English only, as the bands before them.
 */
export const MANDALA_SECTIONS: readonly MandalaSection[] = [
  { id: "simple", label: "Simple mandala", below: 30 },
  { id: "busier", label: "Busier mandala", below: 70 },
  { id: "complex", label: "Complex mandala", below: Number.POSITIVE_INFINITY },
];

export function mandalaSectionOf(spaces: number): MandalaSection {
  return (
    MANDALA_SECTIONS.find((section) => spaces < section.below) ??
    MANDALA_SECTIONS[MANDALA_SECTIONS.length - 1]!
  );
}

export function mandalaSectionById(id: string): MandalaSection | undefined {
  return MANDALA_SECTIONS.find((section) => section.id === id || section.label === id);
}

/**
 * How busy a sequence's mandala is, on a scale of six, by the spaces its
 * lines enclose. The cuts sit where the pictures change, not at equal shares:
 * drawn as ten equal levels on 2026-11-12 (1,578 sequences, spaces 0 to 157),
 * the simple end changed look at every step while everything past about 45
 * spaces read as one dense rosette. So four levels for the simple end (bare
 * lines, crosses in circles, open petals, layered rosettes) and two for the
 * dense end: 81, 203, 170, 166, 469 and 489 sequences. Austen chose this
 * split ("Six, by look"). The cuts are fixed, not worked out per pool, so a
 * saved filter for level 3 means the same mandalas on every visit and for
 * every source.
 */
export const MANDALA_LEVEL_CUTS: readonly number[] = [9, 17, 29, 45, 77];
export const MANDALA_LEVEL_COUNT = MANDALA_LEVEL_CUTS.length + 1;

/** The level, 1 (simplest) to MANDALA_LEVEL_COUNT, for a count of spaces. */
export function mandalaLevelOf(spaces: number): number {
  const below = MANDALA_LEVEL_CUTS.findIndex((cut) => spaces < cut);
  return below === -1 ? MANDALA_LEVEL_COUNT : below + 1;
}

const LEVEL_VALUE_PREFIX = "level-";

/** The Mandala filter's value for a level. A family value is
 *  `<shape key>~<sequence id>`, so the two never read as each other. */
export function mandalaLevelValue(level: number): string {
  return `${LEVEL_VALUE_PREFIX}${level}`;
}

/** The level a Mandala filter value names, or null for a family value. */
export function parseMandalaLevelValue(value: unknown): number | null {
  if (typeof value !== "string" || !value.startsWith(LEVEL_VALUE_PREFIX)) return null;
  const level = Number(value.slice(LEVEL_VALUE_PREFIX.length));
  return Number.isInteger(level) && level >= 1 && level <= MANDALA_LEVEL_COUNT
    ? level
    : null;
}

/** Coverage as "14%" for titles and accessible names. */
export function formatDensity(coverage: number): string {
  return `${Math.round(coverage * 100)}%`;
}
