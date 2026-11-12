/**
 * The distance book: every pairwise distance measured so far, kept between
 * visits so families link from it instead of measuring again.
 *
 * A book lists shape keys and the distances between them as the upper
 * triangle of their matrix. A pair never measured (two shapes that were never
 * in one pool together) holds NaN. Reading a book for a pool gives the pool's
 * full matrix plus the pairs still missing; writing one back merges what was
 * just measured, keeps the pool's shapes first and drops shapes the pool does
 * not draw once the book is full.
 */

export interface MandalaFamilyBook {
  /** The shapes the book covers. */
  readonly keys: readonly string[];
  /** Upper triangle, row by row, of the keys' distance matrix; NaN = not measured. */
  readonly distances: Float32Array;
  /** The per-sequence measure the keys came from. */
  readonly measure: number;
  /** The family distance the numbers came from. */
  readonly family: number;
}

/** The most shapes a book holds: 1,200 shapes is about 720,000 pairs, under 3 MB. */
export const MANDALA_FAMILY_BOOK_CAP = 1200;

/** Where pair (i, j), i < j, sits in the upper triangle of an n by n matrix. */
export function triangleIndex(i: number, j: number, n: number): number {
  if (i > j) [i, j] = [j, i];
  return (i * (2 * n - i - 1)) / 2 + (j - i - 1);
}

export function emptyTriangle(n: number): Float32Array {
  return new Float32Array(n > 1 ? (n * (n - 1)) / 2 : 0).fill(Number.NaN);
}

export interface BookReading {
  /** The pool's full n by n matrix; missing pairs are 0 until measured. */
  readonly matrix: Float32Array;
  /** Pool indices of the pairs the book lacks, flat: i0, j0, i1, j1 ... */
  readonly missing: Uint32Array;
}

/** The pool's matrix from the book, and the pairs it still needs. */
export function readBook(book: MandalaFamilyBook | null, keys: readonly string[]): BookReading {
  const n = keys.length;
  const matrix = new Float32Array(n * n);
  const at = new Map<string, number>();
  book?.keys.forEach((key, i) => at.set(key, i));
  const bookSize = book?.keys.length ?? 0;
  const where = keys.map((key) => at.get(key) ?? -1);
  const missing: number[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const bi = where[i]!;
      const bj = where[j]!;
      const d = book && bi >= 0 && bj >= 0 ? book.distances[triangleIndex(bi, bj, bookSize)]! : NaN;
      if (Number.isNaN(d)) {
        missing.push(i, j);
      } else {
        matrix[i * n + j] = d;
        matrix[j * n + i] = d;
      }
    }
  }
  return { matrix, missing: Uint32Array.from(missing) };
}

/**
 * The book after a pool's matrix is complete. The pool's shapes go first;
 * shapes from the old book the pool does not draw follow while there is room,
 * keeping the pairs they already had.
 */
export function writeBook(
  previous: MandalaFamilyBook | null,
  keys: readonly string[],
  matrix: Float32Array,
  versions: { measure: number; family: number },
  cap = MANDALA_FAMILY_BOOK_CAP
): MandalaFamilyBook {
  const n = keys.length;
  const inPool = new Set(keys);
  const kept = keys.slice(0, cap);
  const old = previous?.keys ?? [];
  for (const key of old) {
    if (kept.length >= cap) break;
    if (!inPool.has(key)) kept.push(key);
  }
  const size = kept.length;
  const oldAt = new Map<string, number>();
  old.forEach((key, i) => oldAt.set(key, i));
  const poolAt = new Map<string, number>();
  keys.forEach((key, i) => poolAt.set(key, i));
  const distances = emptyTriangle(size);
  for (let i = 0; i < size; i++) {
    for (let j = i + 1; j < size; j++) {
      const pi = poolAt.get(kept[i]!);
      const pj = poolAt.get(kept[j]!);
      let d = Number.NaN;
      if (pi !== undefined && pj !== undefined) {
        d = matrix[pi * n + pj]!;
      } else if (previous) {
        const oi = oldAt.get(kept[i]!);
        const oj = oldAt.get(kept[j]!);
        if (oi !== undefined && oj !== undefined) {
          d = previous.distances[triangleIndex(oi, oj, old.length)]!;
        }
      }
      distances[triangleIndex(i, j, size)] = d;
    }
  }
  return { keys: kept, distances, measure: versions.measure, family: versions.family };
}
