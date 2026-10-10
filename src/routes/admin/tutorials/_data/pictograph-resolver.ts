/**
 * Resolves a tutorial script's PictographPick (letter + variationIndex) to
 * real PictographData, using the same CSV-backed source as the rest of the
 * app (letterQueryHandler). One shared load per session, grouped by letter
 * so a script can page through a letter's variations.
 *
 * Failure mode: letter has no CSV match → caller falls back to a small
 * placeholder box instead of crashing (tutorial content sometimes mentions
 * letters that don't yet resolve — see the parity test / build report).
 */
import { letterQueryHandler } from "#lib/shared/pictograph/tka-glyph/services/letter-query-handler.js";
import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";

let byLetter: Promise<Map<string, PictographData[]>> | null = null;

function loadAll(): Promise<Map<string, PictographData[]>> {
  byLetter ??= letterQueryHandler
    .getAllPictographVariations(GridMode.DIAMOND)
    .then((all) => {
      const map = new Map<string, PictographData[]>();
      for (const picto of all) {
        const key = picto.letter ? String(picto.letter) : null;
        if (!key) continue;
        const bucket = map.get(key);
        if (bucket) bucket.push(picto);
        else map.set(key, [picto]);
      }
      return map;
    })
    .catch(() => new Map<string, PictographData[]>());
  return byLetter;
}

/** All CSV variations for one letter (empty array if the letter has no match). */
export async function getLetterVariations(letter: string): Promise<PictographData[]> {
  const map = await loadAll();
  return map.get(letter) ?? map.get(letter.toUpperCase()) ?? [];
}

/** Resolve one pick to a specific variation, clamping the index into range. */
export async function resolvePick(
  letter: string,
  variationIndex: number
): Promise<PictographData | null> {
  const variations = await getLetterVariations(letter);
  if (variations.length === 0) return null;
  const clamped = Math.min(Math.max(variationIndex, 0), variations.length - 1);
  return variations[clamped] ?? null;
}
