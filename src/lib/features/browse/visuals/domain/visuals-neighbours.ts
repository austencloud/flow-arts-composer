/**
 * Where a piece sits among the pieces of its own type, in list order, for the
 * piece page's step control. `previous` and `next` are null at the ends, where
 * the arrow is disabled but keeps its place.
 */
export interface PieceNeighbours<T> {
  /** One-based, as shown ("2 of 5"). */
  readonly position: number;
  readonly total: number;
  readonly previous: T | null;
  readonly next: T | null;
}

export function pieceNeighbours<T extends { readonly artifactId: string }>(
  sameType: readonly T[],
  artifactId: string
): PieceNeighbours<T> | null {
  const index = sameType.findIndex((piece) => piece.artifactId === artifactId);
  if (index < 0) return null;
  return {
    position: index + 1,
    total: sameType.length,
    previous: sameType[index - 1] ?? null,
    next: sameType[index + 1] ?? null,
  };
}
