import type { CompressedSegment } from "./types.js";

/** Tokenize glyph words without splitting a letter from its dash suffix. */
export function splitWordLetterUnits(word: string): string[] {
  const units: string[] = [];
  const characters = [...word];
  for (let index = 0; index < characters.length; index++) {
    const character = characters[index]!;
    if (/^[a-zA-Z\u0370-\u03FF\u1F00-\u1FFF\u2295]$/.test(character)) {
      if (characters[index + 1] === "-") {
        units.push(`${character}-`);
        index++;
      } else {
        units.push(character);
      }
    }
  }
  return units;
}

export function simplifyRepeatedWord(word: string): string {
  if (!word) return word;
  for (let length = 1; length <= Math.floor(word.length / 2); length++) {
    const pattern = word.slice(0, length);
    if (
      word.length % length === 0 &&
      pattern.repeat(word.length / length) === word
    ) {
      return pattern;
    }
  }

  const tokens = splitWordLetterUnits(word);
  for (
    let groupSize = 1;
    groupSize <= Math.floor(tokens.length / 2);
    groupSize++
  ) {
    if (tokens.length % groupSize !== 0) continue;
    const groups = Array.from(
      { length: tokens.length / groupSize },
      (_, index) =>
        tokens.slice(index * groupSize, (index + 1) * groupSize).join("")
    );
    if (
      groups[0] !== groups[1] &&
      groups.every(
        (group, index) => group === groups[groups.length - 1 - index]
      )
    ) {
      return groups.slice(0, Math.ceil(groups.length / 2)).join("");
    }
  }
  return word;
}

export function compressWord(word: string): CompressedSegment[] {
  if (!word) return [];
  const units = splitWordLetterUnits(word);
  if (!units.length) return [];

  const segments: CompressedSegment[] = [];
  for (let index = 0; index < units.length; ) {
    let bestLength = 0;
    let bestCount = 0;
    for (
      let length = 1;
      length <= Math.floor((units.length - index) / 2);
      length++
    ) {
      const pattern = units.slice(index, index + length);
      let count = 1;
      while (
        index + (count + 1) * length <= units.length &&
        pattern.every(
          (token, offset) => units[index + count * length + offset] === token
        )
      )
        count++;
      const minimumCount = length === 1 ? 4 : 2;
      if (count >= minimumCount && length * count > bestLength * bestCount) {
        bestLength = length;
        bestCount = count;
      }
    }
    if (bestCount >= 2) {
      segments.push({
        tokens: units.slice(index, index + bestLength),
        repeat: bestCount,
      });
      index += bestLength * bestCount;
    } else {
      segments.push({ tokens: [units[index]!], repeat: 1 });
      index++;
    }
  }
  return segments.reduce<CompressedSegment[]>((merged, segment) => {
    const previous = merged.at(-1);
    if (segment.repeat === 1 && previous?.repeat === 1)
      previous.tokens.push(...segment.tokens);
    else merged.push(segment);
    return merged;
  }, []);
}
