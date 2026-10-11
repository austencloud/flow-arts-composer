/**
 * gallery-deck-source.ts
 *
 * The third deck source (beside LOOP live-generation and TnD enumeration):
 * filter-queries the operator's own library (users/{userId}/sequences) and
 * turns the matches into DeckReleaseCards. Loaders are injectable so the
 * filtering/cap/dedup logic is unit-testable without Firestore.
 *
 * Native query filters (collection, tag, word, sort, limit) go through the
 * library repository; the axes it can't express server-side (loop type, period,
 * level, length) are applied client-side over the small result set.
 */
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type {
  DeckReleaseCard,
  GalleryFilters,
} from "../domain/models/DeckRelease";
import { LOOPType } from "#lib/shared/foundation/domain/models/generation/circular-models.js";
import { LOOPComponent } from "#lib/shared/foundation/domain/models/generation/generate-models.js";
import { ACTIVE_DIFFICULTY_LEVELS } from "#lib/shared/config/difficulty-styles.js";
import { BrowseFilterType } from "#lib/shared/persistence/domain/enums/filtering-enums.js";
import { BrowseSortMethod } from "#lib/shared/browse/domain/enums/browse-enums.js";
import { LOOP_COMPONENT_MAP } from "#lib/shared/browse/domain/constants/loop-constants.js";
import { parseLoopComponents } from "#lib/shared/create/services/loop-type-utils.js";
import type {
  SmartFilterSpec,
  StoredSmartFilter,
} from "#lib/shared/library/domain/models/collection.js";
import type {
  LibraryPageCursor,
  LibraryQueryOptions,
  LibrarySequencePage,
} from "#lib/shared/library/domain/library-contract-types.js";

export type { GalleryFilters };
// NOTE: the library repository + firebase are lazy-imported inside defaultLoaders
// (not at module scope) so this module imports clean under vitest — the static
// Firestore/protobufjs chain crashes the test runner. Tests inject loaders and
// never touch the defaults.

/** The pseudo-catalog id stamped on gallery cards so loadSelectedSequences knows
 *  to resolve them via the library loader instead of the catalog loader. */
export const GALLERY_SOURCE_ID = "gallery";

export interface GalleryDeckSelection {
  filterSpec: SmartFilterSpec;
  sequences: readonly SequenceData[];
}

/** PeriodCard semantics: quartered = 4, halved = 2 (orientation-cycle count). */
const PERIOD_VALUE: Record<"halved" | "quartered", number> = {
  halved: 2,
  quartered: 4,
};

/** Injectable Firestore-touching seam so tests can drive pure logic. */
export interface GalleryLoaders {
  listPage: (
    opts: LibraryQueryOptions,
    cursor: LibraryPageCursor | null
  ) => Promise<LibrarySequencePage<SequenceData>>;
  fetchByIds: (ids: string[]) => Promise<SequenceData[]>;
}

const defaultLoaders: GalleryLoaders = {
  listPage: async (opts, cursor) => {
    const { getLibraryRepository } =
      await import("#lib/shared/library/get-library-repository.js");
    return getLibraryRepository().getSequencePage(opts, cursor);
  },
  fetchByIds: async (ids) => {
    if (ids.length === 0) return [];
    const [{ authState }, { getFirestoreInstance }, { batchFetchSequences }] =
      await Promise.all([
        import("#lib/shared/auth/state/auth-state.svelte.js"),
        import("#lib/shared/auth/firebase.js"),
        import("#lib/shared/library/services/collection-firestore-mapper.js"),
      ]);
    const userId = authState.effectiveUserId;
    if (!userId) return [];
    const firestore = await getFirestoreInstance();
    return batchFetchSequences(firestore, userId, ids);
  },
};

const VALID_LOOP_TYPES = new Set<string>(Object.values(LOOPType));
const ACTIVE_LEVELS = new Set<number>(ACTIVE_DIFFICULTY_LEVELS);

/** Make saved Gallery recipes safe to reuse after filter contracts evolve. */
export function normalizeGalleryFilters(
  filters: GalleryFilters
): GalleryFilters {
  const loopTypes = filters.loopTypes
    ?.map((loopType) =>
      loopType === "rotated_mirrored" ? LOOPType.MIRRORED_ROTATED : loopType
    )
    .filter(
      (loopType, index, all) =>
        VALID_LOOP_TYPES.has(loopType) && all.indexOf(loopType) === index
    );
  const levels = filters.levels?.filter(
    (level, index, all) =>
      ACTIVE_LEVELS.has(level) && all.indexOf(level) === index
  );

  return {
    ...filters,
    loopTypes: loopTypes?.length ? loopTypes : undefined,
    levels: levels?.length ? levels : undefined,
  };
}

/**
 * Translate recipes created before Gallery adopted the canonical Browse rule.
 * The old tag-only axis has no Browse rule equivalent, so it remains on the
 * legacy recipe for Refresh. Every shared axis reopens in the real workspace.
 */
export function legacyGalleryFiltersToSpec(
  filters: GalleryFilters
): SmartFilterSpec {
  const normalized = normalizeGalleryFilters(filters);
  const stored: StoredSmartFilter[] = [];

  function add(
    type: BrowseFilterType,
    value: string | number,
    label: string,
    chipColor = "#6aa0ff"
  ): void {
    stored.push({
      key: `${type}:${String(value)}`,
      type: String(type),
      value,
      label,
      chipColor,
    });
  }

  if (normalized.collectionId) {
    add(
      BrowseFilterType.COLLECTION,
      normalized.collectionId,
      "Saved collection"
    );
  }

  for (const level of normalized.levels ?? []) {
    add(BrowseFilterType.DIFFICULTY, level, `Level ${level}`);
  }
  for (const length of normalized.lengths ?? []) {
    add(BrowseFilterType.LENGTH, length, `${length} steps`);
  }

  const components = new Set<LOOPComponent>();
  for (const loopType of normalized.loopTypes ?? []) {
    for (const component of parseLoopComponents(loopType)) {
      components.add(component);
    }
  }
  for (const component of components) {
    const info = LOOP_COMPONENT_MAP.get(component);
    if (!info) continue;
    const value =
      component === LOOPComponent.ROTATED && normalized.period
        ? `component:rotated_${normalized.period}`
        : `component:${component}`;
    add(BrowseFilterType.LOOP_TYPE, value, info.label, info.color);
  }

  return {
    source: "my-library",
    filters: stored,
    searchQuery: normalized.wordQuery?.trim() || undefined,
    sortMethod: BrowseSortMethod.DATE_ADDED,
    sortDirection: "asc",
    connectives: {
      [BrowseFilterType.LOOP_TYPE]: "all",
    },
  };
}

/** Axes the library query can't express server-side, applied over the result. */
function matchesClientFilters(
  seq: SequenceData,
  filters: GalleryFilters
): boolean {
  if (filters.loopTypes?.length) {
    const lt = seq.loopType == null ? "" : String(seq.loopType);
    if (!filters.loopTypes.includes(lt)) return false;
  }
  if (filters.period) {
    if (seq.period == null || seq.period !== PERIOD_VALUE[filters.period])
      return false;
  }
  if (
    filters.levels?.length &&
    !(seq.level != null && filters.levels.includes(seq.level))
  ) {
    return false;
  }
  if (filters.lengths?.length) {
    const len = seq.sequenceLength ?? seq.steps?.length ?? 0;
    if (!filters.lengths.includes(len)) return false;
  }
  return true;
}

function toGalleryCard(
  seq: SequenceData,
  index: number,
  notes: string
): DeckReleaseCard {
  return {
    sequenceId: seq.id ?? `gallery-${index}`,
    sourceCatalogId: GALLERY_SOURCE_ID,
    stepCount: seq.steps?.length ?? seq.sequenceLength ?? 0,
    word: seq.word ?? seq.name ?? "",
    position: index + 1,
    footer: { center: notes },
  };
}

export function buildGalleryDeckResult(
  sequences: readonly SequenceData[],
  cap: number,
  notes = ""
): { cards: DeckReleaseCard[]; sequences: SequenceData[] } {
  const picked = sequences.slice(0, Math.max(0, Math.floor(cap)));
  return {
    cards: picked.map((sequence, index) =>
      toGalleryCard(sequence, index, notes)
    ),
    sequences: picked,
  };
}

/**
 * Query the library, apply every filter, order newest-first, dedup by id, and
 * cap. Returns BOTH the cards (for persistence/release) and the resolved
 * sequences (so a live Draw can render without a second resolve round-trip).
 */
export async function queryGalleryDeck(
  filters: GalleryFilters,
  cap: number,
  notes = "",
  loaders: GalleryLoaders = defaultLoaders
): Promise<{ cards: DeckReleaseCard[]; sequences: SequenceData[] }> {
  if (cap <= 0) return { cards: [], sequences: [] };

  const normalizedFilters = normalizeGalleryFilters(filters);
  const pageSize = Math.min(100, Math.max(32, cap * 2));
  const options: LibraryQueryOptions = {
    collectionId: normalizedFilters.collectionId,
    tagIds: normalizedFilters.tagId ? [normalizedFilters.tagId] : undefined,
    searchQuery: normalizedFilters.wordQuery?.trim() || undefined,
    sortBy: "createdAt",
    sortDirection: "desc",
    limit: pageSize,
  };

  const seen = new Set<string>();
  const visitedCursors = new Set<string>();
  const picked: SequenceData[] = [];
  let cursor: LibraryPageCursor | null = null;

  while (picked.length < cap) {
    const page = await loaders.listPage(options, cursor);
    for (const seq of page.sequences) {
      if (!matchesClientFilters(seq, normalizedFilters)) continue;
      if (seq.id) {
        if (seen.has(seq.id)) continue;
        seen.add(seq.id);
      }
      picked.push(seq);
      if (picked.length >= cap) break;
    }

    if (page.exhausted || !page.nextCursor) break;
    if (visitedCursors.has(page.nextCursor.documentId)) break;
    visitedCursors.add(page.nextCursor.documentId);
    cursor = page.nextCursor;
  }

  return buildGalleryDeckResult(picked, cap, notes);
}

/**
 * Refresh a released deck through the same engine that powers Gallery and
 * Library. The recipe, filtering semantics, sort, and search all stay owned by
 * Browse instead of growing a second query language in Deck Releaser.
 */
export async function queryGalleryDeckFromSpec(
  spec: SmartFilterSpec,
  cap: number,
  notes = ""
): Promise<{ cards: DeckReleaseCard[]; sequences: SequenceData[] }> {
  const [{ createBrowseEngine }, { applySpecToEngine }] = await Promise.all([
    import("#lib/shared/browse/engine/create-browse-engine.svelte.js"),
    import("#lib/shared/browse/services/smart-filter-spec.js"),
  ]);
  const engine = createBrowseEngine({
    persistKey: null,
    initialSource: "my-library",
    initialSort: BrowseSortMethod.DATE_ADDED,
    sources: ["my-library"],
  });

  try {
    applySpecToEngine(engine, { ...spec, source: "my-library" });
    await engine.initialize();
    if (engine.error) throw new Error(engine.error);
    return buildGalleryDeckResult(engine.sequences, cap, notes);
  } finally {
    engine.destroy();
  }
}

/** Re-resolve a released gallery deck's stored card ids → full SequenceData. */
export async function resolveGalleryCards(
  ids: string[],
  loaders: GalleryLoaders = defaultLoaders
): Promise<SequenceData[]> {
  return loaders.fetchByIds(ids);
}
