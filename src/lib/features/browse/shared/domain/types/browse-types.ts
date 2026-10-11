/**
 * Browse Type Aliases
 *
 * Type aliases and utility types for gallery functionality.
 * Separated from interfaces and enums for clean architecture.
 */

// Re-export filtering types for compatibility
export type { BrowseFilterValue } from "#lib/shared/persistence/domain/types/filtering-types.js";

// Browse-specific type aliases
export type SortDirection = "asc" | "desc";
export type FilterPreset =
  | "all"
  | "favorites"
  | "practice"
  | "easy"
  | "medium"
  | "hard"
  | "recent";
export type NavigationSection = "top" | "bottom" | string;
