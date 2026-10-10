/**
 * GalleryOfflineCache
 *
 * Persists PublicSequenceIndex documents to Dexie's galleryCache table.
 * On loadCached(), converts back to SequenceData[] via the same mapping
 * that PublicSequencesLoader uses for online data.
 */

import { db } from "#lib/shared/persistence/database/tka-database.js";
import type { GallerySequenceConverter } from "./types";
import type { PublicSequenceIndex } from "#lib/shared/foundation/domain/models/public-sequence-index.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { GalleryCacheEntry } from "../domain/offline-cache-types";

/**
 * Normalize a Firestore Timestamp / Date / serialized-timestamp / date string to
 * an ISO string. Returns undefined when there's no usable date. Runs against the
 * ORIGINAL doc (with live Timestamp objects) before JSON serialization.
 */
function timestampToIso(value: unknown): string | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj.toDate === "function") {
      return (obj.toDate as () => Date)().toISOString();
    }
    // Serialized Firestore Timestamp shapes
    const seconds = (obj.seconds ?? obj._seconds) as number | undefined;
    if (typeof seconds === "number") return new Date(seconds * 1000).toISOString();
    return undefined;
  }
  const parsed = new Date(value as string | number);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

export class GalleryOfflineCache {
  private converter: GallerySequenceConverter | null = null;

  setConverter(fn: GallerySequenceConverter): void {
    this.converter = fn;
  }

  async persist(docs: PublicSequenceIndex[]): Promise<void> {
    const now = Date.now();
    // JSON round-trip strips non-cloneable Firestore objects (Timestamps, etc.)
    // that IndexedDB's structured clone algorithm rejects. But a bare round-trip
    // turns Firestore Timestamps into junk ({} / {seconds,nanoseconds}) that the
    // loader can't read back — every gallery date then reads "Unknown Date".
    // Convert the known date fields to ISO strings *before* serializing so they
    // survive the round-trip and rehydrate correctly.
    const entries: GalleryCacheEntry[] = docs.map((doc) => {
      const raw = doc as unknown as Record<string, unknown>;
      const cleaned = JSON.parse(JSON.stringify(doc)) as Record<string, unknown>;
      for (const field of ["birthday", "publishedAt", "updatedAt", "dateAdded", "createdAt"]) {
        const iso = timestampToIso(raw[field]);
        if (iso) cleaned[field] = iso;
        else delete cleaned[field];
      }
      return { id: doc.id, data: cleaned as unknown as PublicSequenceIndex, cachedAt: now };
    });

    await db.transaction("rw", [db.galleryCache, db.galleryCacheMeta], async () => {
      await db.galleryCache.clear();
      await db.galleryCache.bulkPut(entries);

      await db.galleryCacheMeta.put({
        id: "gallery-cache-meta",
        lastSyncedAt: now,
        sequenceCount: docs.length,
      });
    });
  }

  async loadCached(): Promise<{
    sequences: SequenceData[];
    sourceRefs: Map<string, string>;
    lastSyncedAt: number | null;
  }> {
    const [entries, meta] = await Promise.all([
      db.galleryCache.toArray(),
      db.galleryCacheMeta.get("gallery-cache-meta"),
    ]);

    if (entries.length === 0) {
      return { sequences: [], sourceRefs: new Map(), lastSyncedAt: null };
    }

    const sourceRefs = new Map<string, string>();
    const sequences: SequenceData[] = [];

    for (const entry of entries) {
      const doc = entry.data;

      if (doc.sourceRef) {
        sourceRefs.set(`id:${entry.id}`, doc.sourceRef);
        sourceRefs.set(doc.word, doc.sourceRef);
        if (doc.name && doc.name !== doc.word) {
          sourceRefs.set(doc.name, doc.sourceRef);
        }
      }

      if (this.converter) {
        sequences.push(this.converter(doc, entry.id));
      }
    }

    return {
      sequences,
      sourceRefs,
      lastSyncedAt: meta?.lastSyncedAt ?? null,
    };
  }

  async clear(): Promise<void> {
    await db.transaction("rw", [db.galleryCache, db.galleryCacheMeta], async () => {
      await db.galleryCache.clear();
      await db.galleryCacheMeta.clear();
    });
  }

  async getStats(): Promise<{ count: number; lastSyncedAt: number | null }> {
    const [count, meta] = await Promise.all([
      db.galleryCache.count(),
      db.galleryCacheMeta.get("gallery-cache-meta"),
    ]);
    return { count, lastSyncedAt: meta?.lastSyncedAt ?? null };
  }

  async hasCachedData(): Promise<boolean> {
    const count = await db.galleryCache.count();
    return count > 0;
  }
}
