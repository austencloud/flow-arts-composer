
// Note: BrowseFilterType has been moved to filtering/domain/filtering-enums.ts
// and is re-exported from this module's index.ts for compatibility

export enum BrowseSortMethod {
  ALPHABETICAL = "alphabetical",
  DATE_ADDED = "date",
  DIFFICULTY_LEVEL = "level",
  SEQUENCE_LENGTH = "length",
  /** By the mandala the sequence draws, sparse to dense (sequence-density.ts). */
  DENSITY = "density",
  AUTHOR = "author",
  POPULARITY = "popularity",
}
