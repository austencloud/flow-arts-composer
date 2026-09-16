/**
 * Sequence Import Service
 *
 * Handles importing sequence data from external sources like PNG metadata.
 * Separate from core sequence CRUD operations and focused on data transformation.
 */

import { extractSequenceMetadata } from "$lib/shared/pictograph/shared/utils/png-metadata-extractor";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import { createStepData } from "$lib/shared/foundation/domain/factories/create-step-data";
import type { Letter } from "$lib/shared/foundation/domain/models/letter";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { createSequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import {
  mapMotionType,
  mapLocation,
  mapOrientation,
  mapRotationDirection,
} from "$lib/shared/foundation/services/implementations/data/enum-mapper";
import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

import { parseStrict } from "$lib/shared/validation/validation-utils";
import { PngMetadataArraySchema } from "$lib/shared/foundation/domain/schemas";
import { createPictographData } from "$lib/shared/pictograph/shared/domain/factories/create-pictograph-data";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";

/**
 * Import sequence from PNG metadata
 */
export async function importFromPNG(id: string): Promise<SequenceData | null> {
  const pngMetadata = await extractSequenceMetadata(id);

  if (pngMetadata.length === 0) {
    console.error(`No metadata found in PNG for sequence: ${id}`);
    return null;
  }

  const sequence = convertPngMetadata(id, pngMetadata);
  return sequence;
}

/**
 * Convert PNG metadata to SequenceData format - Now with bulletproof Zod validation!
 * Replaces 100+ lines of manual type assertions with validated parsing.
 */
export function convertPngMetadata(
  id: string,
  pngMetadata: unknown[]
): SequenceData {
  // Validate PNG structure first - throws if malformed
  const validatedSteps = parseStrict(
    PngMetadataArraySchema,
    pngMetadata.slice(1), // Skip metadata header, validate steps
    `PNG steps for sequence ${id}`
  );

  // Filter out start placement entries (marked with sequence_start_position)
  const actualSteps = validatedSteps.filter(
    (step) => !step.sequence_start_position
  );

  // Convert validated steps to steps (no more type assertions needed!)
  const steps: StepData[] = actualSteps.map((step, index) => {
    // Derive beat number from array index if not present in metadata
    const stepNumber = step.beat ?? index + 1;
    // Extract attributes with proper typing
    const leftAttrs = step.left_attributes;
    const rightAttrs = step.right_attributes;

    // Create the pictograph data first
    const pictographData = createPictographData({
      id: `pictograph-${stepNumber}`,
      motions: {
        left: createMotionData({
          hand: HandSide.LEFT,
          motionType: mapMotionType(leftAttrs?.motion_type ?? ""),
          startLocation: mapLocation(leftAttrs?.start_loc ?? ""),
          endLocation: mapLocation(leftAttrs?.end_loc ?? ""),
          startOrientation: mapOrientation(leftAttrs?.start_ori ?? ""),
          endOrientation: mapOrientation(leftAttrs?.end_ori ?? ""),
          rotationDirection: mapRotationDirection(leftAttrs?.prop_rot_dir ?? ""),
          turns: leftAttrs?.turns ?? 0,
          isVisible: true,
          propType: PropType.STAFF,
          arrowLocation: mapLocation(leftAttrs?.start_loc ?? ""),
        }),
        right: createMotionData({
          hand: HandSide.RIGHT,
          motionType: mapMotionType(rightAttrs?.motion_type ?? ""),
          startLocation: mapLocation(rightAttrs?.start_loc ?? ""),
          endLocation: mapLocation(rightAttrs?.end_loc ?? ""),
          startOrientation: mapOrientation(rightAttrs?.start_ori ?? ""),
          endOrientation: mapOrientation(rightAttrs?.end_ori ?? ""),
          rotationDirection: mapRotationDirection(rightAttrs?.prop_rot_dir ?? ""),
          turns: rightAttrs?.turns ?? 0,
          isVisible: true,
          propType: PropType.STAFF,
          arrowLocation: mapLocation(rightAttrs?.start_loc ?? ""),
        }),
      },
      letter: step.letter as Letter, // Guaranteed valid string
    });

    // Route through the factory: fills any missing hand with an invisible
    // placeholder so the both-required canonical Step shape holds.
    return createStepData({
      ...pictographData,
      id: `${stepNumber}-${step.letter}`,
      stepNumber, // Derived from array index or metadata
      duration: 1,
    });
  });

  // Create sequence data with validated structure - final validation
  // NOTE: Don't uppercase the name - Greek letters like Θ would become Θ
  const sequenceData: Partial<SequenceData> = {
    id: crypto.randomUUID(), // Generate proper UUID for validation
    name: id, // Keep original case to preserve Greek letters (Θ, etc.)
    word: id, // Ensure word is always a string
    steps,
    thumbnails: [], // Empty array as default - schema requires URLs
    sequenceLength: steps.length,
    author: "PNG Import",
    level: 1,
    dateAdded: new Date(),
    gridMode: GridMode.DIAMOND,
    // propType removed - prop type is viewer preference, not sequence data
    isFavorite: false,
    isCircular: false,
    difficultyLevel: "beginner",
    tags: ["imported", "png"],
    metadata: {
      source: "png_metadata",
      extracted_at: new Date().toISOString(),
      original_id: id, // Keep original ID for reference
    },
  };

  // Ensure all required properties are present and properly typed
  const validSequenceData = {
    id: sequenceData.id,
    name: sequenceData.name,
    word: id, // Use id directly to ensure it's always a string
    steps: sequenceData.steps,
    thumbnails: sequenceData.thumbnails,
    isFavorite: sequenceData.isFavorite,
    isCircular: sequenceData.isCircular,
    tags: sequenceData.tags,
    metadata: sequenceData.metadata,
    // propType removed - prop type is viewer preference, not sequence data
    gridMode: sequenceData.gridMode,
    difficultyLevel: sequenceData.difficultyLevel,
    author: sequenceData.author,
    level: sequenceData.level,
    dateAdded: sequenceData.dateAdded,
    sequenceLength: sequenceData.sequenceLength,
  };

  // Use createSequenceData to ensure all required properties are properly set
  const finalSequenceData = createSequenceData({
    id: validSequenceData.id ?? crypto.randomUUID(),
    name: validSequenceData.name ?? id, // Keep original case to preserve Greek letters
    word: id, // Guarantee word is a string
    steps: validSequenceData.steps ?? [],
    thumbnails: validSequenceData.thumbnails ?? [],
    isFavorite: validSequenceData.isFavorite ?? false,
    isCircular: validSequenceData.isCircular ?? false,
    tags: validSequenceData.tags ?? [],
    ...(validSequenceData.metadata
      ? { metadata: validSequenceData.metadata }
      : {}),
    // propType removed - prop type is a viewer preference, not sequence data
    gridMode: validSequenceData.gridMode ?? GridMode.DIAMOND,
    difficultyLevel: validSequenceData.difficultyLevel ?? "beginner",
    author: validSequenceData.author ?? "PNG Import",
    level: validSequenceData.level ?? 1,
    dateAdded: validSequenceData.dateAdded ?? new Date(),
    sequenceLength: validSequenceData.sequenceLength ?? steps.length,
  });

  // The createSequenceData function already ensures proper typing, so return directly
  return finalSequenceData;
}

/**
 * Object bundle of the sequence-importer functions, retained so the
 * SequenceRepository dependency-injection call site keeps an object to call
 * `.importFromPNG(...)` on. The class wrapper was dissolved into the
 * module-level functions above.
 */
export const sequenceImporter = {
  importFromPNG,
  convertPngMetadata,
};

/** Structural type of the sequence-importer bundle, for DI parameter typing. */
export type SequenceImporter = typeof sequenceImporter;
