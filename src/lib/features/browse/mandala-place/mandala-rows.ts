/**
 * The rows of one mandala's page: every sequence that draws it, easiest level
 * first, then shorter, then by word (id breaks the last ties so the order
 * never shuffles). Rows that share a displayed word are numbered so the page
 * can tell them apart.
 */

import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { deriveWord } from "#lib/shared/foundation/services/word-deriver.js";
import { simplifyRepeatedWord } from "#lib/shared/foundation/utils/word-simplifier.js";
import { resolveDifficultyLevel } from "#lib/shared/browse/services/browse-sorter.js";
import { galleryStepCount } from "#lib/shared/browse/services/gallery-render-input.js";

export interface MandalaRow {
  sequence: SequenceData;
  /** The word as the sequence card shows it. */
  word: string;
  /** The card's level (1 to 3). */
  level: number;
  /** Steps, as the card counts them. */
  length: number;
  /** 1..n among rows sharing `word`; null when the word is unique. */
  version: number | null;
}

export function mandalaRows(sequences: readonly SequenceData[]): MandalaRow[] {
  const rows = sequences.map(
    (sequence): MandalaRow => ({
      sequence,
      word: simplifyRepeatedWord(deriveWord(sequence)),
      level: resolveDifficultyLevel(sequence),
      length: galleryStepCount(sequence),
      version: null,
    })
  );
  rows.sort(
    (a, b) =>
      a.level - b.level ||
      a.length - b.length ||
      a.word.localeCompare(b.word) ||
      (a.sequence.id < b.sequence.id ? -1 : a.sequence.id > b.sequence.id ? 1 : 0)
  );

  const totals = new Map<string, number>();
  for (const row of rows) totals.set(row.word, (totals.get(row.word) ?? 0) + 1);
  const seen = new Map<string, number>();
  for (const row of rows) {
    if ((totals.get(row.word) ?? 0) < 2) continue;
    const n = (seen.get(row.word) ?? 0) + 1;
    seen.set(row.word, n);
    row.version = n;
  }
  return rows;
}
