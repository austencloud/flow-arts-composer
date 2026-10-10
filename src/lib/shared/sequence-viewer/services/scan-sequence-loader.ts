import { compressWord } from "#lib/shared/foundation/utils/word-simplifier.js";
import {
  getBaseLetter,
  isDashLetter,
} from "#lib/shared/pictograph/tka-glyph/utils/letter-image-getter.js";

/** Base glyphs required to paint the scan loader's rendered word. */
export function getScanLoaderBaseLetters(word: string): string[] {
  if (!word) return [];

  const seen = new Set<string>();
  for (const segment of compressWord(word)) {
    for (const token of segment.tokens) {
      const base = isDashLetter(token) ? getBaseLetter(token) : token;
      if (base) seen.add(base);
    }
  }

  return [...seen];
}
