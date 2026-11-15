/**
 * local-mirror - the one owner for synchronous on-device copies of lists that
 * really live in Firestore, so a panel can paint the last-seen list on its
 * first frame and refresh behind it (stale-while-revalidate).
 *
 * localStorage, not IndexedDB, because a synchronous read paints before any
 * `await`. Each copy is stored as `{ v, savedAt, data }`: `v` is the caller's
 * schema version, so a blob written in an older shape is ignored instead of
 * mis-read, and `savedAt` lets a caller decide how stale is too stale.
 *
 * Every function is best-effort and never throws. A miss, a parse failure, an
 * old version, private mode or a full quota all fall back to "no copy", which
 * is the same as a first visit.
 *
 * Callers: Library's collection lists (`collection-cache-mirror.ts`) and
 * Generate's saved and community setups (`setups-cache-mirror.ts`).
 */

export interface MirrorEntry<T> {
  data: T;
  /** Epoch ms when the copy was written; 0 for copies written before it existed. */
  savedAt: number;
}

interface Envelope<T> {
  v: number;
  savedAt?: number;
  data: T;
}

function storage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    // localStorage access can throw in locked-down or private contexts.
    return null;
  }
}

export function readMirror<T>(
  key: string,
  version: number
): MirrorEntry<T> | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(key);
    if (!raw) return null;
    const env = JSON.parse(raw) as Envelope<T> | null;
    if (env?.v !== version) return null;
    return {
      data: env.data,
      savedAt: typeof env.savedAt === "number" ? env.savedAt : 0,
    };
  } catch {
    return null;
  }
}

export function writeMirror<T>(
  key: string,
  version: number,
  data: T,
  savedAt: number = Date.now()
): void {
  const store = storage();
  if (!store) return;
  try {
    const env: Envelope<T> = { v: version, savedAt, data };
    store.setItem(key, JSON.stringify(env));
  } catch {
    // Quota exceeded or private mode: the copy is a convenience, stay silent.
  }
}

export function removeMirror(...keys: string[]): void {
  const store = storage();
  if (!store) return;
  for (const key of keys) {
    try {
      store.removeItem(key);
    } catch {
      // best-effort
    }
  }
}
