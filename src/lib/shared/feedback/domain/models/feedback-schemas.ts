/**
 * Zod schemas for Feedback domain models.
 * Used by the shared Firestore CRUD layer for runtime validation.
 */

import { z } from "zod";
import { firestoreDate } from "#lib/shared/firestore/index.js";
import { NOTIFICATION_TYPES } from "#lib/shared/feedback/domain/models/notification-models.js";


const FeedbackTypeSchema = z.enum(["bug", "feature", "general"]);
const FeedbackPrioritySchema = z.enum(["low", "medium", "high", "critical"]);
const FeedbackStatusSchema = z.enum([
  "new",
  "in-progress",
  "in-review",
  "completed",
  "archived",
]);
const FeedbackSourceSchema = z.enum(["app", "terminal", "agent"]);
const ArchiveReasonSchema = z.enum([
  "released",
  "declined",
  "duplicate",
  "wont-fix",
  "deferred",
  "invalid",
]);
const TesterConfirmationStatusSchema = z.enum([
  "pending",
  "confirmed",
  "needs-work",
  "no-response",
]);
const SubtaskStatusSchema = z.enum(["pending", "in-progress", "completed"]);


const DeviceContextSchema = z
  .object({
    userAgent: z.string(),
    platform: z.string(),
    isTouchDevice: z.boolean(),
    viewportWidth: z.number(),
    viewportHeight: z.number(),
    screenWidth: z.number(),
    screenHeight: z.number(),
    devicePixelRatio: z.number(),
    appVersion: z.string(),
    currentModule: z.string().optional(),
    currentTab: z.string().optional(),
    capturedAt: firestoreDate,
  })
  .passthrough();

const AdminResponseSchema = z
  .object({
    message: z.string(),
    respondedAt: firestoreDate,
    respondedBy: z.string(),
  })
  .passthrough();

const TesterConfirmationSchema = z
  .object({
    status: TesterConfirmationStatusSchema,
    comment: z.string().optional(),
    respondedAt: firestoreDate.optional(),
  })
  .passthrough();

const StatusHistoryEntrySchema = z
  .object({
    status: FeedbackStatusSchema,
    timestamp: firestoreDate,
    fromStatus: FeedbackStatusSchema.optional(),
    actorId: z.string().optional(),
    actorName: z.string().optional(),
    notes: z.string().optional(),
  })
  .passthrough();

const FeedbackSubtaskSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    status: SubtaskStatusSchema,
    completedAt: firestoreDate.optional(),
    dependsOn: z.array(z.string()).optional(),
  })
  .passthrough();


export const FeedbackItemSchema = z
  .object({
    id: z.string(),
    createdAt: firestoreDate,
    userId: z.string(),
    userEmail: z.string(),
    userDisplayName: z.string(),
    userPhotoURL: z.string().optional(),

    type: FeedbackTypeSchema,
    title: z.string(),
    description: z.string(),
    priority: z.preprocess(
      (v) => v ?? undefined,
      FeedbackPrioritySchema.optional()
    ),
    imageUrls: z.array(z.string()).optional(),

    originalTitle: z.string().optional(),
    originalDescription: z.string().optional(),

    capturedModule: z.string(),
    capturedTab: z.string(),
    deviceContext: DeviceContextSchema.optional(),

    source: FeedbackSourceSchema.optional(),
    sourceAgent: z.string().optional(),

    assignedTo: z.string().optional(),
    assignedToName: z.string().optional(),

    status: FeedbackStatusSchema,
    adminNotes: z.string().optional(),
    userFacingNotes: z.string().optional(),
    changelogEntry: z.string().optional(),
    updatedAt: firestoreDate.optional(),

    claimedAt: firestoreDate.optional(),
    claimedBy: z.string().optional(),
    claimToken: z.string().optional(),
    claimSession: z.string().optional(),
    lastActivity: firestoreDate.optional(),
    lastActivityType: z.string().optional(),

    subtasks: z.array(FeedbackSubtaskSchema).optional(),

    adminResponse: AdminResponseSchema.optional(),
    testerConfirmation: TesterConfirmationSchema.optional(),

    isDeleted: z.boolean().optional(),
    deletedAt: firestoreDate.optional(),
    deletedBy: z.string().optional(),

    fixedInVersion: z.string().optional(),
    archivedAt: firestoreDate.optional(),
    archiveReason: ArchiveReasonSchema.optional(),

    lastNotifiedAt: firestoreDate.optional(),
    lastNotifiedStatus: FeedbackStatusSchema.optional(),

    deferredUntil: firestoreDate.optional(),
    reactivatedAt: firestoreDate.optional(),
    reactivatedFrom: firestoreDate.optional(),

    statusHistory: z.array(StatusHistoryEntrySchema).optional(),
  })
  .passthrough();


export const ContributorSchema = z
  .object({
    id: z.string(),
    userId: z.string(),
    displayName: z.string(),
    avatarUrl: z.string(),
  })
  .passthrough();

// --- AppVersion schema (for version-service reads) ---

const FeedbackSummarySchema = z
  .object({
    bugs: z.number(),
    features: z.number(),
    general: z.number(),
  })
  .passthrough();

const ChangelogCategorySchema = z.enum(["fixed", "added", "improved"]);

const ChangelogEntrySchema = z
  .object({
    category: ChangelogCategorySchema,
    text: z.string(),
    feedbackId: z.string().optional(),
    contributorIds: z.array(z.string()).optional(),
  })
  .passthrough();

export const AppVersionSchema = z
  .object({
    id: z.string(),
    version: z.string(),
    releasedAt: firestoreDate,
    // Legacy release scripts wrote explicit `null` for absent fields (not
    // `undefined`), and `.optional()` rejects null. Accept null and coerce
    // it back to undefined. This lets those docs parse instead of getting
    // dropped, while keeping the output type `T | undefined` (so consumers that
    // treat these as optional stay sound). Same intent as the zero defaults
    // below (was spamming "[firestore] Validation failed for versions/…" in the
    // Release Notes console on every load, e.g. versions/0.3.0 whose
    // releaseNotes is null).
    releaseNotes: z
      .string()
      .nullish()
      .transform((v) => v ?? undefined),
    // Legacy version docs predate feedback aggregation. Default to zero so they
    // parse instead of getting skipped.
    feedbackCount: z.number().default(0),
    feedbackSummary: FeedbackSummarySchema.default({
      bugs: 0,
      features: 0,
      general: 0,
    }),
    changelogEntries: z
      .array(ChangelogEntrySchema)
      .nullish()
      .transform((v) => v ?? undefined),
    highlights: z
      .array(z.string())
      .nullish()
      .transform((v) => v ?? undefined),
    contributorIds: z
      .array(z.string())
      .nullish()
      .transform((v) => v ?? undefined),
  })
  .passthrough();

// --- Notification schemas (for notification reads) ---

export const UserNotificationSchema = z
  .object({
    id: z.string(),
    userId: z.string(),
    // Validate the discriminant against the known NotificationType union so the
    // narrow union cast in notifier.ts is sound, not a `as unknown` paper-over.
    type: z.enum(NOTIFICATION_TYPES),
    message: z.string(),
    createdAt: firestoreDate,
    read: z.boolean(),
    readAt: firestoreDate.optional(),
    fromUserId: z.string().optional(),
    fromUserName: z.string().optional(),
    // Feedback-specific
    feedbackId: z.string().optional(),
    feedbackTitle: z.string().optional(),
    // Sequence-specific
    sequenceId: z.string().optional(),
    sequenceTitle: z.string().optional(),
    videoUrl: z.string().optional(),
    commentText: z.string().optional(),
    // Social-specific
    achievementId: z.string().optional(),
    achievementName: z.string().optional(),
    // Message-specific
    conversationId: z.string().optional(),
    messagePreview: z.string().optional(),
    // System-specific
    title: z.string().optional(),
    actionUrl: z.string().optional(),
    // Admin parity-audit report
    auditStatus: z.enum(["violations", "failed"]).optional(),
    reportFile: z.string().optional(),
    reportGeneratedAt: z.string().optional(),
    auditReconcileCount: z.number().int().nonnegative().optional(),
    auditShortcodeCount: z.number().int().nonnegative().optional(),
    auditViolations: z
      .array(
        z
          .object({
            source: z.enum(["reconcile", "shortcode"]),
            id: z.string().optional(),
            code: z.string().optional(),
            ownerId: z.string().nullable().optional(),
            classification: z.string(),
            detail: z.string().optional(),
            storedWord: z.string().optional(),
            expectedWord: z.string().optional(),
            changedKeys: z.array(z.string()).optional(),
          })
          .passthrough()
      )
      .optional(),
    auditError: z.string().optional(),
    // Admin-specific
    newUserId: z.string().optional(),
    newUserEmail: z.string().nullable().optional(),
    newUserDisplayName: z.string().optional(),
    returnedUserId: z.string().optional(),
    postHogSessionId: z.string().optional(),
    // Moderation-specific
    reportId: z.string().optional(),
    category: z.string().optional(),
    adminMessage: z.string().optional(),
  })
  .passthrough();

// --- User preferences sub-document schema ---

export const NotificationPreferencesDocSchema = z
  .object({
    id: z.string(),
    notificationPreferences: z
      .object({
        pushEnabled: z.boolean().optional(),
        emailEnabled: z.boolean().optional(),
        emailMessages: z.boolean().optional(),
        emailFeedback: z.boolean().optional(),
        emailPlatformUpdates: z.boolean().optional(),
        feedbackResolved: z.boolean().optional(),
        feedbackInProgress: z.boolean().optional(),
        feedbackNeedsInfo: z.boolean().optional(),
        feedbackResponse: z.boolean().optional(),
        sequenceSaved: z.boolean().optional(),
        sequenceVideoSubmitted: z.boolean().optional(),
        sequenceLiked: z.boolean().optional(),
        sequenceCommented: z.boolean().optional(),
        userFollowed: z.boolean().optional(),
        achievementUnlocked: z.boolean().optional(),
        messageReceived: z.boolean().optional(),
        adminNewUserSignup: z.boolean().optional(),
        adminUserReturned: z.boolean().optional(),
        adminQrScan: z.boolean().optional(),
        adminContentCreated: z.boolean().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();
