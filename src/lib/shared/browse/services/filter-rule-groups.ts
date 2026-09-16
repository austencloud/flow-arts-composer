/**
 * Filter rule grouping — the data layer behind the grouped rule strip.
 *
 * Turns a flat filter list into per-category groups with the connective word
 * the strip renders between values ("Start: Alpha or Beta · LOOPs: Mirrored
 * and Swapped"). Pure functions; FilterRuleStrip.svelte owns the rendering.
 */

import { BrowseFilterType } from "$lib/shared/persistence/domain/enums/filtering-enums";
import {
  OR_STACKING_TYPES,
  CONNECTIVE_STACKING_TYPES,
  type FilterConnectives,
} from "./multi-filter";

/** The slice of a stored/active filter the strip needs. */
export interface RuleStripFilter {
  /** Engine map key — the handle for removal. */
  key: string;
  /** BrowseFilterType string value. */
  type: string;
  label: string;
  chipColor: string;
}

/** A strip filter plus its de-duplicated visible label ("Level 2" under the
 * "Level" group renders as "2"; accessible names keep the full label). */
export interface RuleStripChip extends RuleStripFilter {
  displayLabel: string;
}

export interface RuleGroup {
  /** BrowseFilterType string value shared by every chip in the group. */
  type: string;
  /** Category display name ("Start", "Level", "LOOPs"…). */
  label: string;
  /** Word rendered between values; null for single-value groups. */
  connectiveWord: "or" | "and" | null;
  chips: RuleStripChip[];
}

const CATEGORY_LABELS: Partial<Record<string, string>> = {
  [BrowseFilterType.STARTING_PLACEMENT]: "Start",
  [BrowseFilterType.END_PLACEMENT]: "End",
  [BrowseFilterType.DIFFICULTY]: "Level",
  [BrowseFilterType.LENGTH]: "Length",
  [BrowseFilterType.STARTING_LETTER]: "Letters",
  [BrowseFilterType.CONTAINS_LETTERS]: "Contains",
  [BrowseFilterType.LETTER_OCCURRENCE]: "Letter",
  [BrowseFilterType.GRID_MODE]: "Grid",
  [BrowseFilterType.OWNER]: "Creator",
  [BrowseFilterType.AUTHOR]: "Author",
  [BrowseFilterType.PERFORMANCE_AVAILABILITY]: "Performances",
  [BrowseFilterType.RECENT_PERFORMANCE]: "Performed",
  [BrowseFilterType.LOOP_TYPE]: "LOOPs",
  [BrowseFilterType.TND_FAMILY]: "Families",
  [BrowseFilterType.MAX_TURN_INTENSITY]: "Max turns",
  // Reads as the sentence it is: "In: Bella Sequences · Level: 2".
  [BrowseFilterType.COLLECTION]: "In",
  [BrowseFilterType.REVERSAL_PATTERN]: "Reversals",
  [BrowseFilterType.FAVORITES]: "Favorites",
  [BrowseFilterType.RECENT]: "Added",
  search: "Search",
};

/**
 * Group a flat filter list by category, in first-appearance order. The
 * connective word mirrors the applied semantics: OR-stacking categories read
 * "or"; connective-bearing categories (LOOPs, T&D) read whatever the passed
 * connectives resolve to, defaulting to the engine's "any" default.
 */
export function groupRuleFilters(
  filters: readonly RuleStripFilter[],
  connectives?: FilterConnectives
): RuleGroup[] {
  const groups = new Map<string, RuleGroup>();

  for (const filter of filters) {
    let group = groups.get(filter.type);
    if (!group) {
      group = {
        type: filter.type,
        label: CATEGORY_LABELS[filter.type] ?? filter.type,
        connectiveWord: null,
        chips: [],
      };
      groups.set(filter.type, group);
    }
    // "Level: Level 2" reads stuttered — trim the category word off the chip
    // when the label repeats it, unless nothing would remain.
    const prefix = `${group.label} `;
    const displayLabel =
      filter.label.startsWith(prefix) && filter.label.length > prefix.length
        ? filter.label.slice(prefix.length)
        : filter.label;
    group.chips.push({ ...filter, displayLabel });
  }

  for (const group of groups.values()) {
    if (group.chips.length < 2) continue;
    const type = group.type as BrowseFilterType;
    if (OR_STACKING_TYPES.has(type)) {
      group.connectiveWord = "or";
    } else if (CONNECTIVE_STACKING_TYPES.has(type)) {
      group.connectiveWord =
        (connectives?.[group.type] ?? "any") === "all" ? "and" : "or";
    }
  }

  return [...groups.values()];
}
