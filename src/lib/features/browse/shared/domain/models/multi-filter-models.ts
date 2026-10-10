/**
 * Multi-Filter Models
 *
 * Types supporting simultaneous active filters with AND logic.
 * Each filter type can have at most one active value.
 */

import type { BrowseFilterType } from "#lib/shared/persistence/domain/enums/filtering-enums.js";
import type { BrowseFilterValue } from "#lib/shared/persistence/domain/types/filtering-types.js";

/**
 * Represents a single active filter with display metadata for chip rendering.
 */
export interface ActiveFilter {
  type: BrowseFilterType;
  value: BrowseFilterValue;
  /** Human-readable label for chip display (e.g., "Level 2", "Favorites") */
  label: string;
  /** CSS color for chip accent - a CSS variable reference or hex value */
  chipColor: string;
}

/**
 * Serializable form of the active filters map for localStorage persistence.
 * Map<string, ActiveFilter> serializes as Array<[string, ActiveFilter]>.
 */
export type SerializedFilters = Array<[string, ActiveFilter]>;
