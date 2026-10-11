import type { MandalaPaths } from "#lib/shared/mandala/domain/mandala-types.js";

const DB_NAME = "tka-shape-cache";
const DB_VERSION = 12;
const STORE = "deck-shapes";

export interface CachedShapeGroup {
  fp: string;
  repPaths: MandalaPaths;
  repSeqId: string;
  repWord: string;
  count: number;
  sequences: Array<{ id: string; word: string; deckId: string; loopType: string }>;
}

export interface CachedDeckShapes {
  deckId: string;
  totalProcessed: number;
  groups: CachedShapeGroup[];
  cachedAt: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "deckId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getCachedDeckShapes(deckId: string): Promise<CachedDeckShapes | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(deckId);
      req.onsuccess = () => resolve((req.result as CachedDeckShapes) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function saveDeckShapes(entry: CachedDeckShapes): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(entry);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Cache is optional
  }
}
