/**
 * Browse Filter Service
 *
 * Handles all filtering operations for gallery sequences.
 * Each filter type has its own dedicated method for clarity.
 */

import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { stripWordNotation } from "$lib/shared/foundation/utils/word-notation";
import { BrowseFilterType } from "$lib/shared/persistence/domain/enums/filtering-enums";
import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import type { BrowseFilterValue } from "$lib/shared/persistence/domain/types/filtering-types";
import type {
  LOOPType} from "$lib/shared/foundation/domain/models/generation/circular-models";
import {
  LOOP_TYPE_LABELS,
} from "$lib/shared/foundation/domain/models/generation/circular-models";
import { LOOPComponent } from "$lib/shared/foundation/domain/models/generation/generate-models";
import { parseLoopComponents } from "$lib/shared/create/services/loop-type-utils";
import { detectRotationPeriod } from "$lib/shared/create/domain/detect-rotation-period";
import { calculateDifficultyLevel } from "$lib/shared/browse/services/sequence-difficulty-calculator";

// Constants
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const STARTING_LETTER_RANGES = ["A-D", "E-H", "I-L", "M-P", "Q-T", "U-Z"];
const LENGTH_OPTIONS = ["3", "4", "5", "6", "7", "8+"];
const DIFFICULTY_OPTIONS = ["beginner", "intermediate", "advanced"];
const GRID_MODE_OPTIONS = [GridMode.DIAMOND, GridMode.BOX, GridMode.SKEWED];

export class BrowseFilter {

  applyFilter(
    sequences: SequenceData[],
    filterType: BrowseFilterType,
    filterValue: BrowseFilterValue
  ): SequenceData[] {
    if (filterType === BrowseFilterType.ALL_SEQUENCES) {
      return sequences;
    }

    switch (filterType) {
      case BrowseFilterType.STARTING_LETTER:
        return this.filterByStartingLetter(sequences, filterValue);
      case BrowseFilterType.CONTAINS_LETTERS:
        return this.filterByContainsLetters(sequences, filterValue);
      case BrowseFilterType.LENGTH:
        return this.filterByLength(sequences, filterValue);
      case BrowseFilterType.DIFFICULTY:
        return this.filterByDifficulty(sequences, filterValue);
      case BrowseFilterType.STARTING_PLACEMENT:
        return this.filterByStartingPlacement(sequences, filterValue);
      case BrowseFilterType.END_PLACEMENT:
        return this.filterByEndPlacement(sequences, filterValue);
      case BrowseFilterType.AUTHOR:
        return this.filterByAuthor(sequences, filterValue);
      case BrowseFilterType.GRID_MODE:
        return this.filterByGridMode(sequences, filterValue);
      case BrowseFilterType.FAVORITES:
        return this.filterByFavorites(sequences);
      case BrowseFilterType.RECENT:
        return this.filterByRecent(sequences);
      case BrowseFilterType.LOOP_TYPE:
        return this.filterByLOOPType(sequences, filterValue);
      default:
        return sequences;
    }
  }

  getFilterOptions(
    filterType: BrowseFilterType,
    sequences: SequenceData[]
  ): string[] {
    switch (filterType) {
      case BrowseFilterType.STARTING_LETTER:
        return STARTING_LETTER_RANGES;
      case BrowseFilterType.LENGTH:
        return LENGTH_OPTIONS;
      case BrowseFilterType.DIFFICULTY:
        return DIFFICULTY_OPTIONS;
      case BrowseFilterType.AUTHOR:
        return this.getUniqueAuthors(sequences);
      case BrowseFilterType.GRID_MODE:
        return GRID_MODE_OPTIONS;
      case BrowseFilterType.LOOP_TYPE:
        return this.getLOOPTypeOptions(sequences);
      default:
        return [];
    }
  }

  // Filter Methods

  private filterByStartingLetter(
    sequences: SequenceData[],
    filterValue: BrowseFilterValue
  ): SequenceData[] {
    if (!filterValue || typeof filterValue !== "string") {
      return sequences;
    }

    // Handle range format (e.g., "A-D")
    if (filterValue.includes("-")) {
      return this.filterByLetterRange(sequences, filterValue);
    }

    // Handle single letter
    return sequences.filter(
      (seq) => stripWordNotation(seq.word)[0]?.toUpperCase() === filterValue.toUpperCase()
    );
  }

  private filterByLetterRange(
    sequences: SequenceData[],
    range: string
  ): SequenceData[] {
    const [start, end] = range.split("-");
    if (!start || !end) {
      return sequences;
    }

    return sequences.filter((seq) => {
      const firstLetter = stripWordNotation(seq.word)[0]?.toUpperCase();
      return firstLetter && firstLetter >= start && firstLetter <= end;
    });
  }

  private filterByContainsLetters(
    sequences: SequenceData[],
    filterValue: BrowseFilterValue
  ): SequenceData[] {
    if (!filterValue || typeof filterValue !== "string") {
      return sequences;
    }

    const searchTerm = filterValue.toLowerCase();
    
    // Sort sequences to prioritize those starting with the searchTerm
    return sequences.filter((seq) => {
      const word = stripWordNotation(seq.word).toLowerCase();
      const name = seq.name.toLowerCase();
      const intended = seq.intendedWord?.toLowerCase() || "";
      const display = seq.displayName?.toLowerCase() || "";

      return (
        word.includes(searchTerm) ||
        name.includes(searchTerm) ||
        intended.includes(searchTerm) ||
        display.includes(searchTerm)
      );
    }).sort((a, b) => {
      // Primary priority: Word starts with search term
      const aStarts = stripWordNotation(a.word).toLowerCase().startsWith(searchTerm);
      const bStarts = stripWordNotation(b.word).toLowerCase().startsWith(searchTerm);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;

      // Secondary priority: Name starts with search term
      const aNameStarts = a.name.toLowerCase().startsWith(searchTerm);
      const bNameStarts = b.name.toLowerCase().startsWith(searchTerm);
      if (aNameStarts && !bNameStarts) return -1;
      if (!aNameStarts && bNameStarts) return 1;

      return 0;
    });
  }

  private filterByLength(
    sequences: SequenceData[],
    filterValue: BrowseFilterValue
  ): SequenceData[] {
    if (!filterValue) {
      return sequences;
    }

    // Handle "8+" case
    if (filterValue === "8+") {
      return sequences.filter((seq) => (seq.sequenceLength ?? 0) >= 8);
    }

    // Handle numeric length
    const length = parseInt(String(filterValue));
    if (isNaN(length)) {
      return sequences;
    }

    return sequences.filter((seq) => seq.sequenceLength === length);
  }

  private filterByDifficulty(
    sequences: SequenceData[],
    filterValue: BrowseFilterValue
  ): SequenceData[] {
    if (!filterValue) {
      return sequences;
    }

    const targetLevel =
      typeof filterValue === "number"
        ? filterValue
        : parseInt(String(filterValue));
    if (isNaN(targetLevel)) {
      return sequences;
    }

    // Map string difficulty names to numeric levels
    const difficultyToLevel: Record<string, number> = {
      beginner: 1,
      intermediate: 2,
      advanced: 3,
      mythic: 4,
      legendary: 5,
    };

    return sequences.filter((seq) => {
      // First try sequence.level (numeric)
      if (seq.level !== undefined && seq.level !== null) {
        return seq.level === targetLevel;
      }

      // Then try mapping difficultyLevel (string) to number
      if (seq.difficultyLevel) {
        const mappedLevel = difficultyToLevel[seq.difficultyLevel.toLowerCase()];
        if (mappedLevel !== undefined) {
          return mappedLevel === targetLevel;
        }
      }

      // Finally, calculate from steps (library sequences often don't have level stored)
      if (seq.steps && seq.steps.length > 0) {
        const calculatedLevel = calculateDifficultyLevel([...seq.steps]);
        return calculatedLevel === targetLevel;
      }

      return false;
    });
  }

  private filterByStartingPlacement(
    sequences: SequenceData[],
    filterValue: BrowseFilterValue
  ): SequenceData[] {
    if (!filterValue) {
      return sequences;
    }

    // Extract the position to filter by
    // filterValue can be a PictographData object (from position picker) or a string
    let targetPosition: string | null = null;

    if (typeof filterValue === "object" && filterValue !== null) {
      // PictographData object - extract position from startPlacement field
      const pictoData = filterValue as { startPlacement?: string | null };
      targetPosition = pictoData.startPlacement?.toLowerCase() ?? null;
    } else if (typeof filterValue === "string") {
      // Direct string value (e.g., "alpha1", "beta5")
      targetPosition = filterValue.toLowerCase();
    }

    if (!targetPosition) {
      return sequences;
    }

    // Extract position group (alpha, beta, gamma) for fallback matching
    const targetGroup = targetPosition.replace(/[0-9]/g, "");

    const results = sequences.filter((seq) => {
      // Try exact position match first
      const seqStartPos = seq.startPlacement || seq.startingPlacement;
      if (seqStartPos) {
        // Check gridPlacement field (StartPlacementData)
        const gridPos = (seqStartPos as { gridPlacement?: string | null })
          .gridPlacement;
        if (gridPos?.toLowerCase() === targetPosition) {
          return true;
        }

        // Check startPlacement field (PictographData/StepData)
        const startPos = (seqStartPos as { startPlacement?: string | null })
          .startPlacement;
        if (startPos?.toLowerCase() === targetPosition) {
          return true;
        }
      }

      // Fallback: match by position group (alpha, beta, gamma)
      const seqGroup = this.normalizePlacementGroup(seq.startingPlacementGroup);
      if (seqGroup === targetGroup) {
        return true;
      }

      return false;
    });

    return results;
  }

  private filterByEndPlacement(
    sequences: SequenceData[],
    filterValue: BrowseFilterValue
  ): SequenceData[] {
    if (!filterValue) {
      return sequences;
    }

    // Extract the position to filter by
    // filterValue can be a PictographData object (from position picker) or a string
    let targetPosition: string | null = null;

    if (typeof filterValue === "object" && filterValue !== null) {
      // PictographData object - extract position from startPlacement field (which represents the end position for filtering)
      const pictoData = filterValue as { startPlacement?: string | null };
      targetPosition = pictoData.startPlacement?.toLowerCase() ?? null;
    } else if (typeof filterValue === "string") {
      // Direct string value (e.g., "alpha1", "beta5")
      targetPosition = filterValue.toLowerCase();
    }

    if (!targetPosition) {
      return sequences;
    }

    // Extract position group (alpha, beta, gamma) for fallback matching
    const targetGroup = targetPosition.replace(/[0-9]/g, "");

    return sequences.filter((seq) => {
      // Get the last beat to check end position
      const lastStep = seq.steps[seq.steps.length - 1];
      if (!lastStep) {
        return false;
      }

      // Check endPlacement field on the last beat
      const endPos = (lastStep as { endPlacement?: string | null }).endPlacement;
      if (endPos?.toLowerCase() === targetPosition) {
        return true;
      }

      // Check startPlacement on last beat (some data might use this)
      const startPos = (lastStep as { startPlacement?: string | null })
        .startPlacement;
      if (startPos?.toLowerCase() === targetPosition) {
        return true;
      }

      // Fallback: match by position group from any available position data
      if (endPos) {
        const endGroup = endPos.toLowerCase().replace(/[0-9]/g, "");
        if (endGroup === targetGroup) {
          return true;
        }
      }

      return false;
    });
  }

  private filterByAuthor(
    sequences: SequenceData[],
    filterValue: BrowseFilterValue
  ): SequenceData[] {
    if (!filterValue) {
      return sequences;
    }

    return sequences.filter((seq) => seq.author === filterValue);
  }

  private filterByGridMode(
    sequences: SequenceData[],
    filterValue: BrowseFilterValue
  ): SequenceData[] {
    if (!filterValue) {
      return sequences;
    }

    return sequences.filter((seq) => (seq.gridMode ?? "diamond") === filterValue);
  }

  private filterByFavorites(sequences: SequenceData[]): SequenceData[] {
    return sequences.filter((seq) => seq.isFavorite);
  }

  private filterByRecent(sequences: SequenceData[]): SequenceData[] {
    const thirtyDaysAgo = new Date(Date.now() - THIRTY_DAYS_MS);
    return sequences.filter((seq) => {
      const dateAdded = seq.dateAdded ?? new Date(0);
      return dateAdded >= thirtyDaysAgo;
    });
  }

  /**
   * Filter sequences by LOOP type (Continuous Assembly Pattern)
   * Supports special values:
   * - "circular" - all circular sequences regardless of LOOP type
   * - "non_circular" - all non-circular sequences
   * - "circular_untyped" - circular sequences without a detected LOOP type
   * - specific LOOPType enum values
   */
  private filterByLOOPType(
    sequences: SequenceData[],
    filterValue: BrowseFilterValue
  ): SequenceData[] {
    if (!filterValue) {
      return sequences;
    }

    const filterStr = String(filterValue);

    // Component-based filtering (new): "component:rotated_halved", "component:mirrored", etc.
    if (filterStr.startsWith("component:")) {
      return this.filterByLOOPComponent(sequences, filterStr.slice("component:".length));
    }

    // Special case: filter all circular sequences
    if (filterStr === "circular" || filterStr === "all_circular") {
      return sequences.filter((seq) => seq.isCircular === true);
    }

    // Special case: filter all non-circular sequences
    if (filterStr === "non_circular") {
      return sequences.filter((seq) => !seq.isCircular);
    }

    // Special case: circular but no specific LOOP type detected
    if (filterStr === "circular_untyped") {
      return sequences.filter((seq) => seq.isCircular && !seq.loopType);
    }

    // Filter by specific LOOP type
    return sequences.filter((seq) => {
      if (!seq.isCircular) return false;
      return seq.loopType === filterStr;
    });
  }

  private getSequenceComponents(seq: SequenceData): readonly LOOPComponent[] {
    if (seq.components?.length) return seq.components;
    if (seq.loopType) return Array.from(parseLoopComponents(seq.loopType as LOOPType));
    return [];
  }

  private getSequencePeriod(seq: SequenceData): number {
    if (seq.period !== undefined) return seq.period;
    if (seq.steps?.length) return detectRotationPeriod(seq.id, seq.steps);
    return 2;
  }

  private filterByLOOPComponent(
    sequences: SequenceData[],
    componentKey: string
  ): SequenceData[] {
    if (componentKey === "rotated_halved") {
      return sequences.filter((seq) => {
        const comps = this.getSequenceComponents(seq);
        return comps.includes(LOOPComponent.ROTATED) && this.getSequencePeriod(seq) <= 2;
      });
    }
    if (componentKey === "rotated_quartered") {
      return sequences.filter((seq) => {
        const comps = this.getSequenceComponents(seq);
        return comps.includes(LOOPComponent.ROTATED) && this.getSequencePeriod(seq) === 4;
      });
    }

    const componentEnum = componentKey as LOOPComponent;
    return sequences.filter((seq) => this.getSequenceComponents(seq).includes(componentEnum));
  }

  // Helper Methods

  private getUniqueAuthors(sequences: SequenceData[]): string[] {
    const authors = new Set<string>();

    for (const sequence of sequences) {
      if (sequence.author) {
        authors.add(sequence.author);
      }
    }

    return Array.from(authors).sort();
  }

  /**
   * Get available LOOP type options with counts
   * Returns array of strings in format: "cap_type_value" or "circular" for all circular
   */
  private getLOOPTypeOptions(sequences: SequenceData[]): string[] {
    const options: string[] = [];

    // Count circular sequences
    const circularCount = sequences.filter((s) => s.isCircular).length;
    if (circularCount > 0) {
      options.push("circular"); // "All Circular" option
    }

    // Count by LOOP type
    const loopTypeCounts = new Map<string, number>();
    for (const seq of sequences) {
      if (seq.loopType) {
        const current = loopTypeCounts.get(seq.loopType) ?? 0;
        loopTypeCounts.set(seq.loopType, current + 1);
      }
    }

    // Add LOOP types that have sequences (sorted by label)
    const sortedTypes = Array.from(loopTypeCounts.keys()).sort((a, b) => {
      const labelA = LOOP_TYPE_LABELS[a as LOOPType] ?? a;
      const labelB = LOOP_TYPE_LABELS[b as LOOPType] ?? b;
      return labelA.localeCompare(labelB);
    });

    options.push(...sortedTypes);

    return options;
  }

  /**
   * Get count of sequences matching a LOOP type
   * Useful for displaying counts in filter UI
   */
  getLOOPTypeCount(sequences: SequenceData[], loopType: string): number {
    if (loopType === "circular" || loopType === "all_circular") {
      return sequences.filter((s) => s.isCircular).length;
    }
    return sequences.filter((s) => s.loopType === loopType).length;
  }

  /**
   * Normalize position group to handle different formats
   * Handles: "alpha", "Alpha", "ALPHA", "α", etc.
   */
  private normalizePlacementGroup(group: string | undefined | null): string {
    if (!group) return "";

    const normalized = group.toLowerCase().trim();

    // Map Greek letters to English names
    const greekMap: Record<string, string> = {
      α: "alpha",
      β: "beta",
      γ: "gamma",
    };

    if (greekMap[normalized]) {
      return greekMap[normalized];
    }

    // Remove any numbers from the group name
    return normalized.replace(/[0-9]/g, "");
  }
}
