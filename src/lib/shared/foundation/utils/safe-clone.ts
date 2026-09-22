/**
 * Deep copy that tolerates Svelte $state proxies. `structuredClone` throws on
 * a live Svelte proxy (and on functions/symbols), so fall back to a JSON
 * round-trip for those cases. Shared by anything that snapshots live,
 * possibly-reactive state into a plain, storable value.
 */
export function safeClone<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}
