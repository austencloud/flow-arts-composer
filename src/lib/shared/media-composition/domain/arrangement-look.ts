import type { ArrangementCell } from "./arrangement.js";
import type { PostAnimationAppearance } from "./post-animation-appearance.js";

/**
 * The look a cell draws with: the grid's default under the cell's own set
 * flags, the way a tunnel's look is read over its animation's. Null when
 * neither says anything, so the viewer's own settings apply.
 */
export function arrangementCellLook(
  grid: PostAnimationAppearance | undefined,
  cell: Pick<ArrangementCell, "appearance">
): PostAnimationAppearance | null {
  if (!grid && !cell.appearance) return null;
  return { ...grid, ...cell.appearance };
}

/**
 * A cell's override after a panel change: the flags the change moved, over
 * what the cell already said. A flag set back to unsaid leaves the override,
 * so the cell follows the grid for it again; an empty override is undefined.
 */
export function arrangementLookOverride(
  previous: PostAnimationAppearance | undefined,
  look: PostAnimationAppearance,
  changed: readonly (keyof PostAnimationAppearance)[]
): PostAnimationAppearance | undefined {
  if (changed.length === 0) return previous;
  const next: Record<string, unknown> = { ...previous };
  for (const key of changed) {
    const value = look[key];
    if (value === undefined) delete next[key];
    else next[key] = value;
  }
  return Object.keys(next).length > 0
    ? (next as PostAnimationAppearance)
    : undefined;
}
