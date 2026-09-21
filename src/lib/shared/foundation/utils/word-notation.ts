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
  return (word ?? "").replace(SKEW_SPAN_PATTERN, "");
}
