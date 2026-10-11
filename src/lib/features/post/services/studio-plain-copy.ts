/**
 * A detached copy of saved data. A sequence handed over by a picker or a grid
 * is often a Svelte state proxy, which structuredClone rejects. Projects and
 * sources are stored as JSON, so a JSON copy keeps exactly what a save keeps.
 */
export function plainCopy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
