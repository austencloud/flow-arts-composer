import type { QueryDocumentSnapshot } from "firebase/firestore";
import type { Catalog } from "../domain/models/Catalog";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import {
  getSystemCatalogsPath,
  getSystemCatalogSequencesPath,
} from "$lib/shared/library/data/firestore-paths";
import { hydrateSequence } from "./sequence-render-hydrator";

export { hydrateSequence } from "./sequence-render-hydrator";

const CATALOG_CACHE_KEY = "catalogLoader.cachedCatalogs";

export function getCachedCatalogs(): Catalog[] | null {
  try {
    const raw = localStorage.getItem(CATALOG_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Catalog[];
  } catch {
    return null;
  }
}

function purgeStaleKeys(): void {
  try {
    const stale: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith("deckLoader.seqs.") || key.startsWith("deckLoader.seqsTs."))) {
        stale.push(key);
      }
    }
    for (const key of stale) localStorage.removeItem(key);
  } catch { /* ignore */ }
}

let hasPurged = false;

function cacheCatalogs(catalogs: Catalog[]): void {
  try {
    if (!hasPurged) {
      purgeStaleKeys();
      hasPurged = true;
    }
    localStorage.removeItem(CATALOG_CACHE_KEY);
    const trimmed = catalogs.map(d => ({
      ...d,
      families: d.families.map(f => ({
        ...f,
        sequenceIds: [] as readonly string[],
      })),
    }));
    const json = JSON.stringify(trimmed);
    localStorage.setItem(CATALOG_CACHE_KEY, json);
  } catch {
    // quota exceeded
  }
}

// Public pages (the shop's card covers, the atlas) import this module, and
// most visitors never trigger a catalog read. Loading Firebase on the first
// read keeps it off those pages' first download. The import() names the
// Firebase modules themselves: the build's small-chunk merge (vite.config.ts)
// can fold a small wrapper module back into the page.
async function loadFirestore() {
  const { getFirestoreInstance } = await import("$lib/shared/auth/firebase");
  return getFirestoreInstance();
}

export async function loadCatalogs(): Promise<Catalog[]> {
  const { collection, getDocs } = await import("firebase/firestore");
  const db = await loadFirestore();
  const catalogsRef = collection(db, getSystemCatalogsPath());
  const snapshot = await getDocs(catalogsRef);
  const catalogs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Catalog);
  cacheCatalogs(catalogs);
  return catalogs;
}

export async function loadCatalogSequences(catalogId: string): Promise<SequenceData[]> {
  const { collection, getDocs } = await import("firebase/firestore");
  const db = await loadFirestore();
  const seqRef = collection(db, getSystemCatalogSequencesPath(catalogId));
  const snapshot = await getDocs(seqRef);
  return snapshot.docs.map((d) => hydrateDoc(d));
}

export async function loadSequencesByIds(catalogId: string, sequenceIds: string[]): Promise<SequenceData[]> {
  if (sequenceIds.length === 0) return [];

  const { collection, getDocs, query, where } = await import(
    "firebase/firestore"
  );
  const db = await loadFirestore();
  const results: SequenceData[] = [];

  const BATCH_SIZE = 30;
  for (let i = 0; i < sequenceIds.length; i += BATCH_SIZE) {
    const batch = sequenceIds.slice(i, i + BATCH_SIZE);
    const q = query(
      collection(db, getSystemCatalogSequencesPath(catalogId)),
      where("__name__", "in", batch)
    );
    const snapshot = await getDocs(q);
    for (const d of snapshot.docs) {
      results.push(hydrateDoc(d));
    }
  }

  return results;
}

export async function loadCatalogSequencesPage(
  catalogId: string,
  pageSize: number,
  afterDoc?: QueryDocumentSnapshot,
): Promise<{ sequences: SequenceData[]; lastDoc: QueryDocumentSnapshot | null }> {
  const { collection, getDocs, query, limit, startAfter, orderBy } =
    await import("firebase/firestore");
  const db = await loadFirestore();
  const seqRef = collection(db, getSystemCatalogSequencesPath(catalogId));
  const q = afterDoc
    ? query(seqRef, orderBy("__name__"), startAfter(afterDoc), limit(pageSize))
    : query(seqRef, orderBy("__name__"), limit(pageSize));
  const snapshot = await getDocs(q);
  return {
    sequences: snapshot.docs.map((d) => hydrateDoc(d)),
    lastDoc: snapshot.docs[snapshot.docs.length - 1] ?? null,
  };
}

// Shared hydration logic for a single Firestore document
function hydrateDoc(d: QueryDocumentSnapshot): SequenceData {
  return hydrateSequence({ id: d.id, ...d.data() });
}
