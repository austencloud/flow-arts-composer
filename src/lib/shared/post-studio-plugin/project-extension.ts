import { z } from "zod";
import type { ShapeExtension } from "@austencloud/video-editor/core";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import { TakeTimingSchema } from "#lib/shared/media-composition/domain/take-timing.js";
import {
  POST_MAX_SEQUENCE_ACTIONS,
  POST_SEQUENCE_ACTIONS,
  PostAnimationItemSchema,
} from "./item-kinds";

const IdSchema = z.string().trim().min(1);

/**
 * The fields tka adds to a post project: the sequence it is about, its prop,
 * each take's map and preview look, and the notation's own actions.
 */
export const tkaProjectShape = {
  sequenceId: IdSchema,
  /** Absent on legacy projects, which still require a real sequence. */
  sourceKind: z.enum(["sequence", "none"]).optional(),
  title: z.string().trim().min(1).max(120).optional(),
  /** Prop used by this post's card and animation when an item has no override. */
  propType: z.nativeEnum(PropType).optional(),
  /** Maps travel with a post, keyed by the take id they were edited against. */
  timings: z.record(z.string(), TakeTimingSchema).optional(),
  /** Scoped appearance for each take's timing preview, independent of timeline layers. */
  mappingPreviewAppearances: z
    .record(
      z.string(),
      PostAnimationItemSchema.shape.animationAppearance.unwrap()
    )
    .optional(),
  /** Mirror, flip, turn or swap the notation alone; the footage keeps its own. */
  sequenceActions: z
    .array(z.enum(POST_SEQUENCE_ACTIONS))
    .max(POST_MAX_SEQUENCE_ACTIONS)
    .optional(),
};

/**
 * The project with tka's fields, in the key order a saved project has always
 * had, so parsing keeps every project byte for byte.
 */
export const TKA_PROJECT_EXTENSION: ShapeExtension = {
  shape: tkaProjectShape,
  order: [
    "schemaVersion",
    "subjectId",
    "sequenceId",
    "sourceKind",
    "title",
    "propType",
    "takes",
    "timings",
    "mappingPreviewAppearances",
    "images",
    "fonts",
    "importSource",
    "tracks",
    "audio",
    "music",
    "canvas",
    "background",
    "mirrored",
    "sequenceActions",
    "updatedAt",
  ],
};

/**
 * tka's fields on an empty project: the sequence it is about, or none for a
 * post that starts from an arrangement or plain footage, and its title.
 */
export function emptyProjectFields(input: {
  sequenceId: string;
  now: number;
  sourceKind?: "sequence" | "none";
  title?: string;
}): {
  sequenceId: string;
  sourceKind?: "sequence" | "none";
  title?: string;
} {
  return {
    sequenceId: input.sequenceId,
    ...(input.sourceKind ? { sourceKind: input.sourceKind } : {}),
    ...(input.title ? { title: input.title.trim() } : {}),
  };
}
