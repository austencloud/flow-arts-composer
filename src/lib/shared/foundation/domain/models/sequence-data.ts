import type { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import type { EffortTimeline } from "$lib/shared/effort/domain/effort-timeline-types";
import type { TimeSignatureKey } from "./time-signature";
import type { CreatorIntent } from "./creator-intent";
/**
 * Sequence Domain Model
 *
 * Immutable data structure for complete kinetic sequences.
 * Based on the modern desktop app's SequenceData but adapted for TypeScript.
 *
 * MIGRATION NOTE: Start placement now uses StartPlacementData type instead of StepData.
 * The steps array should only contain actual steps (stepNumber >= 1), never start placement.
 */

import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { StartPlacementData } from "$lib/shared/foundation/domain/models/start-placement-data";
import type { GridPlacementGroup } from "../../../pictograph/grid/domain/enums/grid-enums";
import type { PropType } from "../../../pictograph/prop/domain/enums/prop-type";
import type { LOOPType } from "$lib/shared/foundation/domain/models/generation/circular-models";
import type {
  LOOPComponent,
  LOOPDomain,
} from "$lib/shared/foundation/domain/models/generation/generate-models";
import type { LOOPSpecWire } from "@tka/sequence-engine/loop";
import type { SoloPropData } from "./solo-prop-data";
import type { StepPairingData } from "./step-pairing-data";
import type {
  WallFeasibilityMetadata,
  WallPlaneSourceAssessment,
} from "$lib/shared/3d/domain/models/wall-feasibility";
import { normalizeLegacySequence } from "@tka/tka-types";
import type { CardPresentation } from "$lib/shared/share/domain/models/card-presentation";

export interface SequenceData {
  /** Omitted on legacy prop choreography. Hand paths never imply a prop. */
  readonly sequenceKind?: "prop" | "hand-path";
  readonly id: string;
  readonly name: string;
  /** User's custom display name (optional). When set, shown as primary name in UI. */
  readonly displayName?: string;
  /**
   * The user's intended word before bridge letters were inserted.
   * For spelled sequences: "CAKE" (what user typed)
   * For non-spelled sequences: undefined
   *
   * Display priority: displayName > intendedWord > word
   */
  readonly intendedWord?: string;
  /**
   * The expanded TKA word including any bridge letters.
   * This is the actual sequence of letters performed.
   * Example: "CABΔKE" (CAKE with bridge letters Δ inserted)
   */
  readonly word: string;
  /** Derived at load time from compositional fields (leftSoloProp + rightSoloProp + stepPairings).
   * Never persisted to Firestore - the hydrator re-derives it on every load.
   * Consumers read this for iteration, counting, and display. */
  readonly steps: readonly StepData[];

  // Start placement storage (CONSOLIDATED):
  // Start placements are semantically distinct from steps - they have no duration, no beat number,
  // and represent the initial static prop configuration before the sequence begins.
  readonly startPlacement?: StartPlacementData;
  readonly startingPlacement?: StartPlacementData; // Legacy field name, same type
  readonly startingPlacementGroup?: GridPlacementGroup; // Placement group metadata: "alpha", "beta", "gamma"

  readonly thumbnails: readonly string[];
  readonly sequenceLength?: number;
  readonly author?: string;
  readonly level?: number;
  readonly dateAdded?: Date;
  /** Original creation date of the sequence (never changes after being set) */
  readonly birthday?: Date;
  /** When this library entry was created */
  readonly createdAt?: Date;
  readonly gridMode?: GridMode;
  /** Time signature for this sequence (overrides global default). */
  readonly timeSignature?: TimeSignatureKey;
  // NOTE: propType removed - prop type is a viewer preference, not sequence data
  // Each motion stores its own propType, and rendering uses viewer's settings
  /**
   * @deprecated Use CollectionManager.isFavorite(sequenceId) instead.
   * Favorites are now stored as collection membership, not as a boolean flag.
   * This field is kept for backwards compatibility during migration.
   */
  readonly isFavorite: boolean;
  readonly isCircular: boolean;
  /**
   * LOOP type - Linked Orbital Offset Pattern (TKA's algorithmic extension patterns)
   * Formerly known as LOOP type (Continuous Assembly Pattern).
   */
  readonly loopType?: LOOPType | null;
  /**
   * @deprecated Use `period` instead. Kept during the period-migration window.
   * Number of sequence repetitions needed to return to starting orientation.
   */
  readonly orientationCycleCount?: 1 | 2 | 4 | 8;
  /**
   * Integer count of passes required to return to identity in BOTH location
   * and orientation. 1 = non-LOOP / closed in one pass. 2 = halved.
   * 4 = quartered. 8 = future octaved (L5 grid / L7 wheel).
   *
   * Supersedes the legacy (loopType-name, orientationCycleCount) pair.
   */
  readonly period?: number;
  /**
   * Distinct LOOP transformation primitives detected in the sequence.
   * Set-like; `componentDomains` annotates the space each component acts in.
   * Reserved orientation primitives are filtered before reaching UI consumers.
   */
  readonly components?: readonly LOOPComponent[];
  /**
   * Domain annotation for each detected component.
   * "location" = transformation acts on grid placements.
   * "orientation" = transformation acts on orientation wheel.
   * "both" = detected in both spaces.
   */
  readonly componentDomains?: Partial<Record<LOOPComponent, LOOPDomain>>;
  readonly loopSpec?: LOOPSpecWire;
  readonly difficultyLevel?: string;
  /**
   * Reversal pattern id (from REVERSAL_PATTERNS): "continuous", "book",
   * "red-book", … Set on seeded reversal-variant sequences; absent means
   * continuous. Consumed by the REVERSAL_PATTERN browse filter.
   */
  readonly reversalPattern?: string;
  readonly tags: readonly string[];
  /**
   * Extensible metadata bag for stylistic/performance properties.
   *
   * Known keys:
   * - `pathShape`: "arc" | "linear" | "concave" - creator's intended path shape for shift interpolation.
   *   Absent or "arc" = default arc behavior. "linear" = straight-line shifts. "concave" = inward-curving astroid.
   * - `wallFeasibility`: {@link WallFeasibilityMetadata} - written offline by the wall-plane
   *   feasibility scanner. Absent = unscanned; viewer makes no wall-plane claims.
   * - `wallPlaneSourceAssessment`: {@link WallPlaneSourceAssessment} - an
   *   attributed external caution, kept separate from scanner truth.
   */
  readonly metadata: Record<string, unknown> & {
    wallFeasibility?: WallFeasibilityMetadata;
    wallPlaneSourceAssessment?: WallPlaneSourceAssessment;
  };

  // Equivalence detection fields
  /** Computed hash identifying the motion pattern (rotation-invariant) */
  readonly canonicalSignature?: string;
  /** Beats offset from canonical form (for circular sequences) */
  readonly canonicalOffset?: number;
  /** Canonical location-based hand path signature (e.g. "e→n→w→s→e|s→e→n→w→s").
   * Blue path | red path, normalized via min of circular rotation × color swap.
   * Universal cross-deck key: same physical hand movement shares this value
   * regardless of turn assignment, letter names, or deck-specific ID scheme. */
  readonly canonicalHandPath?: string;
  /** Min-circular-rotation of the letter array, pipe-delimited (e.g. "M|P|M|P").
   * Groups sequences that use the same letters but may differ in start placement. */
  readonly canonicalWord?: string;

  // Owner info (populated for public sequences)
  readonly ownerId?: string;
  readonly ownerDisplayName?: string;
  readonly ownerAvatarUrl?: string;

  /** Number of performance videos whose visibility is public. Server-owned. */
  readonly publicPerformanceCount?: number;
  /** Newest public performance timestamp, used for discovery ordering. */
  readonly latestPublicPerformanceAt?: Date;

  // Video/animation storage
  /** Firebase Storage URL to user's performance video */
  readonly performanceVideoUrl?: string;
  /** Firebase Storage URL to animated WebP/GIF */
  readonly animatedSequenceUrl?: string;
  /** Format of the animated sequence */
  readonly animationFormat?: "webp" | "gif";
  /** Storage path for performance video (for deletion) */
  readonly performanceVideoPath?: string;
  /** Storage path for animated sequence (for deletion) */
  readonly animatedSequencePath?: string;
  /** User-provided tagline or notes for this sequence */
  readonly notes?: string;
  /** Public-facing card content. Deliberately separate from private `notes`. */
  readonly cardPresentation?: CardPresentation;
  /** Effort timeline: phrase-level effort easing curves spanning multiple beats */
  readonly effortTimeline?: EffortTimeline | null;
  /** Prop configuration the creator intended this sequence to be viewed with.
   * Captured silently at save time from the viewer's current prop settings.
   * null = legacy sequence with no intent recorded. */
  readonly intendedProp?: {
    readonly leftPropType: PropType;
    readonly rightPropType: PropType;
    readonly catDogMode: boolean;
  } | null;
  /** Creator's full presentation intent: prop config + effort + future fields.
   * Replaces intendedProp (prop only) and top-level effortTimeline.
   * null = legacy sequence with no intent recorded. */
  readonly creatorIntent?: CreatorIntent | null;

  // === Compositional structure (source of truth) ===
  // These are the canonical representation persisted to Firestore.
  // Optional on the type because construction sites (factories, decoders, mocks)
  // may not have them yet. The SequenceHydrator guarantees they're populated
  // at all load/save boundaries - after hydration they're always present.
  /** Solo prop path for the blue performer - persisted to Firestore */
  readonly leftSoloProp?: SoloPropData;
  /** Solo prop path for the red performer - persisted to Firestore */
  readonly rightSoloProp?: SoloPropData;
  /** Per-beat pairings linking each blue motion to its corresponding red motion */
  readonly stepPairings?: readonly StepPairingData[];

  /** Hash of the blue performer's combined dual-prop path (for equivalence detection) */
  readonly leftPathHash?: string;
  /** Hash of the red performer's combined dual-prop path (for equivalence detection) */
  readonly rightPathHash?: string;
  /** Hash of the blue performer's solo prop path only */
  readonly leftSoloHash?: string;
  /** Hash of the red performer's solo prop path only */
  readonly rightSoloHash?: string;

  // === Local-only cloud sync bookkeeping (Dexie record, never Firestore) ===
  /**
   * Cloud sync state of this Dexie record, set at save time by
   * LibrarySaveService and retried by library-sync-retry.ts. "synced" once
   * the background Firestore write behind the save succeeded (or the
   * content already existed there under another doc), "pending"
   * immediately after the optimistic Dexie write while that sync is in
   * flight, "failed" if it errored. Undefined for sequences that never went
   * through the save flow (e.g. other users' public sequences).
   * Local-only — stripped before every Firestore write in
   * LibraryRepository.saveSequence so it never reaches the cloud doc.
   */
  readonly syncStatus?: "synced" | "pending" | "failed";
  /**
   * Save-time visibility + notes snapshot, kept alongside syncStatus so a
   * retried sync (browser `online` event / app boot) can reconstruct the
   * same Firestore write instead of guessing defaults. Deliberately a
   * literal union rather than importing SequenceVisibility from
   * library-sequence.ts, which would create a foundation -> library layering
   * import. Local-only — same stripping as syncStatus.
   */
  readonly pendingSyncMetadata?: {
    readonly visibility: "private" | "unlisted" | "public";
    readonly notes: string;
    /**
     * Set when a retried sync failed with a typed PERMANENT rejection
     * (INCOMPLETE_WORD, BLANK_STEPS_UNSUPPORTED, PUBLIC_DUPLICATE,
     * CONTENT_MODERATION, …). The retry pass skips records carrying one —
     * a validation refusal must not spin in the background queue; it needs a
     * user action. Cleared by the next explicit user save.
     */
    readonly blockedReason?: string;
  };
}

export function createSequenceData(
  data: Partial<SequenceData> & { beats?: readonly StepData[] } = {}
): SequenceData {
  data = normalizeLegacySequence(data);
  // Backwards compatibility: support old 'beats' property name
  const steps = data.steps ?? data.beats ?? [];
  const result: SequenceData = {
    id: data.id ?? crypto.randomUUID(),
    name: data.name ?? "",
    word: data.word ?? "",
    ...(data.sequenceKind !== undefined && { sequenceKind: data.sequenceKind }),
    steps,
    ...(data.displayName !== undefined && { displayName: data.displayName }),
    ...(data.intendedWord !== undefined && { intendedWord: data.intendedWord }),
    thumbnails: data.thumbnails ?? [],
    isFavorite: data.isFavorite ?? false,
    isCircular: data.isCircular ?? false,
    ...(data.loopType !== undefined && { loopType: data.loopType }),
    ...(data.orientationCycleCount !== undefined && {
      orientationCycleCount: data.orientationCycleCount,
    }),
    ...(data.period !== undefined && { period: data.period }),
    ...(data.components !== undefined && { components: data.components }),
    ...(data.componentDomains !== undefined && {
      componentDomains: data.componentDomains,
    }),
    ...(data.loopSpec !== undefined && { loopSpec: data.loopSpec }),
    tags: data.tags ?? [],
    metadata: data.metadata ?? {},
    ...(data.sequenceLength !== undefined && {
      sequenceLength: data.sequenceLength,
    }),
    ...(data.author !== undefined && { author: data.author }),
    ...(data.reversalPattern !== undefined && {
      reversalPattern: data.reversalPattern,
    }),
    ...(data.level !== undefined && { level: data.level }),
    ...(data.dateAdded !== undefined && { dateAdded: data.dateAdded }),
    ...(data.gridMode !== undefined && { gridMode: data.gridMode }),
    ...(data.timeSignature !== undefined && {
      timeSignature: data.timeSignature,
    }),
    ...(data.startingPlacement !== undefined && {
      startingPlacement: data.startingPlacement,
    }),
    ...(data.startingPlacementGroup !== undefined && {
      startingPlacementGroup: data.startingPlacementGroup,
    }),
    ...(data.startPlacement !== undefined && {
      startPlacement: data.startPlacement,
    }),
    ...(data.difficultyLevel !== undefined && {
      difficultyLevel: data.difficultyLevel,
    }),
    // Equivalence detection
    ...(data.canonicalSignature !== undefined && {
      canonicalSignature: data.canonicalSignature,
    }),
    ...(data.canonicalOffset !== undefined && {
      canonicalOffset: data.canonicalOffset,
    }),
    ...(data.canonicalHandPath !== undefined && {
      canonicalHandPath: data.canonicalHandPath,
    }),
    ...(data.canonicalWord !== undefined && {
      canonicalWord: data.canonicalWord,
    }),
    // Owner info
    ...(data.ownerId !== undefined && { ownerId: data.ownerId }),
    ...(data.ownerDisplayName !== undefined && {
      ownerDisplayName: data.ownerDisplayName,
    }),
    ...(data.ownerAvatarUrl !== undefined && {
      ownerAvatarUrl: data.ownerAvatarUrl,
    }),
    ...(data.publicPerformanceCount !== undefined && {
      publicPerformanceCount: data.publicPerformanceCount,
    }),
    ...(data.latestPublicPerformanceAt !== undefined && {
      latestPublicPerformanceAt: data.latestPublicPerformanceAt,
    }),
    // Video/animation storage
    ...(data.performanceVideoUrl !== undefined && {
      performanceVideoUrl: data.performanceVideoUrl,
    }),
    ...(data.animatedSequenceUrl !== undefined && {
      animatedSequenceUrl: data.animatedSequenceUrl,
    }),
    ...(data.animationFormat !== undefined && {
      animationFormat: data.animationFormat,
    }),
    ...(data.performanceVideoPath !== undefined && {
      performanceVideoPath: data.performanceVideoPath,
    }),
    ...(data.animatedSequencePath !== undefined && {
      animatedSequencePath: data.animatedSequencePath,
    }),
    ...(data.notes !== undefined && { notes: data.notes }),
    ...(data.cardPresentation !== undefined && {
      cardPresentation: data.cardPresentation,
    }),
    ...(data.effortTimeline !== undefined && {
      effortTimeline: data.effortTimeline,
    }),
    ...(data.intendedProp !== undefined && { intendedProp: data.intendedProp }),
    ...(data.creatorIntent !== undefined && {
      creatorIntent: data.creatorIntent,
    }),
    // Compositional structure passthrough
    ...(data.leftSoloProp !== undefined && { leftSoloProp: data.leftSoloProp }),
    ...(data.rightSoloProp !== undefined && {
      rightSoloProp: data.rightSoloProp,
    }),
    ...(data.stepPairings !== undefined && { stepPairings: data.stepPairings }),
    // Content hash passthrough
    ...(data.leftPathHash !== undefined && { leftPathHash: data.leftPathHash }),
    ...(data.rightPathHash !== undefined && {
      rightPathHash: data.rightPathHash,
    }),
    ...(data.leftSoloHash !== undefined && { leftSoloHash: data.leftSoloHash }),
    ...(data.rightSoloHash !== undefined && {
      rightSoloHash: data.rightSoloHash,
    }),
  };
  return result;
}

export function updateSequenceData(
  sequence: SequenceData,
  updates: Partial<SequenceData>
): SequenceData {
  return {
    ...sequence,
    ...updates,
  };
}

export function addStepToSequence(
  sequence: SequenceData,
  beat: StepData
): SequenceData {
  return updateSequenceData(sequence, {
    steps: [...sequence.steps, beat],
  });
}

export function removeStepFromSequence(
  sequence: SequenceData,
  stepIndex: number
): SequenceData {
  if (stepIndex < 0 || stepIndex >= sequence.steps.length) {
    return sequence;
  }

  const newSteps = sequence.steps.filter((_, index) => index !== stepIndex);
  return updateSequenceData(sequence, {
    steps: newSteps,
  });
}

/**
 * Prop dimensions for rendering
 */
export interface PropDimensions {
  width: number;
  height: number;
}

/**
 * Essential metadata about a sequence
 * Subset of SequenceData containing the most commonly needed fields
 */
export interface SequenceMetadata {
  word: string;
  author: string;
  totalSteps: number;
  // Optional animation-related properties (viewer preferences, not stored with sequence)
  leftPropType?: PropType; // Per-color prop type for blue motions
  rightPropType?: PropType; // Per-color prop type for red motions
  gridMode?: GridMode;
  leftPropDimensions?: PropDimensions;
  rightPropDimensions?: PropDimensions;
}
