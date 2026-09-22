/**
 * Browse Filter
 *
 * Handles all filtering operations for gallery sequences.
 * Each filter type has its own dedicated function for clarity.
 */

import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { BrowseFilterType } from "$lib/shared/persistence/domain/enums/filtering-enums";
import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import type { BrowseFilterValue } from "$lib/shared/persistence/domain/types/filtering-types";
import type { LOOPType } from "$lib/shared/foundation/domain/models/generation/circular-models";
import { LOOP_TYPE_LABELS } from "$lib/shared/foundation/domain/models/generation/circular-models";
import { LOOPComponent } from "$lib/shared/foundation/domain/models/generation/generate-models";
import { parseLoopComponents } from "$lib/shared/create/services/loop-type-utils";
import { detectRotationPeriod } from "$lib/shared/create/domain/detect-rotation-period";
import { calculateDifficultyLevel } from "$lib/shared/browse/services/sequence-difficulty-calculator";
import { resolveBrowseDate } from "$lib/shared/browse/services/browse-date";
import { deriveTnDFromPictograph } from "$lib/shared/pictograph/shared/domain/utils/tnd-deriver";
import { TnDMode } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { filterSequencesByExactLetter } from "$lib/shared/browse/services/sequence-letter-occurrence";
import { stripWordNotation } from "$lib/shared/foundation/utils/word-notation";

// Collection membership
// COLLECTION filters need a collection's member ids — feature data this pure
// module must not import. collections-state registers a resolver at startup;
// reading it inside the engine's $derived pipeline makes membership changes
// reactive for free. No resolver / unknown id → empty result (a stale
// persisted filter surfaces as a dismissible zero-result chip, not as
// silently unfiltered data).
//
// `candidates` is the set this filter is about to narrow. Manual collections
// ignore it — their membership is the stored id array. SMART collections have
// no stored members at all (membership IS a rule), so the resolver evaluates
// their filterSpec against these candidates. Without it every smart collection
// resolved to the empty set and reported 0, indistinguishable from an
// empty manual one.
type CollectionMembershipResolver = (
  collectionId: string,
  candidates: readonly SequenceData[]
) => ReadonlySet<string> | undefined;

let collectionMembershipResolver: CollectionMembershipResolver | null = null;

export function setCollectionMembershipResolver(
  resolver: CollectionMembershipResolver
): void {
  collectionMembershipResolver = resolver;
}

function filterByCollection(
  sequences: SequenceData[],
  filterValue: BrowseFilterValue
): SequenceData[] {
  const memberIds = collectionMembershipResolver?.(
    String(filterValue),
    sequences
  );
  if (!memberIds) return [];
  return sequences.filter((seq) => memberIds.has(seq.id));
}

// Constants
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const STARTING_LETTER_RANGES = ["A-D", "E-H", "I-L", "M-P", "Q-T", "U-Z"];
const LENGTH_OPTIONS = ["3", "4", "5", "6", "7", "8+"];
const DIFFICULTY_OPTIONS = ["beginner", "intermediate", "advanced"];
const GRID_MODE_OPTIONS = [GridMode.DIAMOND, GridMode.BOX, GridMode.SKEWED];

export function applyFilter(
  sequences: SequenceData[],
  filterType: BrowseFilterType,
  filterValue: BrowseFilterValue
): SequenceData[] {
  if (filterType === BrowseFilterType.ALL_SEQUENCES) {
    return sequences;
  }

  switch (filterType) {
    case BrowseFilterType.STARTING_LETTER:
      return filterByStartingLetter(sequences, filterValue);
    case BrowseFilterType.CONTAINS_LETTERS:
      return filterByContainsLetters(sequences, filterValue);
    case BrowseFilterType.LETTER_OCCURRENCE:
      return typeof filterValue === "string"
        ? filterSequencesByExactLetter(sequences, filterValue)
        : sequences;
    case BrowseFilterType.LENGTH:
      return filterByLength(sequences, filterValue);
    case BrowseFilterType.DIFFICULTY:
      return filterByDifficulty(sequences, filterValue);
    case BrowseFilterType.STARTING_PLACEMENT:
      return filterByStartingPlacement(sequences, filterValue);
    case BrowseFilterType.END_PLACEMENT:
      return filterByEndPlacement(sequences, filterValue);
    case BrowseFilterType.AUTHOR:
      return filterByAuthor(sequences, filterValue);
    case BrowseFilterType.OWNER:
      return filterByOwner(sequences, filterValue);
    case BrowseFilterType.GRID_MODE:
      return filterByGridMode(sequences, filterValue);
    case BrowseFilterType.FAVORITES:
      return filterByFavorites(sequences);
    case BrowseFilterType.RECENT:
      return filterByRecent(sequences);
    case BrowseFilterType.PERFORMANCE_AVAILABILITY:
      return filterByPerformanceAvailability(sequences, filterValue);
    case BrowseFilterType.RECENT_PERFORMANCE:
      return filterByRecentPerformance(sequences);
    case BrowseFilterType.LOOP_TYPE:
      return filterByLOOPType(sequences, filterValue);
    case BrowseFilterType.TND_FAMILY:
      return filterByTnDFamily(sequences, filterValue);
    case BrowseFilterType.COLLECTION:
      return filterByCollection(sequences, filterValue);
    case BrowseFilterType.MAX_TURN_INTENSITY:
      return filterByMaxTurnIntensity(sequences, filterValue);
    case BrowseFilterType.REVERSAL_PATTERN:
      return filterByReversalPattern(sequences, filterValue);
    default:
      return sequences;
  }
}

export function getFilterOptions(
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
      return getUniqueAuthors(sequences);
    case BrowseFilterType.GRID_MODE:
      return GRID_MODE_OPTIONS;
    case BrowseFilterType.LOOP_TYPE:
      return getLOOPTypeOptions(sequences);
    default:
      return [];
  }
}

function filterByStartingLetter(
  sequences: SequenceData[],
  filterValue: BrowseFilterValue
): SequenceData[] {
  if (!filterValue || typeof filterValue !== "string") {
    return sequences;
  }

  // Dash-variant base letter (Type 3/5, e.g. "W-", "Σ-"): match the two-char
  // letter exactly. Must run before the range check — "W-" contains "-" and
  // would otherwise fall into the "A-D" range parser, which no-ops on it.
  if (filterValue.length === 2 && filterValue[1] === "-") {
    const target = filterValue.toUpperCase();
    return sequences.filter(
      (seq) => stripWordNotation(seq.word).slice(0, 2).toUpperCase() === target
    );
  }

  // Handle range format (e.g., "A-D")
  if (filterValue.includes("-")) {
    return filterByLetterRange(sequences, filterValue);
  }

  // Handle single letter. A bare letter must NOT swallow its dash variant —
  // "W" means W-words, not W- words (legacy treats them as separate sections).
  return sequences.filter((seq) => {
    const bare = stripWordNotation(seq.word);
    return bare[0]?.toUpperCase() === filterValue.toUpperCase() && bare[1] !== "-";
  });
}

function filterByLetterRange(
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

function filterByContainsLetters(
  sequences: SequenceData[],
  filterValue: BrowseFilterValue
): SequenceData[] {
  if (!filterValue || typeof filterValue !== "string") {
    return sequences;
  }

  const searchTerm = filterValue.toLowerCase();

  // Sort sequences to prioritize those starting with the searchTerm
  return sequences
    .filter((seq) => {
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
    })
    .sort((a, b) => {
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

/** Step count with the same fallback the sorter/drill use (resolveStepCount):
 * legacy/imported docs lack `sequenceLength` and would otherwise be counted
 * into length buckets by the UI but unreachable through the filter. */
function stepCountForFilter(seq: SequenceData): number {
  return seq.sequenceLength ?? seq.steps?.length ?? 0;
}

function filterByLength(
  sequences: SequenceData[],
  filterValue: BrowseFilterValue
): SequenceData[] {
  if (!filterValue) {
    return sequences;
  }

  // Handle "8+" case
  if (filterValue === "8+") {
    return sequences.filter((seq) => stepCountForFilter(seq) >= 8);
  }

  // Handle numeric length
  const length = parseInt(String(filterValue));
  if (isNaN(length)) {
    return sequences;
  }

  return sequences.filter((seq) => stepCountForFilter(seq) === length);
}

function filterByDifficulty(
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

function filterByStartingPlacement(
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

  // A bare-group value ("alpha") means "the whole group"; a specific value
  // ("alpha3") must stay exact. Enabling the group fallback for specific
  // values would silently degrade "alpha3" into "all alpha".
  const isGroupFilter = targetPosition === targetPosition.replace(/[0-9]/g, "");
  const targetGroup = targetPosition.replace(/[0-9]/g, "");

  const results = sequences.filter((seq) => {
    // Try exact position match first
    const seqStartPos = seq.startPlacement || seq.startingPlacement;
    const gridPos = seqStartPos
      ? (seqStartPos as { gridPlacement?: string | null }).gridPlacement
      : null;
    const startPos = seqStartPos
      ? (seqStartPos as { startPlacement?: string | null }).startPlacement
      : null;
    if (gridPos?.toLowerCase() === targetPosition) {
      return true;
    }
    if (startPos?.toLowerCase() === targetPosition) {
      return true;
    }

    // Group-fallback for BARE-GROUP filters only. The explicit group field is
    // often absent on community docs — derive the group from any position
    // string too (normalizePlacementGroup strips the digits, "alpha3" → "alpha").
    if (isGroupFilter) {
      const seqGroup =
        normalizePlacementGroup(seq.startingPlacementGroup) ||
        normalizePlacementGroup(gridPos) ||
        normalizePlacementGroup(startPos);
      if (seqGroup === targetGroup) {
        return true;
      }
    }

    return false;
  });

  return results;
}

function filterByEndPlacement(
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

function filterByAuthor(
  sequences: SequenceData[],
  filterValue: BrowseFilterValue
): SequenceData[] {
  if (!filterValue) {
    return sequences;
  }

  return sequences.filter((seq) => seq.author === filterValue);
}

function filterByOwner(
  sequences: SequenceData[],
  filterValue: BrowseFilterValue
): SequenceData[] {
  if (!filterValue || typeof filterValue !== "string") {
    return sequences;
  }

  return sequences.filter(
    (seq) => (seq.ownerDisplayName ?? "").trim() === filterValue
  );
}

function filterByGridMode(
  sequences: SequenceData[],
  filterValue: BrowseFilterValue
): SequenceData[] {
  if (!filterValue) {
    return sequences;
  }

  return sequences.filter((seq) => (seq.gridMode ?? "diamond") === filterValue);
}

function filterByFavorites(sequences: SequenceData[]): SequenceData[] {
  return sequences.filter((seq) => seq.isFavorite);
}

function filterByRecent(sequences: SequenceData[]): SequenceData[] {
  const thirtyDaysAgo = new Date(Date.now() - THIRTY_DAYS_MS);
  return sequences.filter((seq) => {
    const browseDate = resolveBrowseDate(seq);
    return browseDate !== null && browseDate >= thirtyDaysAgo;
  });
}

function filterByPerformanceAvailability(
  sequences: SequenceData[],
  filterValue: BrowseFilterValue
): SequenceData[] {
  if (filterValue === "has-public-performance") {
    return sequences.filter((seq) => (seq.publicPerformanceCount ?? 0) > 0);
  }

  if (filterValue === "no-public-performance") {
    // Missing is intentionally treated as zero while legacy public documents
    // are backfilled. The field counts public videos only, so this reveals no
    // private or collaborators-only activity.
    return sequences.filter((seq) => (seq.publicPerformanceCount ?? 0) === 0);
  }

  return sequences;
}

function filterByRecentPerformance(sequences: SequenceData[]): SequenceData[] {
  const thirtyDaysAgo = Date.now() - THIRTY_DAYS_MS;
  return sequences.filter((seq) => {
    const performedAt = seq.latestPublicPerformanceAt;
    if (!performedAt) return false;
    const timestamp =
      performedAt instanceof Date
        ? performedAt.getTime()
        : new Date(performedAt).getTime();
    return Number.isFinite(timestamp) && timestamp >= thirtyDaysAgo;
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
function filterByLOOPType(
  sequences: SequenceData[],
  filterValue: BrowseFilterValue
): SequenceData[] {
  if (!filterValue) {
    return sequences;
  }

  const filterStr = String(filterValue);

  // Component-based filtering (new): "component:rotated_halved", "component:mirrored", etc.
  if (filterStr.startsWith("component:")) {
    return filterByLOOPComponent(
      sequences,
      filterStr.slice("component:".length)
    );
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

function getSequenceComponents(seq: SequenceData): readonly LOOPComponent[] {
  if (seq.components?.length) return seq.components;
  if (seq.loopType)
    return Array.from(parseLoopComponents(seq.loopType as LOOPType));
  return [];
}

function getSequencePeriod(seq: SequenceData): number {
  if (seq.period !== undefined) return seq.period;
  if (seq.steps?.length) return detectRotationPeriod(seq.id, seq.steps);
  return 2;
}

function filterByLOOPComponent(
  sequences: SequenceData[],
  componentKey: string
): SequenceData[] {
  if (componentKey === "rotated_halved") {
    return sequences.filter((seq) => {
      const comps = getSequenceComponents(seq);
      return (
        comps.includes(LOOPComponent.ROTATED) && getSequencePeriod(seq) <= 2
      );
    });
  }
  if (componentKey === "rotated_quartered") {
    return sequences.filter((seq) => {
      const comps = getSequenceComponents(seq);
      return (
        comps.includes(LOOPComponent.ROTATED) && getSequencePeriod(seq) === 4
      );
    });
  }

  const componentEnum = componentKey as LOOPComponent;
  return sequences.filter((seq) =>
    getSequenceComponents(seq).includes(componentEnum)
  );
}

// TnD family filtering

/** TnDMode → familyId (the TND_ELEMENTS ids). Mirrors deck-composer's map —
 * kept local so shared/browse doesn't import a feature-layer service. */
const TND_MODE_TO_FAMILY: Readonly<Record<TnDMode, string>> = {
  [TnDMode.SPLIT_SAME]: "split-same",
  [TnDMode.SPLIT_OPP]: "split-opp",
  [TnDMode.TOG_SAME]: "tog-same",
  [TnDMode.TOG_OPP]: "tog-opp",
  [TnDMode.QUARTER_SAME]: "quarter-same",
  [TnDMode.QUARTER_OPP]: "quarter-opp",
};

// Classification is pure geometry over immutable steps — memoize per sequence
// object (engine loads each catalog once; counts recompute far more often).
const tndFamilyCache = new WeakMap<SequenceData, ReadonlySet<string>>();

/**
 * Every TnD family a sequence touches: each non-blank step's arc geometry is
 * classified (deriveTnDFromPictograph); steps with no orbital sense (static /
 * dash legs) contribute nothing. Empty set = sequence has no TnD content.
 */
export function getSequenceTnDFamilies(seq: SequenceData): ReadonlySet<string> {
  let families = tndFamilyCache.get(seq);
  if (!families) {
    const found = new Set<string>();
    for (const step of seq.steps ?? []) {
      if (step.isBlank) continue;
      const { tndMode } = deriveTnDFromPictograph(step);
      if (tndMode) found.add(TND_MODE_TO_FAMILY[tndMode]);
    }
    families = found;
    tndFamilyCache.set(seq, families);
  }
  return families;
}

/** Contains-semantics: a sequence matches when ANY step is in the family.
 * Stacked family filters therefore AND into "touches all of these". */
function filterByTnDFamily(
  sequences: SequenceData[],
  filterValue: BrowseFilterValue
): SequenceData[] {
  if (!filterValue || typeof filterValue !== "string") {
    return sequences;
  }
  return sequences.filter((seq) =>
    getSequenceTnDFamilies(seq).has(filterValue)
  );
}

// Max turn intensity filtering (ceiling)

// Max numeric turn is pure over immutable steps — memoize per sequence object,
// same rationale as the TnD-family cache (counts recompute far more often than
// the pool reloads).
const maxTurnCache = new WeakMap<SequenceData, number>();

/**
 * The largest NUMERIC turn on any motion of any non-blank step (both hands).
 * "fl" (float) has no numeric turn count and is ignored; a sequence with no
 * numeric turns returns 0. This is the value a "≤ N" ceiling filter compares.
 */
export function getSequenceMaxTurn(seq: SequenceData): number {
  const cached = maxTurnCache.get(seq);
  if (cached !== undefined) return cached;

  let max = 0;
  for (const step of seq.steps ?? []) {
    if (step.isBlank) continue;
    for (const motion of [step.motions?.left, step.motions?.right]) {
      const t = motion?.turns;
      if (typeof t === "number" && t > max) max = t;
    }
  }
  maxTurnCache.set(seq, max);
  return max;
}

/** Ceiling filter: keep sequences whose heaviest numeric turn is ≤ the value. */
function filterByMaxTurnIntensity(
  sequences: SequenceData[],
  filterValue: BrowseFilterValue
): SequenceData[] {
  const ceiling =
    typeof filterValue === "number"
      ? filterValue
      : parseFloat(String(filterValue));
  if (isNaN(ceiling)) return sequences;
  return sequences.filter((seq) => getSequenceMaxTurn(seq) <= ceiling);
}

/**
 * Reversal-pattern filter: keep sequences whose reversal pattern id equals the
 * value. A sequence with no stored `reversalPattern` is treated as "continuous"
 * (the app-wide reversal display policy: absent = no reversals). One-per-type.
 */
function filterByReversalPattern(
  sequences: SequenceData[],
  filterValue: BrowseFilterValue
): SequenceData[] {
  const want = String(filterValue);
  return sequences.filter(
    (seq) => (seq.reversalPattern ?? "continuous") === want
  );
}

// Helper Functions

function getUniqueAuthors(sequences: SequenceData[]): string[] {
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
function getLOOPTypeOptions(sequences: SequenceData[]): string[] {
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
export function getLOOPTypeCount(
  sequences: SequenceData[],
  loopType: string
): number {
  if (loopType === "circular" || loopType === "all_circular") {
    return sequences.filter((s) => s.isCircular).length;
  }
  return sequences.filter((s) => s.loopType === loopType).length;
}

/**
 * Normalize position group to handle different formats
 * Handles: "alpha", "Alpha", "ALPHA", "α", etc.
 */
function normalizePlacementGroup(group: string | undefined | null): string {
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
