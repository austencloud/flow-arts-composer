import { tokenizeGlyphWord } from "@tka/render-composition";

/**
 * Lighting one letter of a titles clip's name: while the performer does a
 * move, that move's letter is at full strength and the others are dim. The
 * name can be drawn shortened when it repeats ("ABAB" drawn "AB"), so a move
 * lights the letter it lands on in the shortened name.
 */

/** How strong an unlit letter draws. */
export const TITLE_LIT_DIM = 0.2;
/** Seconds one letter takes to hand the light to the next. */
export const TITLE_LIT_FADE_SECONDS = 0.15;

/** The letters a name draws, in order: skew braces draw nothing. */
export function drawnTitleLetters(word: string): string[] {
  return tokenizeGlyphWord(word).filter(
    (token) => token !== "{" && token !== "}"
  );
}

/**
 * Which drawn letter move `move` (1..N, as the sequence clock counts it)
 * lights, or null when none does: the opening pose, a move with no letter, or
 * a drawn name that is not the sequence's letters. `beatLetters` holds each
 * move's letter, in order.
 */
export function drawnLetterForMove(
  move: number,
  beatLetters: readonly (string | null | undefined)[],
  drawn: readonly string[]
): number | null {
  if (!Number.isInteger(move) || move < 1 || move > beatLetters.length)
    return null;
  if (!beatLetters[move - 1] || drawn.length === 0) return null;
  // The move's place in the full word, counting only moves with a letter.
  const full: string[] = [];
  let index = -1;
  beatLetters.forEach((letter, beat) => {
    if (!letter) return;
    if (beat === move - 1) index = full.length;
    full.push(letter);
  });
  const matches = (map: (i: number) => number) =>
    full.every((letter, i) => drawn[map(i)] === letter);

  // Drawn whole, or one repeat of a word that repeats ("ABCABC" drawn "ABC").
  const period = drawn.length;
  if (full.length % period === 0 && matches((i) => i % period))
    return index % period;

  // A mirrored word drawn as its first half ("ABBA" drawn "AB"): groups of
  // letters read back in reverse order after the middle.
  for (let size = 1; size <= Math.floor(full.length / 2); size++) {
    if (full.length % size !== 0) continue;
    const groups = full.length / size;
    if (Math.ceil(groups / 2) * size !== drawn.length) continue;
    const mirrored = (i: number) => {
      const group = Math.floor(i / size);
      return Math.min(group, groups - 1 - group) * size + (i % size);
    };
    if (matches(mirrored)) return mirrored(index);
  }
  return null;
}

/** What the sequence clock says now, as the painter has followed it. */
export interface TitleLitMoment {
  /** The drawn letter being performed, or null for none. */
  letter: number | null;
  /** The drawn letter lit before it, or null for none. */
  previous: number | null;
  /** Seconds since `letter` took over from `previous`. */
  secondsSinceChange: number;
}

function target(count: number, letter: number | null): number[] {
  return Array.from({ length: count }, (_, i) =>
    letter === null || i === letter ? 1 : TITLE_LIT_DIM
  );
}

function blend(from: number[], to: number[], share: number): number[] {
  const t = Math.min(1, Math.max(0, share));
  if (t === 1) return to;
  if (t === 0) return from;
  return from.map((value, i) => value + (to[i]! - value) * t);
}

/**
 * Each drawn letter's strength, 0..1, at post `seconds`. Outside the lit span
 * every letter is full; going into it, and out of it, the name fades between
 * all full and one lit over the fade time, as it does from one letter to the
 * next inside it.
 */
export function titleLetterStrengths(
  count: number,
  seconds: number,
  lit: { from: number; to: number } | null | undefined,
  moment: TitleLitMoment
): number[] {
  const full = target(count, null);
  if (!lit || count === 0 || seconds < lit.from) return full;
  const now = target(count, moment.letter);
  if (seconds >= lit.to) {
    return blend(now, full, (seconds - lit.to) / TITLE_LIT_FADE_SECONDS);
  }
  const intoSpan = seconds - lit.from;
  // A change from before the span started fades in from all full.
  const fromSpanStart = intoSpan <= moment.secondsSinceChange;
  const before = fromSpanStart ? full : target(count, moment.previous);
  const since = fromSpanStart ? intoSpan : moment.secondsSinceChange;
  return blend(before, now, since / TITLE_LIT_FADE_SECONDS);
}

/** A gap in the post clock larger than this is a seek, not playback. */
const SEEK_SECONDS = 0.25;

/**
 * Follows the drawn letter frame to frame, so a change can fade. During
 * playback the change is timed from the frame it was first seen; after a seek
 * or a pause there is no history, and the letter shows already lit.
 */
export function createTitleLitFollower(): (
  seconds: number,
  letter: number | null
) => TitleLitMoment {
  let lastSeconds: number | null = null;
  let current: number | null = null;
  let previous: number | null = null;
  let changedAt = Number.NEGATIVE_INFINITY;
  return (seconds, letter) => {
    const playing =
      lastSeconds !== null &&
      seconds >= lastSeconds &&
      seconds - lastSeconds <= SEEK_SECONDS;
    if (!playing) {
      current = letter;
      previous = letter;
      changedAt = Number.NEGATIVE_INFINITY;
    } else if (letter !== current) {
      previous = current;
      current = letter;
      changedAt = seconds;
    }
    lastSeconds = seconds;
    return {
      letter: current,
      previous,
      secondsSinceChange: seconds - changedAt,
    };
  };
}
