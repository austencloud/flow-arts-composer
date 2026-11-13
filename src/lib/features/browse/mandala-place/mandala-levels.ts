/**
 * The By mandala levels: a pool of sequences split by how busy each one's
 * own mandala is (`mandalaLevelOf`), and the pictures that show a level.
 *
 * Every count and every picture comes from the sequences themselves, so the
 * level a person picks is the level of each sequence the grid then shows.
 * Families of look-alike mandalas are not used here: one family holds shapes
 * that look different, and picking one of its pictures led to sequences
 * whose mandalas did not match it.
 */
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { MandalaSignature } from "#lib/shared/mandala/services/mandala-density.js";
import {
  MANDALA_LEVEL_COUNT,
  mandalaLevelOf,
} from "#lib/shared/browse/services/sequence-density.js";

/** One distinct mandala and the sequences in the pool that draw it. */
export interface MandalaLevelShape {
  key: string;
  spaces: number;
  coverage: number;
  sequences: readonly SequenceData[];
}

export interface MandalaLevel {
  /** 1 (simplest) to MANDALA_LEVEL_COUNT. */
  level: number;
  /** How many sequences of the pool sit at this level. */
  count: number;
  /** Its distinct mandalas, simple to complex: spaces, then coverage, then key. */
  shapes: readonly MandalaLevelShape[];
}

/**
 * Every level, simplest first, also the empty ones, so the slider always has
 * the same stops. Sequences not measured yet, and ones with no mandala, are
 * left out.
 */
export function mandalaLevels(
  pool: readonly SequenceData[],
  signatureOf: (sequence: SequenceData) => MandalaSignature | undefined
): MandalaLevel[] {
  const byKey = new Map<
    string,
    { shape: MandalaLevelShape; sequences: SequenceData[] }
  >();
  for (const sequence of pool) {
    const signature = signatureOf(sequence);
    if (!signature || signature.key === "") continue;
    let entry = byKey.get(signature.key);
    if (!entry) {
      const sequences: SequenceData[] = [];
      entry = {
        shape: {
          key: signature.key,
          spaces: signature.spaces,
          coverage: signature.coverage,
          sequences,
        },
        sequences,
      };
      byKey.set(signature.key, entry);
    }
    entry.sequences.push(sequence);
  }

  const levels: { count: number; shapes: MandalaLevelShape[] }[] = Array.from(
    { length: MANDALA_LEVEL_COUNT },
    () => ({ count: 0, shapes: [] })
  );
  for (const { shape } of byKey.values()) {
    const slot = levels[mandalaLevelOf(shape.spaces) - 1]!;
    slot.count += shape.sequences.length;
    slot.shapes.push(shape);
  }
  return levels.map((slot, i) => ({
    level: i + 1,
    count: slot.count,
    shapes: slot.shapes.sort(
      (a, b) =>
        a.spaces - b.spaces ||
        a.coverage - b.coverage ||
        (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
    ),
  }));
}

/**
 * Up to `count` pictures for a level, simple to complex, spread over its
 * whole range: the shapes are cut into `count` runs in order, and each run
 * gives the shape the most sequences draw (the earliest on a tie), so the
 * pictures are the mandalas a person is likely to meet at that level.
 */
export function levelExamples(
  shapes: readonly MandalaLevelShape[],
  count: number
): MandalaLevelShape[] {
  const want = Math.max(0, Math.floor(count));
  if (want === 0) return [];
  if (shapes.length <= want) return [...shapes];
  const picks: MandalaLevelShape[] = [];
  for (let i = 0; i < want; i++) {
    const from = Math.floor((i * shapes.length) / want);
    const to = Math.floor(((i + 1) * shapes.length) / want);
    let best = shapes[from]!;
    for (let j = from + 1; j < to; j++) {
      if (shapes[j]!.sequences.length > best.sequences.length)
        best = shapes[j]!;
    }
    picks.push(best);
  }
  return picks;
}

/** Where a level's pictures go: whole rows of square boxes. */
export interface PictureLayout {
  cols: number;
  rows: number;
  /** A picture's side, in pixels. */
  box: number;
}

/**
 * A level's face: the one picture that stands for it on the slider. The
 * most-drawn mandala in the middle half of the level (the earliest on a tie),
 * so the face is typical of the level and not one of its edges, which look
 * like the levels beside it. Undefined for an empty level.
 */
export function levelFace(
  shapes: readonly MandalaLevelShape[]
): MandalaLevelShape | undefined {
  if (shapes.length === 0) return undefined;
  const from = Math.floor(shapes.length / 4);
  const to = Math.max(from + 1, Math.ceil((shapes.length * 3) / 4));
  let best = shapes[from]!;
  for (let i = from + 1; i < to; i++) {
    if (shapes[i]!.sequences.length > best.sequences.length) best = shapes[i]!;
  }
  return best;
}

/**
 * How many places the grid has on every level, so it keeps one size as the
 * slider moves: as many as the level with the fewest mandalas has (31 on the
 * whole gallery). Levels with fewer than `least` do not count, so a search
 * that leaves one level two mandalas does not shrink every level to two; that
 * short level shows what it has in the same places. When no level has
 * `least`, the fullest one sets the count. 0 when every level is empty.
 */
export function steadyPictureCount(
  levels: readonly MandalaLevel[],
  least = 6
): number {
  let fewest = Infinity;
  let most = 0;
  for (const level of levels) {
    const have = level.shapes.length;
    most = Math.max(most, have);
    if (have >= least) fewest = Math.min(fewest, have);
  }
  return fewest === Infinity ? most : fewest;
}

/** A picture may give up this much of the area's least size to fill the
 *  frame: an extra row on a tall phone, a fourth on an upright tablet. */
const FIT_SHRINK = 0.85;
/** A fill must cover this much more of the area than `base` to replace it,
 *  so a pixel's difference never changes the grid. */
const FIT_GAIN = 1.08;
/** Fills this close to the best cover count as equal, and the one with
 *  more pictures wins: 4 by 4 over 3 by 3 when both fill the frame. */
const FIT_EVEN = 0.95;

/**
 * The places for `have` mandalas in an area `width` by `height` whose own
 * layout is `base` (as many boxes of the area's least size as fit). Whole
 * rows of square boxes, between 0.85 and 2 times the base size, and never
 * fewer pictures than `base` when there are mandalas enough for it. Of the
 * arrangements that cover nearly the most of the area (within 5%), the one
 * with the most pictures wins, then the wider one. `base` stays unless the
 * winner covers clearly more (8%), as when a tall phone's three rows leave
 * room for a fourth, or when there are fewer mandalas than places (the 31
 * simplest on a 4K screen would leave two thin rows in an empty frame).
 */
export function fitLevelPictures(
  width: number,
  height: number,
  gap: number,
  have: number,
  base: PictureLayout
): PictureLayout {
  if (have <= 0) return base;
  const least = Math.floor(base.box * FIT_SHRINK);
  const most = base.box * 2;
  const baseFits = base.cols * base.rows <= have;
  const fewest = baseFits ? base.cols * base.rows : 1;
  const fits: (PictureLayout & { cover: number })[] = [];
  for (let cols = 1; cols <= have; cols++) {
    const across = (width - (cols - 1) * gap) / cols;
    if (across < least) break;
    for (let rows = 1; cols * rows <= have; rows++) {
      const box = Math.floor(
        Math.min(most, across, (height - (rows - 1) * gap) / rows)
      );
      if (box < least) break;
      if (cols * rows < fewest) continue;
      fits.push({ cols, rows, box, cover: cols * rows * box * box });
    }
  }
  if (fits.length === 0) return base;
  const topCover = Math.max(...fits.map((fit) => fit.cover));
  let best = fits[0]!;
  let bestRank = -1;
  for (const fit of fits) {
    if (fit.cover < topCover * FIT_EVEN) continue;
    const rank = fit.cols * fit.rows * 1000 + fit.cols;
    if (rank > bestRank) {
      best = fit;
      bestRank = rank;
    }
  }
  if (
    baseFits &&
    best.cover < base.cols * base.rows * base.box * base.box * FIT_GAIN
  ) {
    return base;
  }
  return { cols: best.cols, rows: best.rows, box: best.box };
}

/** Where the slider starts: the level he applied, else the first with sequences. */
export function startingLevel(
  levels: readonly MandalaLevel[],
  wanted: number | null
): number {
  if (wanted !== null && wanted >= 1 && wanted <= MANDALA_LEVEL_COUNT)
    return wanted;
  return levels.find((level) => level.count > 0)?.level ?? 1;
}
