/**
 * Filtering Domain Enums
 *
 * Core enumerations for the filtering system.
 */

/**
 * Simple filter types for Browse tab - Keep It Simple!
 */
export enum BrowseFilterType {
  STARTING_LETTER = "starting_letter",
  CONTAINS_LETTERS = "contains_letters",
  /** Exact notation occurrence. Unlike CONTAINS_LETTERS search, this never
   * matches a sequence name, display title, notes, or other prose. */
  LETTER_OCCURRENCE = "letter_occurrence",
  LENGTH = "length",
  DIFFICULTY = "difficulty",
  AUTHOR = "author",
  /** Filter by the owning account's display name. AUTHOR matches the legacy
   * metadata field (often a tool attribution like "TKA Explore"); OWNER is
   * the human creator shown on cards. */
  OWNER = "owner",
  GRID_MODE = "gridMode",
  STARTING_PLACEMENT = "startPlacement",
  END_PLACEMENT = "endPlacement",
  RECENT = "recent",
  /** Public performance availability projected onto publicSequences. This
   * never reveals private or collaborators-only video existence. */
  PERFORMANCE_AVAILABILITY = "performance_availability",
  /** Sequences whose newest public performance was shared in the last 30
   * days. This is intentionally separate from RECENT, which means the
   * sequence itself was recently added. */
  RECENT_PERFORMANCE = "recent_performance",
  FAVORITES = "favorites",
  ALL_SEQUENCES = "all_sequences",
  /** Filter by circular sequences and LOOP type */
  LOOP_TYPE = "cap_type",
  /** Filter by Timing & Direction family (split/tog/quarter × same/opp),
   * derived per step from arc geometry — a sequence matches when ANY of its
   * steps classifies into the family. Stackable (composite keys) like LOOP_TYPE. */
  TND_FAMILY = "tnd_family",
  /** Filter to members of one of the user's library collections. Value = the
   * collection id; membership resolves through the resolver registered by
   * collections-state (browse-filter stays pure of feature imports).
   * One-per-type: picking a collection replaces the previous pick. */
  COLLECTION = "collection",
  /** Filter by a turn-intensity CEILING: a sequence matches "≤ N turns" when no
   * motion's numeric turns exceed N. "fl" (float) always passes. One-per-type. */
  MAX_TURN_INTENSITY = "max_turn_intensity",
  /** Filter by reversal pattern id (from REVERSAL_PATTERNS): "continuous",
   * "book", "red-book", … A sequence with no stored reversalPattern is treated
   * as "continuous" (matches the app-wide reversal display policy). One-per-type. */
  REVERSAL_PATTERN = "reversal_pattern",
}
