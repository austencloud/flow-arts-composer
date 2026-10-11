import { z } from "zod";
import { InstagramCapabilityRecoveryActionSchema } from "#lib/shared/share/domain/instagram/instagram-capability-schema.js";
import {
  PostDeliveryDraftSchema,
  StorageTimestampSchema,
} from "#lib/shared/share/domain/instagram/instagram-post-draft-schema.js";

export const InstagramPublicationStateSchema = z.enum([
  "draft",
  "rendering",
  "ready",
  "scheduled",
  "publishing",
  "needs_attention",
  "failed",
  "canceled",
  "published",
]);

export type InstagramPublicationState = z.infer<
  typeof InstagramPublicationStateSchema
>;

export const InstagramPublicationErrorSchema = z
  .object({
    reasonCode: z.string().trim().min(1),
    message: z.string().trim().min(1).max(500),
    recoveryAction: InstagramCapabilityRecoveryActionSchema,
    occurredAt: StorageTimestampSchema,
  })
  .strict();

export const InstagramPublicationRecordSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().trim().min(1),
    ownerId: z.string().trim().min(1),
    draftSnapshot: PostDeliveryDraftSchema,
    accountId: z.string().trim().min(1),
    username: z.string().trim().min(1),
    route: z.enum(["instagram-login", "facebook-login"]),
    state: InstagramPublicationStateSchema,
    attemptId: z.string().trim().min(1),
    leaseExpiresAt: StorageTimestampSchema.nullable(),
    containerIds: z.array(z.string().trim().min(1)),
    mediaId: z.string().trim().min(1).nullable(),
    permalink: z.string().url().nullable(),
    scheduledFor: StorageTimestampSchema.nullable(),
    publishedAt: StorageTimestampSchema.nullable(),
    lastError: InstagramPublicationErrorSchema.nullable(),
    lastReconciledAt: StorageTimestampSchema.nullable(),
    createdAt: StorageTimestampSchema,
    updatedAt: StorageTimestampSchema,
  })
  .strict()
  .superRefine((record, context) => {
    if (record.state === "published" && record.mediaId === null) {
      context.addIssue({
        code: "custom",
        path: ["mediaId"],
        message: "Published records need the Instagram media id",
      });
    }
    if (record.state === "scheduled" && record.scheduledFor === null) {
      context.addIssue({
        code: "custom",
        path: ["scheduledFor"],
        message: "Scheduled records need a publish time",
      });
    }
  });

export type InstagramPublicationRecord = z.infer<
  typeof InstagramPublicationRecordSchema
>;

const PUBLICATION_TRANSITIONS: Record<
  InstagramPublicationState,
  ReadonlySet<InstagramPublicationState>
> = {
  draft: new Set(["rendering", "canceled"]),
  rendering: new Set(["ready", "failed", "canceled"]),
  ready: new Set(["publishing", "scheduled", "canceled"]),
  scheduled: new Set(["publishing", "canceled"]),
  publishing: new Set(["published", "needs_attention", "failed"]),
  needs_attention: new Set(["publishing", "published", "failed"]),
  failed: new Set(),
  canceled: new Set(),
  published: new Set(),
};

export function canTransitionInstagramPublication(
  from: InstagramPublicationState,
  to: InstagramPublicationState
): boolean {
  return PUBLICATION_TRANSITIONS[from].has(to);
}
