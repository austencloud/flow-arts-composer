import { z } from "zod";
import { firestoreDate } from "#lib/shared/firestore/index.js";

const ReviewMetadataSchema = z
  .object({
    claimedAt: firestoreDate.optional(),
    claimedBy: z.string().optional(),
    grade: z.string().optional(),
    confidence: z.number().optional(),
    notes: z.string().optional(),
    aiNotes: z.string().optional(),
    correctedResponse: z.string().optional(),
    reviewedAt: firestoreDate.optional(),
  })
  .passthrough();

const UIMessageSchema = z
  .object({
    id: z.string(),
    role: z.string(),
  })
  .passthrough();

export const TikaSessionSchema = z
  .object({
    id: z.string(),
    userId: z.string(),
    title: z.string(),
    createdAt: firestoreDate,
    updatedAt: firestoreDate,
    messageCount: z.number(),
    lastUserMessage: z.string(),
    messages: z.array(UIMessageSchema),
    flaggedForReview: z.boolean().optional(),
    flaggedAt: firestoreDate.optional(),
    reviewStatus: z.string().optional(),
    reviewMetadata: ReviewMetadataSchema.optional(),
  })
  .passthrough();

export type TikaSessionParsed = z.infer<typeof TikaSessionSchema>;

export const TikaSessionPreviewSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    createdAt: firestoreDate,
    updatedAt: firestoreDate,
    messageCount: z.number(),
    lastUserMessage: z.string(),
    flaggedForReview: z.boolean().optional(),
    flaggedAt: firestoreDate.optional(),
    reviewStatus: z.string().optional(),
    reviewMetadata: ReviewMetadataSchema.optional(),
  })
  .passthrough();

export type TikaSessionPreviewParsed = z.infer<typeof TikaSessionPreviewSchema>;
