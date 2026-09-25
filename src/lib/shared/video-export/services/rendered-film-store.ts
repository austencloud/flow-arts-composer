/**
 * RenderedFilmStore
 *
 * Keeps rendered films on the device so dismissing the preview is not
 * destructive. The scene collection already holds the recipe — the scene plus
 * the camera path — which is enough to render the film again; this store holds
 * the finished file, which is enough to watch it again without waiting.
 *
 * Deliberately its own database rather than a second tenant in
 * `shared/video/services/video-cache.ts`: that one is keyed by remote URL and
 * is semantically a download cache, so its entries can be evicted on age with
 * nothing lost. These entries are the only copy of the file.
 *
 * Raw IndexedDB, no new dependency, mirroring the video-cache structure.
 */
import type { Scene3DFilmRender } from "$lib/features/scene-3d-collection/domain/scene-3d-collection-types";

const DB_NAME = "tka-rendered-films";
const DB_VERSION = 1;
const STORE_NAME = "films";

export interface RenderedFilmRecord {
  id: string;
  /** The scene-collection entry whose film this render came from. */
  filmEntryId: string | null;
  sequenceId: string | null;
  word: string;
  blob: Blob;
  mimeType: string;
  byteSize: number;
  render: Scene3DFilmRender;
  durationSeconds: number;
  createdAt: number;
}

/** A record without its blob — enough to list what is retained. */
export type RenderedFilmSummary = Omit<RenderedFilmRecord, "blob">;

export interface PruneRenderedFilmsOptions {
  maxCount?: number;
  maxBytes?: number;
}

export const DEFAULT_PRUNE_OPTIONS: Required<PruneRenderedFilmsOptions> = {
  maxCount: 8,
  maxBytes: 600 * 1024 * 1024,
};

function isAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

let dbPromise: Promise<IDBDatabase> | null = null;

const listeners = new Set<() => void>();

/**
 * Called after a film is kept, deleted, or pruned, so a surface that offers
 * the latest film (the share panel's Download film) stays current without
 * polling the database.
 */
export function onRenderedFilmsChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notifyChanged(): void {
  for (const listener of listeners) listener();
}

function getDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt", { unique: false });
        store.createIndex("filmEntryId", "filmEntryId", { unique: false });
      }
    };
  });
  return dbPromise;
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function stripBlob(record: RenderedFilmRecord): RenderedFilmSummary {
  const { blob: _blob, ...summary } = record;
  return summary;
}

/**
 * Which retained films have to go, newest kept first.
 *
 * Pure so the retention policy can be tested without a database: the count cap
 * and the byte cap are the part worth getting right, and both are easy to get
 * subtly wrong (an off-by-one keeps nine, a byte cap applied before sorting
 * drops the newest render someone just made).
 */
export function selectRenderedFilmsToPrune(
  summaries: readonly RenderedFilmSummary[],
  options: PruneRenderedFilmsOptions = {}
): RenderedFilmSummary[] {
  const maxCount = options.maxCount ?? DEFAULT_PRUNE_OPTIONS.maxCount;
  const maxBytes = options.maxBytes ?? DEFAULT_PRUNE_OPTIONS.maxBytes;

  const newestFirst = [...summaries].sort((a, b) => b.createdAt - a.createdAt);
  const doomed: RenderedFilmSummary[] = [];
  let keptBytes = 0;
  let keptCount = 0;

  for (const summary of newestFirst) {
    const overCount = keptCount >= maxCount;
    // The newest render is always kept, even when it alone exceeds the byte
    // cap: dropping the film someone is looking at right now is worse than
    // going over budget once.
    const overBytes = keptCount > 0 && keptBytes + summary.byteSize > maxBytes;
    if (overCount || overBytes) {
      doomed.push(summary);
      continue;
    }
    keptBytes += summary.byteSize;
    keptCount += 1;
  }

  return doomed;
}

export async function putRenderedFilm(
  record: RenderedFilmRecord
): Promise<void> {
  if (!isAvailable()) return;
  const db = await getDb();
  const tx = db.transaction(STORE_NAME, "readwrite");
  await request(tx.objectStore(STORE_NAME).put(record));
  notifyChanged();
}

export async function getRenderedFilm(
  id: string
): Promise<RenderedFilmRecord | null> {
  if (!isAvailable()) return null;
  const db = await getDb();
  const tx = db.transaction(STORE_NAME, "readonly");
  const result = await request(tx.objectStore(STORE_NAME).get(id));
  return (result as RenderedFilmRecord | undefined) ?? null;
}

/** Newest first, without the blobs. */
export async function listRenderedFilms(): Promise<RenderedFilmSummary[]> {
  if (!isAvailable()) return [];
  try {
    const db = await getDb();
    const tx = db.transaction(STORE_NAME, "readonly");
    const all = (await request(
      tx.objectStore(STORE_NAME).getAll()
    )) as RenderedFilmRecord[];
    return all.map(stripBlob).sort((a, b) => b.createdAt - a.createdAt);
  } catch (error) {
    console.warn("[RenderedFilms] Could not list retained films:", error);
    return [];
  }
}

/** Every retained render of one saved scene, newest first, with blobs. */
export async function getRenderedFilmsForEntry(
  filmEntryId: string
): Promise<RenderedFilmRecord[]> {
  if (!isAvailable()) return [];
  try {
    const db = await getDb();
    const tx = db.transaction(STORE_NAME, "readonly");
    const index = tx.objectStore(STORE_NAME).index("filmEntryId");
    const matches = (await request(
      index.getAll(IDBKeyRange.only(filmEntryId))
    )) as RenderedFilmRecord[];
    return matches.sort((a, b) => b.createdAt - a.createdAt);
  } catch (error) {
    console.warn("[RenderedFilms] Could not read retained films:", error);
    return [];
  }
}

export async function deleteRenderedFilm(id: string): Promise<void> {
  if (!isAvailable()) return;
  try {
    const db = await getDb();
    const tx = db.transaction(STORE_NAME, "readwrite");
    await request(tx.objectStore(STORE_NAME).delete(id));
    notifyChanged();
  } catch (error) {
    console.warn("[RenderedFilms] Could not delete a retained film:", error);
  }
}

/** Drop the oldest retained renders once the cap is exceeded. */
export async function pruneRenderedFilms(
  options: PruneRenderedFilmsOptions = {}
): Promise<number> {
  if (!isAvailable()) return 0;
  try {
    const summaries = await listRenderedFilms();
    const doomed = selectRenderedFilmsToPrune(summaries, options);
    for (const summary of doomed) {
      await deleteRenderedFilm(summary.id);
    }
    return doomed.length;
  } catch (error) {
    console.warn("[RenderedFilms] Could not prune retained films:", error);
    return 0;
  }
}
