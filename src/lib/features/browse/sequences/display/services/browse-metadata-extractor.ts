/**
 * Browse Metadata Extractor Service
 *
 * Extracts metadata from sequence files (PNG, WebP, or JSON sidecars)
 * with proper error handling and type safety.
 */

import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { StartPlacementData } from "$lib/shared/foundation/domain/models/start-placement-data";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import type { Letter } from "$lib/shared/foundation/domain/models/letter";
import {
  GridLocation,
  GridPlacement,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  HandSide,
  MotionType,
  Orientation,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import { extractMetadata as extractUniversalMetadata } from "$lib/shared/services/universal-metadata-extractor";
import * as difficultyCalculator from "$lib/shared/browse/services/sequence-difficulty-calculator";

export interface SequenceMetadata {
  steps: StepData[];
  author: string;
  difficultyLevel: string;
  dateAdded: Date;
  gridMode: GridMode;
  isCircular: boolean;
  propType: PropType;
  sequenceLength: number;
  startingPlacement: string; // Just the letter/position name (e.g., "gamma")
  startPlacement?: StartPlacementData; // Full start position data with motions
}
// Constants for metadata extraction
// Using function to avoid module-level enum reference (fixes test initialization)
const getDefaultMetadata = (): SequenceMetadata => ({
  steps: [],
  author: "Unknown",
  difficultyLevel: "beginner",
  dateAdded: new Date(),
  gridMode: GridMode.DIAMOND,
  isCircular: false,
  propType: "Staff" as PropType,
  sequenceLength: 0,
  startingPlacement: "alpha",
});

const DATE_FIELD_NAMES = [
  "date_added",
  "dateAdded",
  "date",
  "created_date",
  "timestamp",
] as const;

export class BrowseMetadataExtractor {
  async extractMetadata(
    sequenceName: string,
    thumbnailPath?: string
  ): Promise<SequenceMetadata> {
    try {
      const sequenceWithVersion = this.determineSequenceVersion(
        sequenceName,
        thumbnailPath
      );

      const result = await extractUniversalMetadata(sequenceWithVersion);

      if (!result.success || !result.data) {
        return getDefaultMetadata();
      }

      return this.parseMetadataResult(sequenceName, result.data);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // Only log non-routine errors
      if (!errorMessage.includes("No valid version found")) {
        console.warn(
          `⚠️ Failed to extract metadata for ${sequenceName}:`,
          error
        );
      }

      throw error;
    }
  }

  /**
   * Determine the sequence version from thumbnail path or default to ver1
   */
  private determineSequenceVersion(
    sequenceName: string,
    thumbnailPath?: string
  ): string {
    if (!thumbnailPath) {
      return `${sequenceName}_ver1`;
    }

    const versionMatch = thumbnailPath.match(/_ver(\d+)\.webp$/);
    if (versionMatch) {
      const version = versionMatch[1];
      return `${sequenceName}_ver${version}`;
    }

    return `${sequenceName}_ver1`;
  }

  /**
   * Parse raw metadata into typed SequenceMetadata
   */
  private parseMetadataResult(
    sequenceName: string,
    rawData: Record<string, unknown>
  ): SequenceMetadata {
    const sequence = rawData["sequence"];
    const steps = this.parseSteps(sequenceName, sequence);
    const startPlacement = this.parseStartPlacement(sequenceName, sequence);
    const gridMode = this.parseGridMode(rawData["grid_mode"]);

    // Calculate difficulty from actual sequence data instead of stored level
    const difficultyLevel = this.calculateDifficultyLevel(steps);

    const dateAdded = this.parseDateAdded(rawData);
    const startingPlacement = this.parseStartingPlacement(steps);

    return {
      steps,
      author: String(rawData["author"] || "Unknown"),
      difficultyLevel,
      dateAdded,
      gridMode,
      isCircular: Boolean(rawData["is_circular"]),
      propType: String(rawData["prop_type"] || "Staff") as PropType,
      sequenceLength: steps.length,
      startingPlacement,
      startPlacement,
    };
  }

  /**
   * Parse step data from sequence array with full motion parsing
   * NOTE: Skips the first element if it's a start position (has sequence_start_position field)
   */
  private parseSteps(sequenceName: string, sequence: unknown): StepData[] {
    if (!Array.isArray(sequence)) {
      return [];
    }

    // Check if first element is start position (has sequence_start_position field)
    const firstElement = sequence[0] as Record<string, unknown>;
    const hasStartPlacement =
      firstElement && "sequence_start_position" in firstElement;

    // Skip first element if it's a start position, otherwise parse all elements
    const beatElements = hasStartPlacement ? sequence.slice(1) : sequence;

    return beatElements.map((step: unknown, index: number) => {
      const stepData = step as Record<string, unknown>;
      const leftAttrs = this.parseHandAttributes(stepData, HandSide.LEFT);
      const rightAttrs = this.parseHandAttributes(stepData, HandSide.RIGHT);

      return {
        // PictographData properties
        id: `step-${sequenceName}-${index + 1}`,
        letter: String(stepData["letter"] || ""),
        startPlacement:
          this.parseGridPlacement(stepData["start_pos"]) ||
          this.parseGridPlacement(stepData["sequence_start_position"]),
        endPlacement: this.parseGridPlacement(stepData["end_pos"]),
        motions: {
          [HandSide.LEFT]: leftAttrs
            ? createMotionData({
                hand: HandSide.LEFT,
                motionType: this.parseMotionType(leftAttrs["motion_type"]),
                startLocation: this.parseLocation(leftAttrs["start_loc"]),
                endLocation: this.parseLocation(leftAttrs["end_loc"]),
                startOrientation: this.parseOrientation(leftAttrs["start_ori"]),
                endOrientation: this.parseOrientation(leftAttrs["end_ori"]),
                rotationDirection: this.parseRotationDirection(
                  leftAttrs["prop_rot_dir"]
                ),
                turns: this.parseTurns(leftAttrs["turns"]),
                isVisible: true,
                propType: PropType.STAFF,
                arrowLocation:
                  this.parseLocation(leftAttrs["start_loc"]) ||
                  GridLocation.NORTH,
                gridMode: GridMode.DIAMOND,
              })
            : undefined,
          [HandSide.RIGHT]: rightAttrs
            ? createMotionData({
                hand: HandSide.RIGHT,
                motionType: this.parseMotionType(rightAttrs["motion_type"]),
                startLocation: this.parseLocation(rightAttrs["start_loc"]),
                endLocation: this.parseLocation(rightAttrs["end_loc"]),
                startOrientation: this.parseOrientation(
                  rightAttrs["start_ori"]
                ),
                endOrientation: this.parseOrientation(rightAttrs["end_ori"]),
                rotationDirection: this.parseRotationDirection(
                  rightAttrs["prop_rot_dir"]
                ),
                turns: this.parseTurns(rightAttrs["turns"]),
                isVisible: true,
                propType: PropType.STAFF,
                arrowLocation:
                  this.parseLocation(rightAttrs["start_loc"]) ||
                  GridLocation.SOUTH,
                gridMode: GridMode.DIAMOND,
              })
            : undefined,
        },
        // Beat context properties
        stepNumber: Number(stepData["beat"] || index + 1),
        duration: 1.0,
        leftReversal: false,
        rightReversal: false,
        isBlank: false,
      } as StepData;
    });
  }

  /**
   * Parse start position data from sequence array
   * Returns StartPlacementData if first element has sequence_start_position field
   */
  private parseStartPlacement(
    sequenceName: string,
    sequence: unknown
  ): StartPlacementData | undefined {
    if (!Array.isArray(sequence) || sequence.length === 0) {
      return undefined;
    }

    const firstElement = sequence[0] as Record<string, unknown>;
    if (!firstElement || !("sequence_start_position" in firstElement)) {
      return undefined;
    }

    const leftAttrs = this.parseHandAttributes(firstElement, HandSide.LEFT);
    const rightAttrs = this.parseHandAttributes(firstElement, HandSide.RIGHT);
    const gridPlacement = this.parseGridPlacement(
      firstElement["sequence_start_position"]
    );

    return {
      id: `start-${sequenceName}`,
      isStartPlacement: true,
      letter: (firstElement["letter"] as Letter | null) ?? null,
      gridPlacement,
      startPlacement: gridPlacement,
      endPlacement: null,
      motions: {
        [HandSide.LEFT]: leftAttrs
          ? createMotionData({
              hand: HandSide.LEFT,
              motionType: this.parseMotionType(leftAttrs["motion_type"]),
              startLocation: this.parseLocation(leftAttrs["start_loc"]),
              endLocation: this.parseLocation(leftAttrs["end_loc"]),
              startOrientation: this.parseOrientation(leftAttrs["start_ori"]),
              endOrientation: this.parseOrientation(leftAttrs["end_ori"]),
              rotationDirection: this.parseRotationDirection(
                leftAttrs["prop_rot_dir"]
              ),
              turns: this.parseTurns(leftAttrs["turns"]),
              isVisible: true,
              propType: PropType.STAFF,
              arrowLocation:
                this.parseLocation(leftAttrs["start_loc"]) ||
                GridLocation.NORTH,
              gridMode: GridMode.DIAMOND,
            })
          : undefined,
        [HandSide.RIGHT]: rightAttrs
          ? createMotionData({
              hand: HandSide.RIGHT,
              motionType: this.parseMotionType(rightAttrs["motion_type"]),
              startLocation: this.parseLocation(rightAttrs["start_loc"]),
              endLocation: this.parseLocation(rightAttrs["end_loc"]),
              startOrientation: this.parseOrientation(rightAttrs["start_ori"]),
              endOrientation: this.parseOrientation(rightAttrs["end_ori"]),
              rotationDirection: this.parseRotationDirection(
                rightAttrs["prop_rot_dir"]
              ),
              turns: this.parseTurns(rightAttrs["turns"]),
              isVisible: true,
              propType: PropType.STAFF,
              arrowLocation:
                this.parseLocation(rightAttrs["start_loc"]) ||
                GridLocation.SOUTH,
              gridMode: GridMode.DIAMOND,
            })
          : undefined,
      },
    };
  }

  /**
   * Browse metadata now writes performer-relative hand keys. Historical
   * sidecars remain readable because published sequences can outlive a schema.
   */
  private parseHandAttributes(
    record: Record<string, unknown>,
    hand: HandSide
  ): Record<string, unknown> | undefined {
    const currentKey = `${hand}_attributes`;
    const legacyKey =
      hand === HandSide.LEFT ? "blue_attributes" : "red_attributes";
    const value = record[currentKey] ?? record[legacyKey];
    return value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : undefined;
  }

  /**
   * Parse grid mode with fallback
   */
  private parseGridMode(gridModeValue: unknown): GridMode {
    if (gridModeValue === "diamond") {
      return GridMode.DIAMOND;
    }
    if (gridModeValue === "box") {
      return GridMode.BOX;
    }
    if (gridModeValue === "skewed") {
      return GridMode.SKEWED;
    }
    return GridMode.DIAMOND;
  }

  /**
   * Calculate difficulty level from actual step data
   * Replaces the old parseDifficultyLevel that just read a stored value
   */
  private calculateDifficultyLevel(steps: StepData[]): string {
    const numericLevel = difficultyCalculator.calculateDifficultyLevel(steps);
    return difficultyCalculator.levelToString(numericLevel);
  }

  /**
   * Parse motion type with fallback
   */
  private parseMotionType(value: unknown): MotionType {
    const str = String(value || "").toLowerCase();
    switch (str) {
      case "pro":
        return MotionType.PRO;
      case "anti":
        return MotionType.ANTI;
      case "float":
        return MotionType.FLOAT;
      case "dash":
        return MotionType.DASH;
      case "static":
        return MotionType.STATIC;
      default:
        return MotionType.STATIC;
    }
  }

  /**
   * Parse grid location with fallback
   */
  private parseLocation(value: unknown): GridLocation {
    const str = String(value || "").toUpperCase();
    // Map common location strings to GridLocation enum values
    const locationMap: Record<string, GridLocation> = {
      N: GridLocation.NORTH,
      NORTH: GridLocation.NORTH,
      E: GridLocation.EAST,
      EAST: GridLocation.EAST,
      S: GridLocation.SOUTH,
      SOUTH: GridLocation.SOUTH,
      W: GridLocation.WEST,
      WEST: GridLocation.WEST,
      NE: GridLocation.NORTHEAST,
      NORTHEAST: GridLocation.NORTHEAST,
      SE: GridLocation.SOUTHEAST,
      SOUTHEAST: GridLocation.SOUTHEAST,
      SW: GridLocation.SOUTHWEST,
      SOUTHWEST: GridLocation.SOUTHWEST,
      NW: GridLocation.NORTHWEST,
      NORTHWEST: GridLocation.NORTHWEST,
    };
    return locationMap[str] ?? GridLocation.NORTH;
  }

  /**
   * Parse grid position from string (e.g., "gamma11" -> GridPlacement.GAMMA11)
   */
  private parseGridPlacement(value: unknown): GridPlacement | null {
    if (!value) return null;

    const str = String(value).toLowerCase();

    // Direct mapping - try to match the exact GridPlacement enum key
    const enumKey = str.toUpperCase();
    const positionValue = GridPlacement[enumKey as keyof typeof GridPlacement];

    if (positionValue) {
      return positionValue;
    }

    // Fallback: Check if the string value matches any enum value directly
    for (const key in GridPlacement) {
      if (GridPlacement[key as keyof typeof GridPlacement] === str) {
        return str as GridPlacement;
      }
    }

    return null;
  }

  /**
   * Parse orientation with fallback
   */
  private parseOrientation(value: unknown): Orientation {
    const str = String(value || "").toLowerCase();
    switch (str) {
      case "in":
        return Orientation.IN;
      case "out":
        return Orientation.OUT;
      case "clock":
      case "clockwise":
        return Orientation.CLOCK;
      case "counter":
      case "counterclockwise":
        return Orientation.COUNTER;
      default:
        return Orientation.IN;
    }
  }

  /**
   * Parse rotation direction with fallback
   */
  private parseRotationDirection(value: unknown): RotationDirection {
    const str = String(value || "").toLowerCase();
    switch (str) {
      case "cw":
      case "clockwise":
        return RotationDirection.CLOCKWISE;
      case "ccw":
      case "counterclockwise":
      case "counter_clockwise":
        return RotationDirection.COUNTER_CLOCKWISE;
      case "no_rotation":
      case "norotation":
        return RotationDirection.NO_ROTATION;
      default:
        return RotationDirection.NO_ROTATION;
    }
  }

  /**
   * Parse turns value (can be number or "fl" for float)
   */
  private parseTurns(value: unknown): number | "fl" {
    if (value === "fl" || value === "float") {
      return "fl";
    }
    const num = Number(value);
    return isNaN(num) ? 0 : num;
  }

  /**
   * Parse date from various possible field names
   */
  private parseDateAdded(rawData: Record<string, unknown>): Date {
    for (const fieldName of DATE_FIELD_NAMES) {
      const fieldValue = rawData[fieldName];
      if (fieldValue) {
        try {
          const date = new Date(String(fieldValue));
          if (!isNaN(date.getTime())) {
            return date;
          }
        } catch {
          // Continue to next field
        }
      }
    }

    return new Date();
  }

  /**
   * Extract starting position from first beat
   */
  private parseStartingPlacement(steps: StepData[]): string {
    if (steps.length > 0) {
      const firstLetter = steps[0]?.letter;
      if (firstLetter) {
        return firstLetter;
      }
    }
    return "alpha";
  }
}
