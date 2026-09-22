/**
 * PublicSequencesLoader - Load community sequences from Firestore
 *
 * Replaces BrowseLoader which loaded from static manifest files.
 * Now loads from the publicSequences Firestore collection.
 *
 * Features:
 * - Loads display metadata efficiently (no steps until needed)
 * - Caches results to avoid repeated queries
 * - Fetches full sequence data on demand via sourceRef
 */

import { getErrorHandler } from "$lib/shared/application/get-error-handler";
import {
  collection,
  getDocs,
  query,
  orderBy,
  doc,
  getDoc,
} from "firebase/firestore";
import { getFirestoreInstance } from "$lib/shared/auth/firebase";
import {
  getPublicSequencePath,
  getPublicSequencesPath,
} from "$lib/shared/library/data/firestore-paths";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { stripWordNotation } from "$lib/shared/foundation/utils/word-notation";
import type { PublicSequenceIndex } from "$lib/shared/foundation/domain/models/public-sequence-index";
import { hydrate } from "$lib/shared/foundation/services/sequence-hydrator";
import type { ErrorHandler } from "$lib/shared/application/services/error-handler";
import type { GalleryOfflineCache } from "$lib/shared/offline/services/gallery-offline-cache";
import { networkStatusState } from "$lib/shared/offline/state/network-status-state.svelte";
import { isDesktop } from "$lib/shared/desktop/is-desktop";
import { normalizeLegacySequence } from "@tka/tka-types";

/** How long the desktop viewer waits on Firestore before opening from the bundled index. */
const DESKTOP_SOURCE_READ_TIMEOUT_MS = 2500;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

export class PublicSequencesLoader {
  private cachedSequences: SequenceData[] | null = null;
  private loadPromise: Promise<SequenceData[]> | null = null;
  // Map from word/name OR sequence ID to sourceRef for efficient full data lookup.
  // Both keys point to the same sourceRef so we can look up by either.
  // ID-based lookup is preferred when available (disambiguates same-word variations).
  private sourceRefCache: Map<string, string> = new Map();
  private galleryOfflineCache: GalleryOfflineCache | null;
  private lastFetchedDocs: PublicSequenceIndex[] = [];

  constructor(galleryOfflineCache?: GalleryOfflineCache) {
    this.galleryOfflineCache = galleryOfflineCache ?? null;
    if (this.galleryOfflineCache) {
      this.galleryOfflineCache.setConverter((data, id) =>
        this.mapPublicIndexToSequenceData(data, id)
      );
    }
  }

  /** Keep every lookup key in step whenever a public index entry is learned. */
  private cacheSourceRef(
    id: string,
    sourceRef: string,
    word?: string,
    name?: string
  ): void {
    this.sourceRefCache.set(`id:${id}`, sourceRef);
    if (word) this.sourceRefCache.set(word, sourceRef);
    if (name && name !== word) this.sourceRefCache.set(name, sourceRef);
  }

  /**
   * Load all public sequences from Firestore, falling back to offline cache
   * when the network is unavailable or the Firestore fetch fails.
   * Returns display metadata (no steps) for gallery grid.
   */
  async loadSequenceMetadata(): Promise<SequenceData[]> {
    if (this.cachedSequences) return this.cachedSequences;
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = this.fetchWithOfflineFallback();
    try {
      this.cachedSequences = await this.loadPromise;
      return this.cachedSequences;
    } catch (error) {
      const errorHandler = getErrorHandler() as ErrorHandler;
      errorHandler.showUserError({
        message: "Couldn't load the gallery",
        technicalDetails:
          error instanceof Error ? error.message : String(error),
        error: error instanceof Error ? error : new Error(String(error)),
        severity: "error",
        context: { module: "browse", action: "load-gallery" },
      });
      throw error;
    } finally {
      this.loadPromise = null;
    }
  }

  /**
   * Try Firestore first (when online), fall back to IndexedDB cache when
   * offline or when the network request fails.
   */
  private async fetchWithOfflineFallback(): Promise<SequenceData[]> {
    if (networkStatusState.isOnline) {
      try {
        const sequences = await this.fetchPublicSequences();
        if (this.galleryOfflineCache) {
          this.persistToOfflineCache().catch((err) =>
            console.warn(
              "[PublicSequencesLoader] Offline cache persist failed:",
              err
            )
          );
        }
        return sequences;
      } catch (error) {
        console.warn(
          "[PublicSequencesLoader] Firestore fetch failed, trying offline cache:",
          error
        );
      }
    }

    if (this.galleryOfflineCache) {
      const hasCache = await this.galleryOfflineCache.hasCachedData();
      if (hasCache) {
        const cached = await this.galleryOfflineCache.loadCached();
        for (const [key, value] of cached.sourceRefs) {
          this.sourceRefCache.set(key, value);
        }
        return cached.sequences;
      }
    }

    throw new Error(
      "No network connection and no cached gallery data available"
    );
  }

  private async persistToOfflineCache(): Promise<void> {
    if (!this.galleryOfflineCache || this.lastFetchedDocs.length === 0) return;
    await this.galleryOfflineCache.persist(this.lastFetchedDocs);
  }

  /**
   * Load full sequence data for a specific sequence
   * Fetches from the source user's library via sourceRef
   * Uses cached sourceRef mapping for efficiency
   *
   * When sequenceId is provided, it's used for disambiguation so that
   * two sequences sharing the same word (e.g. two "FJ" variations by
   * different authors) resolve to the correct source document.
   */
  /**
   * Lenient: any failure reads as "not public". Callers that must not mistake a
   * failed read for a deleted sequence use {@link loadFullSequenceDataStrict}.
   */
  async loadFullSequenceData(
    sequenceName: string,
    sequenceId?: string
  ): Promise<SequenceData | null> {
    try {
      return await this.loadFullSequenceDataStrict(sequenceName, sequenceId);
    } catch (error) {
      console.error(
        `[PublicSequencesLoader] Failed to load full sequence:`,
        error
      );
      return null;
    }
  }

  /**
   * null ONLY when the public index is authoritative that this sequence isn't
   * public. A fetch that failed, or a read the server never answered (Firestore
   * serves `get()` from an empty local cache before its connection is up), throws
   * — the caller can retry instead of reporting the sequence as gone.
   */
  async loadFullSequenceDataStrict(
    sequenceName: string,
    sequenceId?: string
  ): Promise<SequenceData | null> {
    // Ensure metadata is loaded first (populates sourceRef cache)
    if (!this.cachedSequences) {
      await this.loadSequenceMetadata();
    }

    // When an ID is supplied, resolve only that exact document. Falling back to
    // a word here can silently load somebody else's same-word variation.
    let sourceRef = sequenceId
      ? this.sourceRefCache.get(`id:${sequenceId}`)
      : undefined;

    // IndexedDB caches written before the ID-key fix only carried word/name
    // source refs. Their sequence metadata still has enough owner information
    // to reconstruct the canonical source path without a network lookup.
    if (!sourceRef && sequenceId) {
      const match = this.cachedSequences?.find(
        (sequence) => sequence.id === sequenceId
      );
      if (match?.ownerId && match.id) {
        sourceRef = `users/${match.ownerId}/sequences/${match.id}`;
        this.cacheSourceRef(match.id, sourceRef, match.word, match.name);
      }
    }

    // A warmed gallery cache is intentionally allowed to be stale, so absence
    // there is not proof that a public sequence was deleted. Read the exact
    // public index document before returning null.
    if (!sourceRef && sequenceId) {
      const firestore = await getFirestoreInstance();
      const publicDoc = await getDoc(
        doc(firestore, getPublicSequencePath(sequenceId))
      );
      if (!publicDoc.exists()) {
        if (publicDoc.metadata.fromCache) {
          throw new Error(
            `[PublicSequencesLoader] Read of ${getPublicSequencePath(sequenceId)} never reached the server`
          );
        }
        console.warn(
          `[PublicSequencesLoader] No sequence found for "${sequenceName}" (id: ${sequenceId})`
        );
        return null;
      }

      const indexData = normalizeLegacySequence(
        publicDoc.data()
      ) as PublicSequenceIndex;
      if (indexData.sourceRef) {
        sourceRef = indexData.sourceRef;
        this.cacheSourceRef(
          publicDoc.id,
          indexData.sourceRef,
          indexData.word,
          indexData.name
        );
      } else {
        const indexedSequence = this.mapPublicIndexToSequenceData(
          indexData,
          publicDoc.id
        );
        if ((indexedSequence.steps?.length ?? 0) > 0) return indexedSequence;
        throw new Error(
          `[PublicSequencesLoader] Public index ${getPublicSequencePath(sequenceId)} has no sourceRef or renderable steps`
        );
      }
    }

    // Word-only callers have no exact ID to disambiguate. Preserve the legacy
    // word/name lookup for them after every exact-ID path is exhausted.
    if (!sourceRef && !sequenceId) {
      sourceRef = this.sourceRefCache.get(sequenceName);
      if (!sourceRef) {
        const match = this.cachedSequences?.find(
          (sequence) =>
            sequence.name === sequenceName || stripWordNotation(sequence.word) === sequenceName
        );
        if (match?.ownerId && match.id) {
          sourceRef = `users/${match.ownerId}/sequences/${match.id}`;
          this.cacheSourceRef(match.id, sourceRef, match.word, match.name);
        }
      }
    }
    if (!sourceRef) {
      console.warn(
        `[PublicSequencesLoader] No sequence found for "${sequenceName}"${sequenceId ? ` (id: ${sequenceId})` : ""}`
      );
      return null;
    }

    // The warmed index already carries hydrated steps for every sequence
    // published with compositional fields. Offline, that IS the sequence —
    // a Firestore read would only fail or hang. On desktop the read is still
    // attempted (the source document is authoritative) but bounded, so a
    // captive portal or a dead Wi-Fi link never stalls the viewer when the
    // bundled index can open it immediately.
    const local = this.findRenderableCached(sequenceName, sequenceId);
    if (local && !networkStatusState.isOnline) return local;

    // Fetch full data from the source reference
    const firestore = await getFirestoreInstance();
    const read = getDoc(doc(firestore, sourceRef));
    const fullDoc =
      local && isDesktop()
        ? await withTimeout(read, DESKTOP_SOURCE_READ_TIMEOUT_MS)
        : await read;
    if (!fullDoc) return local;
    if (!fullDoc.exists()) {
      if (fullDoc.metadata.fromCache) {
        throw new Error(
          `[PublicSequencesLoader] Read of ${sourceRef} never reached the server`
        );
      }
      console.warn(
        `[PublicSequencesLoader] Source sequence not found: ${sourceRef}`
      );
      return null;
    }

    const data = fullDoc.data();
    return this.mapFirestoreToSequenceData(data, fullDoc.id);
  }

  private findRenderableCached(
    sequenceName: string,
    sequenceId?: string
  ): SequenceData | null {
    const match = this.cachedSequences?.find((sequence) =>
      sequenceId
        ? sequence.id === sequenceId
        : sequence.name === sequenceName || stripWordNotation(sequence.word) === sequenceName
    );
    return match && (match.steps?.length ?? 0) > 0 ? match : null;
  }

  /**
   * Remove a single sequence from the cache by ID.
   * Avoids a Firestore round-trip after a delete.
   */
  removeFromCache(sequenceId: string): void {
    if (this.cachedSequences) {
      this.cachedSequences = this.cachedSequences.filter(
        (s) => s.id !== sequenceId
      );
    }
    this.sourceRefCache.delete(`id:${sequenceId}`);
  }

  /**
   * Add a sequence directly to the in-memory cache.
   * Called after publishing so the sequence appears in the gallery immediately.
   * If the cache isn't loaded yet, this is a no-op - the sequence will be fetched
   * from Firestore naturally on the next gallery load.
   */
  addToCache(sequence: SequenceData): void {
    if (!this.cachedSequences) return;
    const existingIndex = this.cachedSequences.findIndex(
      (s) => s.id === sequence.id
    );
    if (existingIndex >= 0) {
      // Replace the existing entry so re-saves with a new word show correctly.
      this.cachedSequences = [
        ...this.cachedSequences.slice(0, existingIndex),
        sequence,
        ...this.cachedSequences.slice(existingIndex + 1),
      ];
    } else {
      this.cachedSequences = [...this.cachedSequences, sequence];
    }
    if (sequence.ownerId) {
      this.cacheSourceRef(
        sequence.id,
        `users/${sequence.ownerId}/sequences/${sequence.id}`,
        sequence.word,
        sequence.name
      );
    }
  }

  warmFromCache(
    sequences: SequenceData[],
    sourceRefs: Map<string, string>
  ): void {
    if (this.cachedSequences) return; // Already warmed or loaded - don't overwrite
    this.cachedSequences = sequences;
    for (const [key, value] of sourceRefs) {
      this.sourceRefCache.set(key, value);
    }
    // Repair caches written before GalleryOfflineCache stored ID-prefixed keys.
    for (const sequence of sequences) {
      if (!sequence.ownerId) continue;
      this.cacheSourceRef(
        sequence.id,
        `users/${sequence.ownerId}/sequences/${sequence.id}`,
        sequence.word,
        sequence.name
      );
    }
  }

  /**
   * Patch a background thumbnail into the warm gallery cache without replacing
   * any newer sequence fields.
   */
  updateThumbnailsInCache(sequenceId: string, thumbnails: string[]): void {
    if (!this.cachedSequences) return;
    const index = this.cachedSequences.findIndex(
      (sequence) => sequence.id === sequenceId
    );
    if (index < 0) return;

    const next = [...this.cachedSequences];
    next[index] = {
      ...next[index]!,
      thumbnails: [...thumbnails],
    };
    this.cachedSequences = next;
  }

  /**
   * Force a fresh Firestore fetch regardless of cache state.
   * Used by the prefetcher to sync in the background after warming from IndexedDB.
   * Updates the in-memory cache and persists to IndexedDB offline cache.
   */
  async refreshFromFirestore(): Promise<SequenceData[]> {
    const sequences = await this.fetchPublicSequences();
    this.cachedSequences = sequences;

    // Persist to offline cache for next session
    if (this.galleryOfflineCache) {
      this.persistToOfflineCache().catch((err) =>
        console.warn(
          "[PublicSequencesLoader] Offline cache persist failed:",
          err
        )
      );
    }

    return sequences;
  }

  private async fetchPublicSequences(): Promise<SequenceData[]> {
    this.lastFetchedDocs = [];

    const firestore = await getFirestoreInstance();
    const publicSeqRef = collection(firestore, getPublicSequencesPath());

    // Query all public sequences, ordered by word for consistent display
    const q = query(publicSeqRef, orderBy("word", "asc"));
    const snapshot = await getDocs(q);

    const sequences: SequenceData[] = [];

    snapshot.forEach((docSnap) => {
      const data = normalizeLegacySequence(
        docSnap.data()
      ) as PublicSequenceIndex;
      sequences.push(this.mapPublicIndexToSequenceData(data, docSnap.id));

      // Capture raw doc for offline cache persistence after this fetch
      this.lastFetchedDocs.push({
        ...data,
        id: docSnap.id,
      } as PublicSequenceIndex);

      // Cache sourceRef for efficient full data lookup later.
      // Store under both word AND ID so we can look up by either.
      // The ID key is prefixed with "id:" to avoid collisions with words.
      if (data.sourceRef) {
        this.cacheSourceRef(docSnap.id, data.sourceRef, data.word, data.name);
      }
    });

    return sequences;
  }

  /**
   * Map PublicSequenceIndex to SequenceData for display.
   * If compositional fields are present, hydrates full steps from them
   * so the sequence is self-contained (no sourceRef fetch needed).
   */
  private mapPublicIndexToSequenceData(
    data: PublicSequenceIndex,
    id: string
  ): SequenceData {
    data = normalizeLegacySequence(data);
    // Firestore docs carry a few display fields that aren't declared on
    // PublicSequenceIndex. Narrow the doc shape once here instead of casting
    // each field at the read site.
    const doc = data as PublicSequenceIndex & {
      displayName?: string;
      components?: SequenceData["components"];
      componentDomains?: SequenceData["componentDomains"];
      isCircular?: boolean;
    };

    const seq: SequenceData = {
      id,
      name: data.name,
      displayName: doc.displayName,
      word: data.word,
      steps: [], // Will be hydrated below if compositional fields are present
      thumbnails: [...data.thumbnails],
      sequenceLength: data.sequenceLength,
      level: data.level ?? this.difficultyStringToLevel(data.difficultyLevel),
      difficultyLevel: data.difficultyLevel,
      gridMode: data.gridMode,
      loopType: data.loopType as SequenceData["loopType"],
      period: data.period,
      components: doc.components,
      componentDomains: doc.componentDomains,
      isFavorite: false,
      isCircular: doc.isCircular ?? false,
      tags: [...data.tags],
      metadata: {},
      // Date info - prefer birthday (real creation date) over publishedAt (bulk publish date)
      // Firestore returns Timestamp objects, convert to Date
      dateAdded: this.toDate(data.birthday ?? data.publishedAt),
      birthday: this.toDate(data.birthday),
      createdAt: this.toDate(data.updatedAt),
      // Owner info
      ownerId: data.ownerId,
      ownerDisplayName: data.ownerDisplayName,
      ownerAvatarUrl: data.ownerAvatarUrl,
      publicPerformanceCount: data.publicPerformanceCount ?? 0,
      latestPublicPerformanceAt: this.toDate(data.latestPublicPerformanceAt),
      // Creator-recorded presentation intent. Dropping it here is what forced
      // every public preview into the visitor's prop context.
      ...(data.creatorIntent != null && { creatorIntent: data.creatorIntent }),
      // Compositional fields (if present in the public index)
      leftSoloProp: data.leftSoloProp,
      rightSoloProp: data.rightSoloProp,
      stepPairings: data.stepPairings,
      leftPathHash: data.leftPathHash,
      rightPathHash: data.rightPathHash,
      leftSoloHash: data.leftSoloHash,
      rightSoloHash: data.rightSoloHash,
      // Fork info
      ...(data.isForked && {
        source: "forked" as const,
        forkAttribution: {
          originalCreatorId: data.originalCreatorId!,
          originalCreatorName: data.originalCreatorName!,
        },
      }),
    };

    // If compositional fields are present, hydrate steps from them
    // so the sequence is fully renderable without a sourceRef fetch
    if (data.leftSoloProp && data.rightSoloProp && data.stepPairings) {
      try {
        const hydrated = hydrate(seq);
        // Trust the actual step count over the stored sequenceLength,
        // which may be stale (e.g. base word length before LOOP expansion)
        if (hydrated.steps && hydrated.steps.length > 0) {
          return { ...hydrated, sequenceLength: hydrated.steps.length };
        }
        return hydrated;
      } catch {
        // Hydration services not available - return with empty steps
        // (will fall back to sourceRef fetch on demand)
      }
    }

    return seq;
  }

  /** Convert legacy difficultyLevel string to numeric level */
  private difficultyStringToLevel(
    difficultyLevel?: string
  ): number | undefined {
    if (!difficultyLevel) return undefined;
    const map: Record<string, number> = {
      beginner: 1,
      intermediate: 2,
      advanced: 3,
    };
    return map[difficultyLevel.toLowerCase()];
  }

  /** Convert Firestore Timestamp or any date-like value to a JS Date */
  private toDate(value: unknown): Date | undefined {
    if (!value) return undefined;
    if (value instanceof Date) return value;
    if (typeof value === "object") {
      const obj = value as Record<string, unknown>;
      // Live Firestore Timestamp has a toDate() method
      if (typeof obj.toDate === "function") {
        return (obj.toDate as () => Date)();
      }
      // Serialized Firestore Timestamp ({seconds,nanoseconds} / {_seconds,...})
      const seconds = (obj.seconds ?? obj._seconds) as number | undefined;
      if (typeof seconds === "number") return new Date(seconds * 1000);
      return undefined;
    }
    // Fallback: try parsing as ISO string / epoch number
    const parsed = new Date(value as string | number);
    return isNaN(parsed.getTime()) ? undefined : parsed;
  }

  /**
   * Map full Firestore document to SequenceData
   */
  private mapFirestoreToSequenceData(
    data: Record<string, unknown>,
    id: string
  ): SequenceData {
    data = normalizeLegacySequence(data);
    const seq: SequenceData = {
      id,
      name: (data.name as string) ?? "",
      displayName: data.displayName as string | undefined,
      word: (data.word as string) ?? "",
      // Backwards compatibility: support old 'beats' property name
      steps:
        (data.steps as SequenceData["steps"]) ??
        (data.beats as SequenceData["steps"]) ??
        [],
      startPlacement: data.startPlacement as SequenceData["startPlacement"],
      startingPlacement:
        data.startingPlacement as SequenceData["startingPlacement"],
      startingPlacementGroup:
        data.startingPlacementGroup as SequenceData["startingPlacementGroup"],
      thumbnails: (data.thumbnails as readonly string[]) ?? [],
      sequenceLength: data.sequenceLength as number | undefined,
      author: data.author as string | undefined,
      level: data.level as number | undefined,
      dateAdded: data.dateAdded
        ? new Date(data.dateAdded as string)
        : undefined,
      gridMode: data.gridMode as SequenceData["gridMode"],
      // propType removed - prop type is a viewer preference, not sequence data
      isFavorite: (data.isFavorite as boolean) ?? false,
      isCircular: (data.isCircular as boolean) ?? false,
      loopType: data.loopType as SequenceData["loopType"],
      orientationCycleCount:
        data.orientationCycleCount as SequenceData["orientationCycleCount"],
      difficultyLevel: data.difficultyLevel as string | undefined,
      tags: (data.tags as readonly string[]) ?? [],
      metadata: (data.metadata as Record<string, unknown>) ?? {},
      ownerId: data.ownerId as string | undefined,
      ownerDisplayName: data.ownerDisplayName as string | undefined,
      ownerAvatarUrl: data.ownerAvatarUrl as string | undefined,
      // Pass through compositional fields so the hydrator can derive steps
      leftSoloProp: data.leftSoloProp as SequenceData["leftSoloProp"],
      rightSoloProp: data.rightSoloProp as SequenceData["rightSoloProp"],
      stepPairings: data.stepPairings as SequenceData["stepPairings"],
      leftPathHash: data.leftPathHash as string | undefined,
      rightPathHash: data.rightPathHash as string | undefined,
      leftSoloHash: data.leftSoloHash as string | undefined,
      rightSoloHash: data.rightSoloHash as string | undefined,
    };

    // If compositional fields are present, derive steps from them so
    // the compositional model is the single source of truth.
    try {
      const hydrated = hydrate(seq);

      // Normalize: ensure step 0 (start position) is separated from the steps
      // array. Gallery sequences from Firebase may store it inline, which causes
      // the animation orchestrator to count an extra beat and shift all indices.
      return this.normalizeStartPlacement(hydrated);
    } catch {
      return this.normalizeStartPlacement(seq);
    }
  }

  /**
   * Ensure step 0 (start position) is not mixed into the steps array.
   * Firestore data may use the legacy format where beat 0 sits alongside
   * motion beats, which throws off the animation orchestrator's indexing.
   */
  private normalizeStartPlacement(seq: SequenceData): SequenceData {
    if (!seq.steps?.length) return seq;

    const hasStep0 = seq.steps.some((s) => s.stepNumber === 0);
    if (!hasStep0) return seq;

    const steps = seq.steps.filter((s) => s.stepNumber !== 0);

    // If no startPlacement is set, derive it from the step 0 entry
    if (!seq.startPlacement && !seq.startingPlacement) {
      const step0 = seq.steps.find((s) => s.stepNumber === 0)!;
      return {
        ...seq,
        steps,
        startPlacement: {
          isStartPlacement: true,
          id: step0.id || `start-${seq.id}`,
          letter: step0.letter ?? null,
          endPlacement: step0.endPlacement ?? step0.startPlacement ?? null,
          motions: step0.motions,
        },
      };
    }

    return { ...seq, steps };
  }
}
