/**
 * Build Result Transformer
 *
 * Converts the sequence engine's BuildResult into the app's SequenceData.
 *
 * The engine operates on minimal string-typed SequenceStep objects for
 * platform portability. The app needs rich PictographData with enum-typed
 * fields, embedded placement data (arrow positions, prop positions), and
 * additional step context (duration, reversals, etc.).
 *
 * This transformer bridges that gap by:
 * 1. Mapping each SequenceStep's string fields back to the app's enum types
 * 2. Creating full MotionData with placement data via createMotionData()
 * 3. Wrapping steps in StepData with step context
 * 4. Extracting StartPlacementData from step 0
 * 5. Delegating metadata and reversal detection to existing services
 */

import type { BuildResult } from "@tka/sequence-engine/generation";
import type {
  SequenceStep,
  MotionData as EngineMotionData,
} from "@tka/sequence-engine/core";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { StartPlacementData } from "$lib/shared/foundation/domain/models/start-placement-data";
import type { GenerationOptions } from "$lib/shared/foundation/domain/models/generation/generate-models";
import type { sequenceMetadataManager as SequenceMetadataManagerSingleton } from "$lib/shared/create/services/sequence-metadata-manager";
type SequenceMetadataManager = typeof SequenceMetadataManagerSingleton;
import type { ReversalDetector } from "$lib/shared/create/services/reversal-detector";
import { PropContinuity } from "$lib/shared/foundation/domain/models/generation/generate-models";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import {
  MotionType,
  RotationDirection,
  Orientation,
  HandSide,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import {
  GridLocation,
  type GridPlacement,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import type { Letter } from "$lib/shared/foundation/domain/models/letter";
import type { MotionData as AppMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import type { LOOPType as AppLOOPType } from "$lib/shared/foundation/domain/models/generation/circular-models";

export class BuildResultTransformer {
  constructor(
    private readonly metadataManager: SequenceMetadataManager,
    private readonly reversalDetector: ReversalDetector
  ) {}

  async convertToSequenceData(
    result: BuildResult,
    options: GenerationOptions
  ): Promise<SequenceData> {
    const isCircular = !!result.loop;

    // The engine's sequence[0] is the start placement, sequence[1..n] are steps
    const startPlacementStep = result.sequence[0];
    if (!startPlacementStep) {
      throw new Error("BuildResult has empty sequence - no start placement");
    }

    const startPlacement = this.mapStartPlacement(startPlacementStep);
    const steps = this.mapSteps(result.sequence.slice(1), options);

    // Calculate word from the mapped steps
    const word = steps
      .filter((s) => s.letter)
      .map((s) => s.letter)
      .join("");

    const level = this.metadataManager.mapDifficultyToLevel(options.difficulty);

    const metadata = this.metadataManager.createGenerationMetadata({
      stepsGenerated: steps.length,
      propContinuity:
        options.propContinuity ?? PropContinuity.CONTINUOUS,
      leftRotationDirection: "",
      rightRotationDirection: "",
      turnIntensity: options.turnIntensity ?? 1,
      level,
    });

    // Determine LOOP type for the sequence data - map engine enum to app enum
    const appLoopType: AppLOOPType | undefined = isCircular
      ? this.mapLoopTypeToApp(options)
      : undefined;

    const tags: string[] = isCircular
      ? ["circular", "cap", ...(appLoopType ? [appLoopType.replace(/_/g, "-")] : [])]
      : ["generated", "freeform"];

    const { createSequenceData } = await import(
      "$lib/shared/foundation/domain/models/sequence-data"
    );

    const sequenceData = createSequenceData({
      name: word || "",
      word,
      steps,
      startingPlacement: startPlacement,
      startPlacement,
      gridMode: options.gridMode,
      difficultyLevel: options.difficulty,
      isFavorite: false,
      isCircular,
      ...(isCircular ? { orientationCycleCount: 1 as const } : {}),
      ...(appLoopType && { loopType: appLoopType }),
      ...(isCircular && options.loopSpecWire ? { loopSpec: options.loopSpecWire } : {}),
      tags,
      metadata,
    });

    return this.reversalDetector.processReversals(sequenceData);
  }

  /**
   * Map engine SequenceSteps (steps only, not start placement) to app StepData[].
   */
  private mapSteps(
    engineSteps: SequenceStep[],
    options: GenerationOptions
  ): StepData[] {
    return engineSteps.map((step, index) => this.mapStep(step, index + 1, options));
  }

  /**
   * Map a single engine SequenceStep to app StepData.
   *
   * StepData extends PictographData, so we need to build the full
   * PictographData shape (id, letter, placements, motions map) plus
   * the step-specific fields (stepNumber, duration, reversals, isBlank).
   */
  private mapStep(
    step: SequenceStep,
    stepNumber: number,
    options: GenerationOptions
  ): StepData {
    const leftMotion = this.mapMotion(step.motions.left, HandSide.LEFT, options);
    const rightMotion = this.mapMotion(step.motions.right, HandSide.RIGHT, options);

    return {
      id: `step-${stepNumber}-${Date.now()}`,
      letter: (step.letter || null) as Letter | null,
      startPlacement: (step.startPlacement || null) as GridPlacement | null,
      endPlacement: (step.endPlacement || null) as GridPlacement | null,
      motions: {
        [HandSide.LEFT]: leftMotion,
        [HandSide.RIGHT]: rightMotion,
      },
      gridMode: options.gridMode,
      stepNumber,
      duration: 1,
      leftReversal: false, // Set by ReversalDetector later
      rightReversal: false,
      isBlank: false,
    };
  }

  /**
   * Map the engine's start placement step to the app's StartPlacementData.
   *
   * The engine treats the start placement as sequence[0] with letter = start
   * placement name, motionType = "static" for both hands. We extract placement
   * and orientation info to build the app's rich type.
   */
  private mapStartPlacement(step: SequenceStep): StartPlacementData {
    const gridPlacement = (step.endPlacement || step.startPlacement || null) as GridPlacement | null;

    // For start placements, motions should be static (props are held in place)
    const leftMotion = createMotionData({
      motionType: this.toMotionType(step.motions.left.motionType),
      rotationDirection: this.toRotationDirection(step.motions.left.rotationDirection),
      startLocation: this.toGridLocation(step.motions.left.startLocation),
      endLocation: this.toGridLocation(step.motions.left.endLocation),
      startOrientation: this.toOrientation(step.motions.left.startOrientation),
      endOrientation: this.toOrientation(step.motions.left.endOrientation),
      turns: step.motions.left.turns ?? 0,
      hand: HandSide.LEFT,
    });

    const rightMotion = createMotionData({
      motionType: this.toMotionType(step.motions.right.motionType),
      rotationDirection: this.toRotationDirection(step.motions.right.rotationDirection),
      startLocation: this.toGridLocation(step.motions.right.startLocation),
      endLocation: this.toGridLocation(step.motions.right.endLocation),
      startOrientation: this.toOrientation(step.motions.right.startOrientation),
      endOrientation: this.toOrientation(step.motions.right.endOrientation),
      turns: step.motions.right.turns ?? 0,
      hand: HandSide.RIGHT,
    });

    return {
      isStartPlacement: true as const,
      id: `start-${Date.now()}`,
      gridPlacement,
      letter: (step.letter || null) as Letter | null,
      startPlacement: gridPlacement,
      endPlacement: gridPlacement,
      motions: {
        [HandSide.LEFT]: leftMotion,
        [HandSide.RIGHT]: rightMotion,
      },
    };
  }

  /**
   * Map an engine MotionData (string fields) to a full app MotionData (enum fields + placement).
   * createMotionData() fills in sensible defaults for placement data.
   */
  private mapMotion(
    engineMotion: EngineMotionData,
    color: HandSide,
    options: GenerationOptions
  ): AppMotionData {
    return createMotionData({
      motionType: this.toMotionType(engineMotion.motionType),
      rotationDirection: this.toRotationDirection(engineMotion.rotationDirection),
      startLocation: this.toGridLocation(engineMotion.startLocation),
      endLocation: this.toGridLocation(engineMotion.endLocation),
      startOrientation: this.toOrientation(engineMotion.startOrientation),
      endOrientation: this.toOrientation(engineMotion.endOrientation),
      turns: engineMotion.turns ?? 0,
      hand: color,
      gridMode: options.gridMode,
      ...(engineMotion.prefloatMotionType && {
        prefloatMotionType: this.toMotionType(engineMotion.prefloatMotionType),
      }),
      ...(engineMotion.prefloatRotationDirection && {
        prefloatRotationDirection: this.toRotationDirection(engineMotion.prefloatRotationDirection),
      }),
    });
  }

  // ─── Enum conversion helpers ────────────────────────────────────────────────
  // The engine uses plain strings for portability. The app uses TypeScript enums.
  // The enum values match the string values (e.g. MotionType.PRO = "pro"),
  // so we cast after looking up. If a string doesn't match, we fall back to
  // a sensible default.

  private toMotionType(value: string): MotionType {
    const map: Record<string, MotionType> = {
      pro: MotionType.PRO,
      anti: MotionType.ANTI,
      float: MotionType.FLOAT,
      dash: MotionType.DASH,
      static: MotionType.STATIC,
    };
    return map[value] ?? MotionType.STATIC;
  }

  private toRotationDirection(value: string): RotationDirection {
    const map: Record<string, RotationDirection> = {
      cw: RotationDirection.CLOCKWISE,
      ccw: RotationDirection.COUNTER_CLOCKWISE,
      noRotation: RotationDirection.NO_ROTATION,
    };
    return map[value] ?? RotationDirection.NO_ROTATION;
  }

  private toGridLocation(value: string): GridLocation {
    const map: Record<string, GridLocation> = {
      n: GridLocation.NORTH,
      e: GridLocation.EAST,
      s: GridLocation.SOUTH,
      w: GridLocation.WEST,
      ne: GridLocation.NORTHEAST,
      se: GridLocation.SOUTHEAST,
      sw: GridLocation.SOUTHWEST,
      nw: GridLocation.NORTHWEST,
      c: GridLocation.CENTER,
    };
    return map[value] ?? GridLocation.NORTH;
  }

  private toOrientation(value: string | undefined): Orientation {
    if (!value) return Orientation.IN;
    const map: Record<string, Orientation> = {
      in: Orientation.IN,
      out: Orientation.OUT,
      clock: Orientation.CLOCK,
      counter: Orientation.COUNTER,
      clockIn: Orientation.CLOCK_IN,
      clockOut: Orientation.CLOCK_OUT,
      counterIn: Orientation.COUNTER_IN,
      counterOut: Orientation.COUNTER_OUT,
      centerN: Orientation.CENTER_N,
      centerNE: Orientation.CENTER_NE,
      centerE: Orientation.CENTER_E,
      centerSE: Orientation.CENTER_SE,
      centerS: Orientation.CENTER_S,
      centerSW: Orientation.CENTER_SW,
      centerW: Orientation.CENTER_W,
      centerNW: Orientation.CENTER_NW,
    };
    return map[value] ?? Orientation.IN;
  }

  /**
   * Map LOOP info from the engine result back to the app's LOOPType enum.
   * The app stores loopType on the SequenceData so the glyph can display
   * the pattern type without re-detecting it.
   */
  private mapLoopTypeToApp(
    options: GenerationOptions
  ): AppLOOPType | undefined {
    // The app's GenerationOptions already carries the LOOPType from the UI
    // as the app's own enum value. Pass it through directly.
    return options.loopType ?? undefined;
  }
}
