/**
 * Endless Spinner Orchestrator Implementation
 *
 * Manages continuous sequence playback by chaining sequences together seamlessly.
 * Uses an index of sequences by start state for O(1) lookup.
 * Falls back to rotating circular sequences or generating bridges when no direct match.
 */

import { isVisibleMotion } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { StartPlacementData } from "$lib/shared/foundation/domain/models/start-placement-data";
import type { PublicSequencesLoader } from "$lib/shared/browse/services/public-sequences-loader";
import type { GenerationOrchestrator } from "$lib/shared/create/services/generation-orchestrator";
import type { SequenceTransformer } from "$lib/features/create/shared/services/sequence-transforms/sequence-transformer";
import type { StartPlacementDeriver } from "$lib/shared/pictograph/shared/services/start-placement-deriver";
import { getGridPlacementFromLocations } from "$lib/shared/pictograph/grid/services/grid-placement-deriver";
import type {
  EndState,
  PlacementGroup,
  SpinnerStats,
} from "$lib/shared/landing/domain/types";
import {
  GridMode,
  GridPlacement,
  GridLocation,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import type { Orientation } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import {
  GenerationMode,
  DifficultyLevel,
  PropContinuity,
} from "$lib/shared/foundation/domain/models/generation/generate-models";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import { Letter } from "$lib/shared/foundation/domain/models/letter";
import {} from "$lib/shared/create/services/sequence-transforms";
import { recalculateAllOrientations } from "$lib/shared/create/services/orientation-propagation";
// Cardinal locations (for DIAMOND grid) and intercardinal (for BOX grid)
const CARDINAL_LOCATIONS: ReadonlySet<GridLocation> = new Set<GridLocation>([
  GridLocation.NORTH,
  GridLocation.EAST,
  GridLocation.SOUTH,
  GridLocation.WEST,
]);

const INTERCARDINAL_LOCATIONS: ReadonlySet<GridLocation> =
  new Set<GridLocation>([
    GridLocation.NORTHEAST,
    GridLocation.SOUTHEAST,
    GridLocation.SOUTHWEST,
    GridLocation.NORTHWEST,
  ]);

/**
 * Validate motion data for consistency and flag any issues.
 * Returns an array of warning messages.
 */
function validateMotionData(sequence: SequenceData, label: string): string[] {
  const warnings: string[] = [];
  const seqGridMode = sequence.gridMode ?? GridMode.DIAMOND;

  // Check start placement
  if (sequence.startPlacement?.motions) {
    const left = sequence.startPlacement.motions[HandSide.LEFT];
    const right = sequence.startPlacement.motions[HandSide.RIGHT];

    if (left) {
      if (left.gridMode !== seqGridMode) {
        warnings.push(
          `StartPos blue motion gridMode (${left.gridMode}) != sequence (${seqGridMode})`
        );
      }
      if (
        seqGridMode === GridMode.DIAMOND &&
        left.endLocation &&
        INTERCARDINAL_LOCATIONS.has(left.endLocation)
      ) {
        warnings.push(
          `StartPos blue has intercardinal location ${left.endLocation} in DIAMOND mode`
        );
      }
      if (
        seqGridMode === GridMode.BOX &&
        left.endLocation &&
        CARDINAL_LOCATIONS.has(left.endLocation)
      ) {
        warnings.push(
          `StartPos blue has cardinal location ${left.endLocation} in BOX mode`
        );
      }
    }
    if (right) {
      if (right.gridMode !== seqGridMode) {
        warnings.push(
          `StartPos red motion gridMode (${right.gridMode}) != sequence (${seqGridMode})`
        );
      }
    }
  }

  // Check each beat
  sequence.steps?.forEach((step, idx) => {
    const stepNum = idx + 1;
    const left = step.motions?.[HandSide.LEFT];
    const right = step.motions?.[HandSide.RIGHT];

    if (left) {
      if (left.gridMode !== seqGridMode) {
        warnings.push(
          `Beat ${stepNum} blue gridMode (${left.gridMode}) != sequence (${seqGridMode})`
        );
      }
      if (!left.endOrientation) {
        warnings.push(`Beat ${stepNum} blue missing endOrientation`);
      }
      if (!left.endLocation) {
        warnings.push(`Beat ${stepNum} blue missing endLocation`);
      }
    }
    if (right) {
      if (right.gridMode !== seqGridMode) {
        warnings.push(
          `Beat ${stepNum} red gridMode (${right.gridMode}) != sequence (${seqGridMode})`
        );
      }
    }
  });

  if (warnings.length > 0) {
    console.warn(`[EndlessSpinner] ${label} validation warnings:`, warnings);
  }

  return warnings;
}

/**
 * Get the Greek letter for a placement group.
 * Start placements use lowercase Greek letters: α (alpha), β (beta), γ (gamma)
 */
function getLetterForPlacementGroup(group: PlacementGroup | null): Letter | null {
  switch (group) {
    case "alpha":
      return Letter.ALPHA; // "α"
    case "beta":
      return Letter.BETA; // "β"
    case "gamma":
      return Letter.GAMMA; // "γ"
    default:
      return null;
  }
}

/**
 * A sequence that can be rotated to match a target start state.
 */
interface RotatableMatch {
  sequence: SequenceData;
  /** Beat number to rotate to (this beat becomes the new beat 1) */
  targetStepNumber: number;
}

/**
 * Create a key for indexing sequences by their start state.
 */
function createStartStateKey(
  placement: GridPlacement | string | null,
  leftOrientation: Orientation | null,
  rightOrientation: Orientation | null
): string {
  return `${placement ?? "null"}_${leftOrientation ?? "null"}_${rightOrientation ?? "null"}`;
}

/**
 * Extract placement group from a grid placement string.
 */
function getPlacementGroup(
  placement: GridPlacement | string | null
): PlacementGroup | null {
  if (!placement) return null;
  const placementStr = placement.toString().toLowerCase();
  if (placementStr.startsWith("alpha")) return "alpha";
  if (placementStr.startsWith("beta")) return "beta";
  if (placementStr.startsWith("gamma")) return "gamma";
  return null;
}

/**
 * Extract the placement number from a GridPlacement.
 * e.g., ALPHA3 → 3, GAMMA11 → 11
 */
function getPlacementNumber(
  placement: GridPlacement | string | null
): number | null {
  if (!placement) return null;
  const match = placement.toString().match(/\d+$/);
  return match ? parseInt(match[0], 10) : null;
}

/**
 * Calculate rotation steps needed to transform from one placement to another.
 * Placements within each group are numbered 1-8 (or 1-16 for gamma).
 * Each rotation step is 45°.
 * Returns the number of 45° clockwise steps (can be negative for CCW).
 */
function calculateRotationSteps(
  fromPlacement: GridPlacement | string | null,
  toPlacement: GridPlacement | string | null
): number | null {
  const fromGroup = getPlacementGroup(fromPlacement);
  const toGroup = getPlacementGroup(toPlacement);

  // Can only rotate within the same placement group
  if (!fromGroup || !toGroup || fromGroup !== toGroup) return null;

  const fromNum = getPlacementNumber(fromPlacement);
  const toNum = getPlacementNumber(toPlacement);

  if (fromNum === null || toNum === null) return null;

  // Determine the cycle length based on placement group
  // Alpha/Beta have placements 1-8, Gamma has 1-8 and 9-16 (two separate cycles)
  const cycleLength = 8;
  if (fromGroup === "gamma") {
    // Gamma 1-8 and Gamma 9-16 are separate cycles
    const fromCycle = fromNum <= 8 ? "low" : "high";
    const toCycle = toNum <= 8 ? "low" : "high";
    if (fromCycle !== toCycle) return null; // Can't rotate between gamma cycles
  }

  // Normalize placements to 0-7 range for the cycle
  const normalizedFrom = (fromNum - 1) % cycleLength;
  const normalizedTo = (toNum - 1) % cycleLength;

  // Calculate the difference
  let diff = normalizedTo - normalizedFrom;

  // Normalize to shortest rotation (-3 to +4 for 8-placement cycle)
  if (diff > cycleLength / 2) diff -= cycleLength;
  if (diff < -cycleLength / 2) diff += cycleLength;

  return diff;
}

/**
 * Get a random placement from a placement group for bridge generation.
 */
function getRandomPlacementInGroup(
  group: PlacementGroup,
  gridMode: GridMode
): GridPlacement {
  const placements: Record<PlacementGroup, GridPlacement[]> = {
    alpha:
      gridMode === GridMode.DIAMOND
        ? [
            GridPlacement.ALPHA1,
            GridPlacement.ALPHA3,
            GridPlacement.ALPHA5,
            GridPlacement.ALPHA7,
          ]
        : [
            GridPlacement.ALPHA2,
            GridPlacement.ALPHA4,
            GridPlacement.ALPHA6,
            GridPlacement.ALPHA8,
          ],
    beta:
      gridMode === GridMode.DIAMOND
        ? [
            GridPlacement.BETA1,
            GridPlacement.BETA3,
            GridPlacement.BETA5,
            GridPlacement.BETA7,
          ]
        : [
            GridPlacement.BETA2,
            GridPlacement.BETA4,
            GridPlacement.BETA6,
            GridPlacement.BETA8,
          ],
    gamma:
      gridMode === GridMode.DIAMOND
        ? [
            GridPlacement.GAMMA1,
            GridPlacement.GAMMA5,
            GridPlacement.GAMMA9,
            GridPlacement.GAMMA13,
          ]
        : [
            GridPlacement.GAMMA3,
            GridPlacement.GAMMA7,
            GridPlacement.GAMMA11,
            GridPlacement.GAMMA15,
          ],
  };

  const options = placements[group];
  return options[Math.floor(Math.random() * options.length)]!;
}

/**
 * Pick a random item from an array.
 */
function pickRandom<T>(items: T[]): T | null {
  if (items.length === 0) return null;
  return items[Math.floor(Math.random() * items.length)]!;
}

/**
 * Get the next placement group in the cycle (for bridge variety).
 */
function _getNextPlacementGroup(current: PlacementGroup | null): PlacementGroup {
  const cycle: PlacementGroup[] = ["alpha", "beta", "gamma"];
  if (!current) return pickRandom(cycle)!;
  const currentIndex = cycle.indexOf(current);
  return cycle[(currentIndex + 1) % cycle.length]!;
}

/**
 * Get the gamma cycle (low or high) for a gamma placement.
 * GAMMA1-8 are "low" cycle, GAMMA9-16 are "high" cycle.
 * Returns null for non-gamma placements.
 */
function getGammaCycle(
  placement: GridPlacement | string | null
): "low" | "high" | null {
  if (!placement) return null;
  const group = getPlacementGroup(placement);
  if (group !== "gamma") return null;

  const num = getPlacementNumber(placement);
  if (num === null) return null;

  return num <= 8 ? "low" : "high";
}

export class EndlessSpinnerOrchestrator {
  /** All circular sequences loaded from database */
  private circularSequences: SequenceData[] = [];

  /** Index of sequences by start state for O(1) lookup */
  private sequenceIndex = new Map<string, SequenceData[]>();

  /** Set of unique sequence IDs used in this session */
  private usedSequenceIds = new Set<string>();

  /** Ready state */
  private ready = false;

  /** Session statistics */
  private stats: SpinnerStats = {
    sequencesPlayed: 0,
    uniqueSequencesUsed: 0,
    directMatches: 0,
    rotatedMatches: 0,
    bridgesGenerated: 0,
  };

  constructor(
    private readonly browseLoader: PublicSequencesLoader,
    private readonly generationOrchestrator: GenerationOrchestrator,
    private readonly sequenceTransformer: SequenceTransformer,
    private readonly startPlacementDeriver: StartPlacementDeriver
  ) {}

  async initialize(): Promise<void> {
    if (this.ready) return;

    try {
      // Load all sequence metadata
      const allSequences = await this.browseLoader.loadSequenceMetadata();

      // Filter for circular sequences only (LOOPs loop seamlessly)
      this.circularSequences = allSequences.filter(
        (seq) => seq.isCircular === true
      );

      if (this.circularSequences.length === 0) {
        console.warn(
          "[EndlessSpinner] No circular sequences found, using all sequences"
        );
        this.circularSequences = allSequences;
      }

      // NOTE: We don't pre-build the index anymore - it was too slow
      // Instead, we load sequences on-demand and cache them

      this.ready = true;
    } catch (error) {
      console.error("[EndlessSpinner] Failed to initialize:", error);
      throw error;
    }
  }

  isReady(): boolean {
    return this.ready;
  }

  /**
   * Build an index of sequences by their start state for fast lookup.
   */
  private async buildSequenceIndex(): Promise<void> {
    this.sequenceIndex.clear();

    for (const sequence of this.circularSequences) {
      // Load full sequence data to get the steps
      const fullSequence = await this.browseLoader.loadFullSequenceData(
        sequence.word
      );
      if (!fullSequence?.steps || fullSequence.steps.length === 0) continue;

      // Get or derive start placement
      const startPos =
        this.startPlacementDeriver.getOrDeriveStartPlacement(fullSequence);
      if (!startPos) continue;

      // Extract start state
      const placement = startPos.gridPlacement ?? startPos.startPlacement ?? null;
      const leftOri = startPos.motions?.left?.startOrientation ?? null;
      const rightOri = startPos.motions?.right?.startOrientation ?? null;

      const key = createStartStateKey(placement, leftOri, rightOri);

      // Add to index
      if (!this.sequenceIndex.has(key)) {
        this.sequenceIndex.set(key, []);
      }
      this.sequenceIndex.get(key)!.push(fullSequence);
    }
  }

  async getNextSequence(endState: EndState): Promise<SequenceData | null> {
    if (!this.ready) {
      return null;
    }

    // Strategy 1: Enhanced algorithm - scan ALL sequences for any beat that passes through target placement
    const transformed = await this.findAndTransformAnySequence(endState);
    if (transformed) {
      this.stats.rotatedMatches++;
      return this.recordAndReturn(transformed);
    }

    // Strategy 2: Fallback to old approach - find sequence starting in same placement group
    const targetGroup = getPlacementGroup(endState.placement);
    if (targetGroup) {
      const transformedSequence = await this.findAndTransformSequence(
        endState,
        targetGroup
      );
      if (transformedSequence) {
        this.stats.rotatedMatches++;
        return this.recordAndReturn(transformedSequence);
      }
    }

    // Strategy 3: Last resort - any random sequence (non-seamless but keeps playing)
    const fallback = await this.getRandomSequence();
    if (fallback) {
      this.stats.directMatches++;
      return this.recordAndReturn(fallback);
    }

    return null;
  }

  /**
   * Derive the grid placement from a beat's end state using motion end locations.
   */
  private deriveBeatEndPlacement(beat: StepData): GridPlacement | null {
    const leftMotion = beat.motions?.[HandSide.LEFT];
    const rightMotion = beat.motions?.[HandSide.RIGHT];

    // Invisible placeholder = hand not really there (both-required Step shape).
    if (
      isVisibleMotion(leftMotion) &&
      isVisibleMotion(rightMotion) &&
      leftMotion.endLocation &&
      rightMotion.endLocation
    ) {
      try {
        return getGridPlacementFromLocations(
          leftMotion.endLocation,
          rightMotion.endLocation
        );
      } catch {
        return null;
      }
    }
    return null;
  }

  /**
   * Enhanced algorithm: Find ANY circular sequence that passes through the target placement group
   * at any beat, then apply transforms to make it match exactly.
   */
  private async findAndTransformAnySequence(
    endState: EndState
  ): Promise<SequenceData | null> {
    const targetGroup = getPlacementGroup(endState.placement);
    if (!targetGroup) return null;

    const targetGammaCycle = getGammaCycle(endState.placement);

    // Shuffle sequences for variety
    const shuffled = [...this.circularSequences].sort(
      () => Math.random() - 0.5
    );

    // Limit attempts for performance (scanning all steps is O(n*m))
    const maxSequenceAttempts = Math.min(20, shuffled.length);

    for (let seqIdx = 0; seqIdx < maxSequenceAttempts; seqIdx++) {
      const candidate = shuffled[seqIdx];
      if (!candidate) continue;

      // Prefer unused sequences
      if (
        this.usedSequenceIds.has(candidate.id) &&
        seqIdx < maxSequenceAttempts - 5
      ) {
        continue;
      }

      // Load full sequence data
      const fullSequence = await this.browseLoader.loadFullSequenceData(
        candidate.word
      );
      if (!fullSequence?.steps?.length || !fullSequence.isCircular) continue;

      // Scan each beat for a placement match
      for (
        let stepIndex = 0;
        stepIndex < fullSequence.steps.length;
        stepIndex++
      ) {
        const beat = fullSequence.steps[stepIndex];
        if (!beat) continue;

        const stepEndPlacement = this.deriveBeatEndPlacement(beat);
        const beatGroup = getPlacementGroup(stepEndPlacement);

        // Check if beat is in target placement group
        if (beatGroup !== targetGroup) continue;

        // For gamma, also check cycle compatibility
        if (targetGroup === "gamma") {
          const beatCycle = getGammaCycle(stepEndPlacement);
          if (beatCycle !== targetGammaCycle) continue;
        }

        // Found a beat that passes through target group!
        // Apply three-step transform pipeline
        const result = await this.applyTransformPipeline(
          fullSequence,
          stepIndex,
          stepEndPlacement!,
          endState
        );

        if (result) {
          return result;
        }
      }
    }

    return null;
  }

  /**
   * Apply the three-step transform pipeline:
   * 1. First-beat rotation - make the beat after the matched beat become beat 1
   * 2. Placement rotation - rotate all placements to match exact variant
   * 3. Orientation adjustment - modify start orientations and cascade through sequence
   */
  private async applyTransformPipeline(
    sequence: SequenceData,
    stepIndex: number,
    stepEndPlacement: GridPlacement,
    targetEndState: EndState
  ): Promise<SequenceData | null> {
    try {
      // Step 1: First-beat rotation - make the beat AFTER this one become beat 1
      // (stepIndex is 0-based, shiftStartPlacement expects 1-based beat number)
      // The next beat (stepIndex + 2) becomes the new beat 1
      const targetStepNumber = stepIndex + 2;
      const rotated = this.sequenceTransformer.shiftStartPlacement(
        sequence,
        targetStepNumber
      );

      // Step 2: Placement rotation - match exact variant
      const rotationSteps = calculateRotationSteps(
        stepEndPlacement,
        targetEndState.placement
      );
      let placementMatched = rotated;

      if (rotationSteps !== null && rotationSteps !== 0) {
        placementMatched = await this.sequenceTransformer.rotateSequence(
          rotated,
          rotationSteps,
          "both"
        );
      }

      // Step 3: Orientation adjustment - modify start placement orientations to match target
      let finalSequence = placementMatched;
      const startPos = placementMatched.startPlacement;

      if (
        startPos &&
        targetEndState.leftOrientation &&
        targetEndState.rightOrientation
      ) {
        // Check if orientations already match
        const currentLeftOri =
          startPos.motions?.[HandSide.LEFT]?.startOrientation;
        const currentRightOri =
          startPos.motions?.[HandSide.RIGHT]?.startOrientation;

        if (
          currentLeftOri !== targetEndState.leftOrientation ||
          currentRightOri !== targetEndState.rightOrientation
        ) {
          // Modify start placement to have target orientations
          const startLeftMotion = startPos.motions?.[HandSide.LEFT];
          const startRightMotion = startPos.motions?.[HandSide.RIGHT];
          const adjustedStartPos: StartPlacementData = {
            ...startPos,
            motions: {
              [HandSide.LEFT]: startLeftMotion
                ? {
                    ...startLeftMotion,
                    startOrientation: targetEndState.leftOrientation,
                    endOrientation: targetEndState.leftOrientation,
                  }
                : undefined,
              [HandSide.RIGHT]: startRightMotion
                ? {
                    ...startRightMotion,
                    startOrientation: targetEndState.rightOrientation,
                    endOrientation: targetEndState.rightOrientation,
                  }
                : undefined,
            },
          };

          finalSequence = {
            ...placementMatched,
            startPlacement: adjustedStartPos,
          };
        }
      }

      // Step 4: Always recalculate orientations through all steps
      // This ensures orientation chain integrity after rotation transforms
      const orientationCorrected = recalculateAllOrientations(finalSequence);

      // Step 5: Determine the sequence's grid mode from actual motion locations.
      // We derive from the first step's motions rather than trusting sequence.gridMode,
      // which may be stale (e.g. "box" stored in Firestore for a diamond sequence).
      const sequenceGridMode =
        this.deriveSequenceGridMode(orientationCorrected);
      const gridCorrected = this.forceGridMode(
        orientationCorrected,
        sequenceGridMode
      );

      // Step 6: Update start placement letter to match new placement
      const result = this.updateStartPlacementLetter(
        gridCorrected,
        targetEndState.placement
      );

      // Step 7: Validate the final result (logs warnings if issues found)
      validateMotionData(result, `After transform "${sequence.word}"`);

      return result;
    } catch (error) {
      console.error("[EndlessSpinner] Transform pipeline failed:", error);
      return null;
    }
  }

  /**
   * Derive the grid mode from the sequence's actual motion locations.
   * Examines the first available step's left and right motions to determine
   * whether cardinal (diamond) or intercardinal (box) locations are used.
   * Falls back to GridMode.DIAMOND when motion data is absent.
   *
   * This is the authoritative source of truth - the stored sequence.gridMode
   * field may be stale (e.g., published before gridMode was tracked).
   */
  private deriveSequenceGridMode(sequence: SequenceData): GridMode {
    // Try start placement first, then first step
    const candidates = [sequence.startPlacement, ...(sequence.steps ?? [])];

    for (const candidate of candidates) {
      if (!candidate) continue;
      const left = candidate.motions?.[HandSide.LEFT];
      const right = candidate.motions?.[HandSide.RIGHT];
      if (!isVisibleMotion(left) || !isVisibleMotion(right)) continue;

      // Both motions need start+end locations for reliable detection
      if (
        !left.startLocation ||
        !left.endLocation ||
        !right.startLocation ||
        !right.endLocation
      )
        continue;

      const leftIsDiamond =
        CARDINAL_LOCATIONS.has(left.startLocation) &&
        CARDINAL_LOCATIONS.has(left.endLocation);
      const rightIsDiamond =
        CARDINAL_LOCATIONS.has(right.startLocation) &&
        CARDINAL_LOCATIONS.has(right.endLocation);
      const leftIsBox =
        INTERCARDINAL_LOCATIONS.has(left.startLocation) &&
        INTERCARDINAL_LOCATIONS.has(left.endLocation);
      const rightIsBox =
        INTERCARDINAL_LOCATIONS.has(right.startLocation) &&
        INTERCARDINAL_LOCATIONS.has(right.endLocation);

      if (leftIsDiamond && rightIsDiamond) return GridMode.DIAMOND;
      if (leftIsBox && rightIsBox) return GridMode.BOX;
      // Mixed/skewed - use DIAMOND as safe default
      return GridMode.DIAMOND;
    }

    // No usable motion data - fall back to stored field, then DIAMOND
    return sequence.gridMode ?? GridMode.DIAMOND;
  }

  /**
   * Force a specific grid mode on the sequence and all its steps/motions.
   * This ensures visual consistency when sequences from different grid modes are chained.
   *
   * IMPORTANT: We must update gridMode on motions too, not just steps/sequence.
   * The PropRotAngleManager uses motion gridMode for angle calculations.
   */
  private forceGridMode(
    sequence: SequenceData,
    gridMode: GridMode
  ): SequenceData {
    // Update grid mode on the sequence itself
    const updatedSequence = {
      ...sequence,
      gridMode,
    };

    // Update grid mode on all steps AND their motions
    if (updatedSequence.steps?.length) {
      updatedSequence.steps = updatedSequence.steps.map((step) => {
        const leftMotion = step.motions?.[HandSide.LEFT];
        const rightMotion = step.motions?.[HandSide.RIGHT];
        return {
          ...step,
          gridMode,
          motions: {
            left: { ...leftMotion, gridMode },
            right: { ...rightMotion, gridMode },
          },
        };
      });
    }

    // Update grid mode on start placement and its motions if present
    if (updatedSequence.startPlacement) {
      const sp = updatedSequence.startPlacement;
      const leftMotion = sp.motions?.[HandSide.LEFT];
      const rightMotion = sp.motions?.[HandSide.RIGHT];
      updatedSequence.startPlacement = {
        ...sp,
        gridMode,
        motions: {
          ...sp.motions,
          [HandSide.LEFT]: leftMotion ? { ...leftMotion, gridMode } : undefined,
          [HandSide.RIGHT]: rightMotion
            ? { ...rightMotion, gridMode }
            : undefined,
        },
      };
    }

    return updatedSequence;
  }

  /**
   * Update the start placement's letter to match the target grid placement.
   * This ensures the pictograph glyph displays the correct Greek letter (α, β, γ).
   */
  private updateStartPlacementLetter(
    sequence: SequenceData,
    targetPlacement: GridPlacement | null
  ): SequenceData {
    if (!sequence.startPlacement || !targetPlacement) {
      return sequence;
    }

    const targetGroup = getPlacementGroup(targetPlacement);
    const newLetter = getLetterForPlacementGroup(targetGroup);

    if (!newLetter) {
      return sequence;
    }

    // Update the letter on the start placement
    const updatedStartPlacement: StartPlacementData = {
      ...sequence.startPlacement,
      letter: newLetter,
    };

    return {
      ...sequence,
      startPlacement: updatedStartPlacement,
    };
  }

  /**
   * Find a sequence in the target placement group and transform it to match the exact end state.
   */
  private async findAndTransformSequence(
    endState: EndState,
    targetGroup: PlacementGroup
  ): Promise<SequenceData | null> {
    // Get sequences in the same placement group
    const candidatesInGroup = this.circularSequences.filter((_seq) => {
      // We need to check the sequence's start placement group
      // Since we only have metadata, we'll load a few candidates
      return true; // We'll filter after loading
    });

    // Shuffle to add variety
    const shuffled = [...candidatesInGroup].sort(() => Math.random() - 0.5);

    // Try to find a matching sequence (limit attempts for performance)
    const maxAttempts = Math.min(10, shuffled.length);

    for (let i = 0; i < maxAttempts; i++) {
      const candidate = shuffled[i];
      if (!candidate) continue;

      // Prefer unused sequences
      if (this.usedSequenceIds.has(candidate.id) && i < maxAttempts - 3) {
        continue; // Skip used sequences unless we're running low on options
      }

      // Load full sequence data
      const fullSequence = await this.browseLoader.loadFullSequenceData(
        candidate.word
      );
      if (!fullSequence?.steps?.length) continue;

      // Get the sequence's start placement
      const startPos =
        this.startPlacementDeriver.getOrDeriveStartPlacement(fullSequence);
      if (!startPos) continue;

      // Prefer the canonical start-placement field, with the inherited
      // pictograph placement and first beat as legacy fallbacks.
      const sequenceStartPlacement: string | null =
        startPos.gridPlacement ??
        startPos.startPlacement ??
        fullSequence.steps?.[0]?.startPlacement ??
        null;

      // Check if it's in the same placement group
      const sequenceGroup = getPlacementGroup(sequenceStartPlacement);
      if (sequenceGroup !== targetGroup) continue;

      // Calculate rotation needed to transform this sequence's start to our target
      const rotationSteps = calculateRotationSteps(
        sequenceStartPlacement,
        endState.placement
      );

      if (rotationSteps === null) {
        // Can't rotate (different gamma cycle or other issue), skip
        continue;
      }

      if (rotationSteps === 0) {
        // Already matches exactly - no transformation needed
        return fullSequence;
      }

      // Apply rotation transformation to the entire sequence
      try {
        const transformed = await this.sequenceTransformer.rotateSequence(
          fullSequence,
          rotationSteps,
          "both"
        );
        return transformed;
      } catch {
        // Transformation failed, try next candidate
        continue;
      }
    }

    return null;
  }

  /**
   * Get a random sequence, preferring ones we haven't used yet.
   */
  private async getRandomSequence(): Promise<SequenceData | null> {
    if (this.circularSequences.length === 0) return null;

    // Prefer unused sequences
    const unusedSequences = this.circularSequences.filter(
      (seq) => !this.usedSequenceIds.has(seq.id)
    );

    const candidates =
      unusedSequences.length > 0 ? unusedSequences : this.circularSequences;
    const randomSeq = pickRandom(candidates);

    if (!randomSeq) return null;

    // Load full sequence data
    return this.browseLoader.loadFullSequenceData(randomSeq.word);
  }

  /**
   * Find a sequence that directly starts at the given end state.
   */
  private async findDirectMatch(
    endState: EndState
  ): Promise<SequenceData | null> {
    const key = createStartStateKey(
      endState.placement,
      endState.leftOrientation,
      endState.rightOrientation
    );

    const matches = this.sequenceIndex.get(key);
    if (!matches || matches.length === 0) return null;

    // Prefer sequences we haven't used yet
    const unusedMatches = matches.filter(
      (seq) => !this.usedSequenceIds.has(seq.id)
    );
    if (unusedMatches.length > 0) {
      return pickRandom(unusedMatches);
    }

    // Fall back to any match
    return pickRandom(matches);
  }

  /**
   * Find a circular sequence that passes through the target end state.
   * Returns the sequence and which beat number to rotate to.
   */
  private async findRotatableMatch(
    endState: EndState
  ): Promise<RotatableMatch | null> {
    const matches: RotatableMatch[] = [];

    for (const sequence of this.circularSequences) {
      // Load full sequence data
      const fullSequence = await this.browseLoader.loadFullSequenceData(
        sequence.word
      );
      if (!fullSequence?.steps || !fullSequence.isCircular) continue;

      // Check each beat's end state
      for (let i = 0; i < fullSequence.steps.length; i++) {
        const beat = fullSequence.steps[i];
        if (!beat) continue;

        // Check if this beat's END state matches our target
        const beatEndPos = beat.endPlacement;
        const leftEndOri = beat.motions?.left?.endOrientation ?? null;
        const rightEndOri = beat.motions?.right?.endOrientation ?? null;

        if (
          beatEndPos === endState.placement &&
          leftEndOri === endState.leftOrientation &&
          rightEndOri === endState.rightOrientation
        ) {
          // Beat i+1 should become the new beat 1 (rotating past this beat)
          matches.push({
            sequence: fullSequence,
            targetStepNumber: i + 2, // +2 because stepNumber is 1-indexed and we want the NEXT beat
          });
          break; // Only need one match per sequence
        }
      }
    }

    if (matches.length === 0) return null;

    // Prefer sequences we haven't used yet
    const unusedMatches = matches.filter(
      (m) => !this.usedSequenceIds.has(m.sequence.id)
    );
    if (unusedMatches.length > 0) {
      return pickRandom(unusedMatches);
    }

    return pickRandom(matches);
  }

  async generateBridgeSequence(
    fromEndState: EndState,
    toPlacementGroup: PlacementGroup
  ): Promise<SequenceData | null> {
    try {
      // Get the grid mode from a random existing sequence, or default to diamond
      const sampleSequence = this.circularSequences[0];
      const gridMode = sampleSequence?.gridMode ?? GridMode.DIAMOND;

      // Create start placement data from end state
      const startPlacementData =
        this.createStartPlacementFromEndState(fromEndState);

      // Get a random target placement in the target group
      const targetPlacement = getRandomPlacementInGroup(
        toPlacementGroup,
        gridMode
      );

      // Generate a short freeform sequence from current state to target
      const bridge = await this.generationOrchestrator.generateSequence({
        mode: GenerationMode.FREEFORM,
        length: 3 + Math.floor(Math.random() * 3), // 3-5 steps
        gridMode,
        propType: PropType.STAFF, // Will be overridden by viewer
        difficulty: DifficultyLevel.BEGINNER,
        propContinuity: PropContinuity.CONTINUOUS,
        turnIntensity: 1,
        startPlacement: startPlacementData as PictographData,
        // The generation orchestrator only reads `endPlacement.startPlacement`
        // (coerced to a string grid-placement constraint). Build a structurally
        // honest PictographData carrying just that constraint rather than
        // casting a partial stub through `unknown`.
        endPlacement: {
          id: `spinner-end-${Date.now()}`,
          startPlacement: targetPlacement,
          motions: {},
        } satisfies PictographData,
      });

      return bridge;
    } catch (error) {
      console.error("[EndlessSpinner] Failed to generate bridge:", error);
      return null;
    }
  }

  /**
   * Create a PictographData-like object from an end state for use as start placement.
   */
  private createStartPlacementFromEndState(endState: EndState): unknown {
    return {
      id: `spinner-start-${Date.now()}`,
      startPlacement: endState.placement,
      motions: {
        left: endState.leftOrientation
          ? { startOrientation: endState.leftOrientation }
          : undefined,
        right: endState.rightOrientation
          ? { startOrientation: endState.rightOrientation }
          : undefined,
      },
    };
  }

  async getInitialSequence(): Promise<SequenceData | null> {
    const sequence = await this.getRandomSequence();
    return this.recordAndReturn(sequence);
  }

  /**
   * Record sequence usage and return it.
   */
  private recordAndReturn(sequence: SequenceData | null): SequenceData | null {
    if (!sequence) return null;

    this.stats.sequencesPlayed++;

    if (!this.usedSequenceIds.has(sequence.id)) {
      this.usedSequenceIds.add(sequence.id);
      this.stats.uniqueSequencesUsed++;
    }

    return sequence;
  }

  getStats(): SpinnerStats {
    return { ...this.stats };
  }

  resetStats(): void {
    this.stats = {
      sequencesPlayed: 0,
      uniqueSequencesUsed: 0,
      directMatches: 0,
      rotatedMatches: 0,
      bridgesGenerated: 0,
    };
    this.usedSequenceIds.clear();
  }
}
