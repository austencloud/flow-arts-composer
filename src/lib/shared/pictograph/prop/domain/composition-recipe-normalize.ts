import type {
  CompositionRecipe,
  PropTransform,
} from "./prop-composition-recipes";

/**
 * Saved composition recipes (the Prop Button Lab's per-family overrides) from
 * before hands were named by side still say `blue` and `red`. Readers expect
 * `left` and `right`, and one old entry used to take the whole prop picker
 * down. Blue is the left hand, red the right, the same mapping the settings
 * normalizer uses for the buugeng flips.
 *
 * Returns null for anything that is not a readable recipe, so callers fall
 * back to the built-in recipe instead of drawing from missing numbers.
 */
export function normalizeCompositionRecipe(
  value: unknown
): CompositionRecipe | null {
  if (!isRecord(value)) return null;
  const left = normalizeTransform(value.left ?? value.blue);
  const right = normalizeTransform(value.right ?? value.red);
  if (!left || !right) return null;
  const pairScale = isFiniteNumber(value.pairScale) ? value.pairScale : 1;
  return { left, right, pairScale };
}

/**
 * The saved overrides map with every entry made readable and every
 * unreadable entry dropped. Undefined stays undefined.
 */
export function normalizeCompositionRecipeOverrides(
  value: unknown
): Record<string, CompositionRecipe> | undefined {
  if (!isRecord(value)) return undefined;
  const result: Record<string, CompositionRecipe> = {};
  for (const [key, entry] of Object.entries(value)) {
    const recipe = normalizeCompositionRecipe(entry);
    if (recipe) result[key] = recipe;
  }
  return result;
}

function normalizeTransform(value: unknown): PropTransform | null {
  if (!isRecord(value)) return null;
  const { x, y, rotation, scale } = value;
  if (
    !isFiniteNumber(x) ||
    !isFiniteNumber(y) ||
    !isFiniteNumber(rotation) ||
    !isFiniteNumber(scale)
  ) {
    return null;
  }
  return { x, y, rotation, scale };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
