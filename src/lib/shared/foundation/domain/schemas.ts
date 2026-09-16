/**
 * Zod Schemas for TKA Domain Models
 *
 * Runtime validation schemas for critical data boundaries:
 * - LocalStorage persistence (prevents data corruption)
 * - PNG import validation (prevents malformed import crashes)
 * - External data validation (API safety)
 *
 * ⚠️  USAGE POLICY: Only use for data boundaries with external sources!
 *     Don't use for internal service constructors or component props.
 */

import { z } from "zod";
import {
  normalizeLegacySequence,
  normalizeLegacyStep,
} from "@tka/tka-types";
import {
  GridMode,
  GridPlacementGroup,
} from "../../pictograph/grid/domain/enums/grid-enums";
import { PropType } from "../../pictograph/prop/domain/enums/prop-type";
import type { MotionDataSchema } from "../../pictograph/shared/domain/schemas/pictograph-schemas";
import {
  PictographDataObjectSchema,
  PictographDataSchema,
} from "../../pictograph/shared/domain/schemas/pictograph-schemas";


// Pictograph-specific schemas moved to pictograph/shared/domain/schemas/

// STEP AND SEQUENCE SCHEMAS - The Main Targets

const StepDataObjectSchema = PictographDataObjectSchema.extend({
  // Beat context properties
  stepNumber: z
    .number()
    .int()
    .nonnegative("Beat number must be non-negative (0 or positive)"),
  duration: z.number().positive("Duration must be positive").default(1.0),
  leftReversal: z.boolean().default(false),
  rightReversal: z.boolean().default(false),
  isBlank: z.boolean().default(false),
});

export const StepDataSchema = z.preprocess(
  normalizeLegacyStep,
  StepDataObjectSchema
);

const SequenceDataObjectSchema = z.object({
  id: z
    .string()
    .min(1, "Sequence ID cannot be empty")
    .refine((id) => {
      // Accept either UUID format or custom sequence ID format
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const customIdRegex = /^seq_\d+_[a-z0-9]+$/i; // seq_timestamp_randomstring
      const shortIdRegex = /^[a-zA-Zα-ωΑ-Ω-]+$/; // Short letter-based IDs like "bjea", "bσtw"

      return (
        uuidRegex.test(id) || customIdRegex.test(id) || shortIdRegex.test(id)
      );
    }, "Sequence ID must be a valid UUID, custom sequence ID (seq_*), or letter-based ID"),
  name: z
    .string()
    .min(1, "Sequence name cannot be empty")
    .max(100, "Sequence name too long"),
  word: z.string().default(""),
  steps: z.array(StepDataSchema).default([]),

  // Optional placement data
  startingPlacement: StepDataSchema.optional(),
  startingPlacementGroup: z.nativeEnum(GridPlacementGroup).optional(),
  startPlacement: StepDataSchema.optional(),

  // Metadata and display
  thumbnails: z.array(z.string().url()).default([]),
  sequenceLength: z.number().int().positive().optional(),
  author: z.string().max(50).optional(),
  level: z.number().int().min(1).max(10).optional(),
  dateAdded: z.coerce.date().default(() => new Date()),
  gridMode: z.nativeEnum(GridMode).optional(),
  propType: z.nativeEnum(PropType).optional(),
  isFavorite: z.boolean().default(false),
  isCircular: z.boolean().default(false),
  difficultyLevel: z.string().max(20).optional(),
  tags: z.array(z.string().max(30)).max(10, "Too many tags").default([]),
  metadata: z
    .record(z.string(), z.unknown())
    .optional()
    .default({} as Record<string, unknown>),
});

export const SequenceDataSchema = z.preprocess(
  normalizeLegacySequence,
  SequenceDataObjectSchema
);

// PNG IMPORT SCHEMAS - Second Target

const PngMotionAttributesSchema = z.object({
  motion_type: z.string(), // PNG uses string values like "static", "pro", "anti"
  start_loc: z.string(), // PNG uses string values like "n", "s", "e", "w"
  end_loc: z.string(), // PNG uses string values like "n", "s", "e", "w"
  start_ori: z.string(), // PNG uses string values like "in", "out"
  end_ori: z.string(), // PNG uses string values like "in", "out"
  prop_rot_dir: z.string().optional(), // PNG uses "no_rot", "cw", "ccw"
  turns: z.union([z.number(), z.literal("fl")]).optional(),
});

export const PngStepSchema = z.preprocess(
  (value) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return value;
    }
    const record = value as Record<string, unknown>;
    return {
      ...record,
      left_attributes: record.left_attributes ?? record.blue_attributes,
      right_attributes: record.right_attributes ?? record.red_attributes,
    };
  },
  z.object({
    // beat is optional - will be derived from array index if not present
    beat: z
      .number()
      .int()
      .nonnegative("PNG beat number must be non-negative (0 or positive)")
      .optional(),
    letter: z.string().min(1, "PNG letter cannot be empty"),
    left_attributes: PngMotionAttributesSchema.optional(),
    right_attributes: PngMotionAttributesSchema.optional(),
    // These fields are present in newer metadata format
    start_pos: z.string().optional(),
    end_pos: z.string().optional(),
    timing: z.string().optional(),
    direction: z.string().optional(),
    sequence_start_position: z.string().optional(),
  })
);

export const PngMetadataArraySchema = z.array(PngStepSchema);

// TYPE INFERENCE - Automatic TypeScript types from schemas

export type ValidatedSequenceData = z.infer<typeof SequenceDataSchema>;
export type ValidatedStepData = z.infer<typeof StepDataSchema>;
export type ValidatedPngStep = z.infer<typeof PngStepSchema>;
export type ValidatedMotionData = z.infer<typeof MotionDataSchema>;
export type ValidatedPictographData = z.infer<typeof PictographDataSchema>;


/**
 * Safe parsing that returns detailed error information
 */
export function safeParseWithContext<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  context: string = "data validation"
):
  | { success: true; data: T }
  | { success: false; error: string; details: z.ZodError } {
  const result = schema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  } else {
    const firstError = result.error.issues[0];
    if (!firstError) {
      return {
        success: false,
        error: `${context} failed: Unknown validation error`,
        details: result.error,
      };
    }
    const path = firstError.path.join(".") || "unknown";
    const message = `${context} failed: ${firstError.message} at ${path}`;

    return {
      success: false,
      error: message,
      details: result.error,
    };
  }
}

/**
 * Throws with clear error messages - use for critical validation
 */
export function parseWithContext<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  context: string = "data validation"
): T {
  const result = safeParseWithContext(schema, data, context);
  if (!result.success) {
    const errorMessage = (
      result as { success: false; error: string; details: z.ZodError }
    ).error;
    throw new Error(errorMessage);
  }
  return result.data;
}
