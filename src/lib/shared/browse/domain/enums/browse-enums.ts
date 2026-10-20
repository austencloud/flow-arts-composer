
// Note: BrowseFilterType has been moved to filtering/domain/filtering-enums.ts
// and is re-exported from this module's index.ts for compatibility

export enum BrowseSortMethod {
  /**
   * Keep the pool's own order. For hosts that hand the engine an already
   * meaningful order — a collection's curated `sequenceIds` — where any
   * automatic sort would destroy the thing the owner arranged. Falls through
   * the sorter's identity branch; offered in the toolbar only when the host
   * names it (BrowsePanel's `curatedSortLabel`).
   */
  CURATED = "curated",
  ALPHABETICAL = "alphabetical",
  DATE_ADDED = "date",
  DIFFICULTY_LEVEL = "level",
  SEQUENCE_LENGTH = "length",
  /** By the mandala the sequence draws, sparse to dense (sequence-density.ts). */
  DENSITY = "density",
  AUTHOR = "author",
  POPULARITY = "popularity",
}
