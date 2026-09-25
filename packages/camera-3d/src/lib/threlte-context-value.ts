/**
 * Threlte context values have existed in both direct-object and `{ current }`
 * forms. Camera controls sit below that API boundary, so they accept either
 * shape rather than silently skipping every frame after a Threlte upgrade.
 */
export function resolveThrelteContextValue<T extends object>(
  value: T | { current?: T | null } | null | undefined
): T | null {
  if (value == null) return null;
  if ("current" in value) return value.current ?? null;
  // `in` cannot narrow a generic T away from the wrapper shape.
  return value as T;
}
