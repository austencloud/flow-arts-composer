/**
 * What the 3D effects list shows when the two props wear different effects:
 * no tile is lit as the one effect; each wearing tile carries its hand's dot.
 * Kept pure so the count and the dot choice are testable without a render.
 */
export interface GlobalEffectMix {
  /** Tile that carries the left hand's dot, or null when it wears nothing. */
  leftTile: string | null;
  /** Tile that carries the right hand's dot, or null when it wears nothing. */
  rightTile: string | null;
  /** Distinct effects on, not counting none or motion. */
  count: number;
}

export function globalEffectMix(
  differ: boolean,
  left: string,
  right: string
): GlobalEffectMix {
  if (!differ) {
    return { leftTile: null, rightTile: null, count: left !== "none" ? 1 : 0 };
  }
  const on = new Set([left, right].filter((id) => id !== "none"));
  return {
    leftTile: left === "none" ? null : left,
    rightTile: right === "none" ? null : right,
    count: on.size,
  };
}
