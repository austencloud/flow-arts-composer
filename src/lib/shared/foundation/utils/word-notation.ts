/**
 * Skewed-frame notation for TKA words.
 *
 * A beat whose hands sit on mixed grid points (one cardinal, one intercardinal)
 * is written inside braces, and consecutive skewed beats share one pair:
 * "A{STS}GA". The braces are part of the stored word. Anything that indexes,
 * sorts, or searches a word strips them with stripWordNotation; anything that
 * needs the beats parses them with parseWordNotation.
 */

export interface WordUnit {
  readonly letter: string;
  readonly skewed: boolean;
}

export const SKEW_SPAN_OPEN = "{";
export const SKEW_SPAN_CLOSE = "}";

/** Same character class the word tokenizers use: Latin, Greek, and ⊕. */
const LETTER_CHARACTER = /^[a-zA-Z\u0370-\u03FF\u1F00-\u1FFF\u2295]$/;

/** Matches both brace characters, built from the exported constants so they stay used. */
const SKEW_SPAN_PATTERN = new RegExp(`[${SKEW_SPAN_OPEN}${SKEW_SPAN_CLOSE}]`, "g");

/** Letters with their skew flag. A trailing dash belongs to its letter. */
export function parseWordNotation(word: string | null | undefined): WordUnit[] {
  const units: WordUnit[] = [];
  const characters = [...(word ?? "")];
  let skewed = false;
  for (let index = 0; index < characters.length; index++) {
    const character = characters[index]!;
    if (character === SKEW_SPAN_OPEN) {
      skewed = true;
      continue;
    }
    if (character === SKEW_SPAN_CLOSE) {
      skewed = false;
      continue;
    }
    if (!LETTER_CHARACTER.test(character)) continue;
    if (characters[index + 1] === "-") {
      units.push({ letter: `${character}-`, skewed });
      index++;
    } else {
      units.push({ letter: character, skewed });
    }
  }
  return units;
}

/** Joins units, wrapping every maximal run of skewed units in one brace pair. */
export function renderWordNotation(units: readonly WordUnit[]): string {
  let word = "";
  let open = false;
  for (const unit of units) {
    if (unit.skewed && !open) {
      word += SKEW_SPAN_OPEN;
      open = true;
    } else if (!unit.skewed && open) {
      word += SKEW_SPAN_CLOSE;
      open = false;
    }
    word += unit.letter;
  }
  if (open) word += SKEW_SPAN_CLOSE;
  return word;
}

/** The word without its skew braces, for indexing, sorting, and searching. */
export function stripWordNotation(word: string | null | undefined): string {
  if (word == null) return "";
  if (!word.includes(SKEW_SPAN_OPEN) && !word.includes(SKEW_SPAN_CLOSE)) return word;
  return word.replace(SKEW_SPAN_PATTERN, "");
}

/**
 * Rotates a unit array left by `offset` positions, wrapping around. Mirrors
 * the "doubled string, indexOf" rotation convention used elsewhere to find
 * an offset, so a letter-based offset from that convention can be applied
 * directly to the unit array a word was parsed into.
 */
export function rotateWordUnits(
  units: readonly WordUnit[],
  offset: number
): WordUnit[] {
  if (units.length === 0) return [];
  const normalized = ((offset % units.length) + units.length) % units.length;
  return [...units.slice(normalized), ...units.slice(0, normalized)];
}

/**
 * The smallest rotation offset that turns wordA's units into wordB's, matching
 * both letter and skew flag at every position; null when the unit counts
 * differ or no rotation matches. A letter-only rotation match with a
 * mismatched skew mask (e.g. "STS" vs "{STS}") does not count: the skew span
 * is part of the sequence identity, not just its letters.
 *
 * This searches unit rotations directly, never a character offset, so the
 * result is always a valid unit rotation, dashes included ("AW-BW-" vs
 * "W-BW-A" correctly returns 1).
 *
 * The residual caveat is unlettered beats, not dashes: parseWordNotation
 * emits no unit for a beat with no letter (deriveWordFromBeats documents
 * that a skew span merges across it), so a sequence with an unlettered beat
 * has units.length < steps.length, and this offset is then a unit offset,
 * not a step offset for that sequence. sequence-equivalence-detector.ts's
 * verifyCircularRotation takes its loop length from seqA.steps.length alone,
 * so it must not receive this offset unless neither sequence has an
 * unlettered beat.
 */
export function findWordUnitsRotationOffset(
  wordA: string | null | undefined,
  wordB: string | null | undefined
): number | null {
  const unitsA = parseWordNotation(wordA);
  const unitsB = parseWordNotation(wordB);
  if (unitsA.length !== unitsB.length) return null;
  if (unitsA.length === 0) return 0;

  for (let offset = 0; offset < unitsA.length; offset++) {
    const rotated = rotateWordUnits(unitsA, offset);
    if (
      rotated.every(
        (unit, index) =>
          unit.letter === unitsB[index]!.letter &&
          unit.skewed === unitsB[index]!.skewed
      )
    ) {
      return offset;
    }
  }
  return null;
}

/**
 * True when wordB is some rotation of wordA where both the letters and
 * which of them are skewed line up. See findWordUnitsRotationOffset for the
 * matching rule; this is just its not-null check.
 */
export function areWordUnitsCircularEquivalent(
  wordA: string | null | undefined,
  wordB: string | null | undefined
): boolean {
  return findWordUnitsRotationOffset(wordA, wordB) !== null;
}
