import { z } from "zod";
import { SequenceRevisionRefSchema } from "$lib/shared/media-composition/domain/sequence-time-map";

const NonEmptyIdSchema = z.string().trim().min(1);
const TimestampSchema = z.number().finite().int().nonnegative();
const PositiveSecondsSchema = z.number().finite().positive();

export const MediaSourceKindSchema = z.enum([
  "video",
  "sequence-animation",
  "choreo-card",
  "tunnel",
  "scene-3d",
  "mandala",
  "beat-carousel",
  "image",
  "audio",
]);

/**
 * Kinds the app renders live from a sequence rather than reading from a file.
 * They all resolve the same way — a sequence ref plus a renderer — so they
 * share one schema shape and one `linked-sequence-derived` role resolution.
 */
export const SEQUENCE_DERIVED_SOURCE_KINDS = [
  "sequence-animation",
  "tunnel",
  "scene-3d",
  "mandala",
  "beat-carousel",
] as const;

export type MediaSourceKind = z.infer<typeof MediaSourceKindSchema>;

const CollaborativeVideoOriginSchema = z
  .object({
    type: z.literal("collaborative-video"),
    videoId: NonEmptyIdSchema,
  })
  .strict();

const StoredVideoOriginSchema = z
  .object({
    type: z.literal("stored-video"),
    url: z.string().url(),
    storagePath: NonEmptyIdSchema.optional(),
  })
  .strict();

const StoredImageOriginSchema = z
  .object({
    type: z.literal("stored-image"),
    url: z.string().url(),
    storagePath: NonEmptyIdSchema.optional(),
  })
  .strict();

const OriginalVideoAudioOriginSchema = z
  .object({
    type: z.literal("original-video-audio"),
    videoSourceId: NonEmptyIdSchema,
  })
  .strict();

const UploadedAudioOriginSchema = z
  .object({
    type: z.literal("uploaded-audio"),
    url: z.string().url(),
    storagePath: NonEmptyIdSchema.optional(),
    rightsConfirmedAt: TimestampSchema,
  })
  .strict();

export const VideoMediaSourceSchema = z
  .object({
    id: NonEmptyIdSchema,
    role: NonEmptyIdSchema.optional(),
    label: z.string().trim().min(1).optional(),
    kind: z.literal("video"),
    origin: z.discriminatedUnion("type", [
      CollaborativeVideoOriginSchema,
      StoredVideoOriginSchema,
    ]),
    durationSeconds: PositiveSecondsSchema,
    mimeType: NonEmptyIdSchema,
    hasAudio: z.boolean(),
    sequenceRef: SequenceRevisionRefSchema.optional(),
    timeMapId: NonEmptyIdSchema.optional(),
  })
  .strict();

export const SequenceAnimationMediaSourceSchema = z
  .object({
    id: NonEmptyIdSchema,
    role: NonEmptyIdSchema.optional(),
    label: z.string().trim().min(1).optional(),
    kind: z.enum(SEQUENCE_DERIVED_SOURCE_KINDS),
    sequenceRef: SequenceRevisionRefSchema,
  })
  .strict();

export const ChoreoCardMediaSourceSchema = z
  .object({
    id: NonEmptyIdSchema,
    role: NonEmptyIdSchema.optional(),
    label: z.string().trim().min(1).optional(),
    kind: z.literal("choreo-card"),
    sequenceRef: SequenceRevisionRefSchema,
    cardSettingsSnapshot: z.record(z.string(), z.unknown()),
  })
  .strict();

export const ImageMediaSourceSchema = z
  .object({
    id: NonEmptyIdSchema,
    role: NonEmptyIdSchema.optional(),
    label: z.string().trim().min(1).optional(),
    kind: z.literal("image"),
    origin: StoredImageOriginSchema,
  })
  .strict();

export const AudioMediaSourceSchema = z
  .object({
    id: NonEmptyIdSchema,
    role: NonEmptyIdSchema.optional(),
    label: z.string().trim().min(1).optional(),
    kind: z.literal("audio"),
    origin: z.discriminatedUnion("type", [
      OriginalVideoAudioOriginSchema,
      UploadedAudioOriginSchema,
    ]),
    durationSeconds: PositiveSecondsSchema,
    mimeType: NonEmptyIdSchema,
    timeMapId: NonEmptyIdSchema.optional(),
  })
  .strict();

export const MediaSourceSchema = z.union([
  VideoMediaSourceSchema,
  SequenceAnimationMediaSourceSchema,
  ChoreoCardMediaSourceSchema,
  ImageMediaSourceSchema,
  AudioMediaSourceSchema,
]);

export type MediaSource = z.infer<typeof MediaSourceSchema>;
