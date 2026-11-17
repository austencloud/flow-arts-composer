/**
 * FeedbackSubmissionService
 *
 * Handles feedback submission, image uploads, and messaging integration.
 */

import {
  collection,
  addDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import {
  getFirestoreInstance,
  getStorageInstance,
} from "#lib/shared/auth/firebase.js";
import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
import { userPreviewState } from "#lib/shared/debug/state/user-preview-state.svelte.js";
import { toast } from "#lib/shared/toast/state/toast-state.svelte.js";

import type {
  FeedbackFormData,
  FeedbackProgressCallback,
  FeedbackStatus,
} from "#lib/shared/feedback/domain/models/feedback-models.js";
import { conversationService } from "#lib/shared/messaging/services/conversation-manager.js";
import { messagingService } from "#lib/shared/messaging/services/messenger.js";
import { getMessageDeliveryRepository } from "#lib/shared/inbox/get-message-delivery-repository.js";
import type { MessageOutboxRecord } from "#lib/shared/inbox/domain/message-delivery-models.js";
import { captureDeviceContext } from "#lib/shared/feedback/utils/device-context-capturer.js";
import {
  buildFeedbackAttachment,
  buildFeedbackMessageText,
  feedbackIdFromMessageId,
  feedbackMessageId,
  isFeedbackMessageId,
} from "#lib/shared/feedback/domain/feedback-thread-message.js";
import {
  trackFeedbackSubmitted,
  trackFeedbackThreadFailed,
  trackFeedbackThreadRecovered,
  type FeedbackThreadStage,
} from "#lib/shared/analytics/feedback-events.js";

// Account that receives the feedback DM thread. This is a Firebase Auth UID, not
// a credential — it ships in the client bundle, and that's fine: all access is
// gated by server-side Firestore security rules, never by hiding this id. Used
// only to (a) route the "new feedback" message and (b) skip self-messaging when
// the admin submits feedback. The same UID is mirrored in config/feedback.config.js
// and several scripts; if the admin account ever changes, update all call sites.
export const ADMIN_USER_ID = "PBp3GSBO6igCKPwJyLZNmVEmamI3";
const COLLECTION_NAME = "feedback";

export function generateTitleFromDescription(description: string): string {
  const trimmed = description.trim();

  // Try to get first sentence (up to . ! or ?)
  const sentenceMatch = trimmed.match(/^[^.!?]+[.!?]?/);
  if (
    sentenceMatch &&
    sentenceMatch[0].length >= 10 &&
    sentenceMatch[0].length <= 80
  ) {
    return sentenceMatch[0].trim();
  }

  // Otherwise take first ~60 chars at word boundary
  if (trimmed.length <= 60) {
    return trimmed;
  }

  const truncated = trimmed.substring(0, 60);
  const lastSpace = truncated.lastIndexOf(" ");
  if (lastSpace > 30) {
    return truncated.substring(0, lastSpace) + "...";
  }
  return truncated + "...";
}

export async function submitFeedback(
  formData: FeedbackFormData,
  capturedModule: string,
  capturedTab: string,
  images?: File[],
  onProgress?: FeedbackProgressCallback,
  stagedImagePaths?: string[]
): Promise<string> {
  const firestore = await getFirestoreInstance();
  const user = authState.user;
  if (!user) {
    throw new Error("User must be authenticated to submit feedback");
  }

  // Use effective user (respects preview mode for proper attribution)
  const effectiveUser = getEffectiveUser(user);

  // Generate title from description if not provided
  const title =
    formData.title?.trim() ||
    generateTitleFromDescription(formData.description);

  // Capture device context
  const deviceContext = captureDeviceContext(capturedModule, capturedTab);

  // Images are pre-uploaded to feedback-staging/ on attach. When all of them
  // finished staging, we hand the staging paths to the doc and the
  // promoteFeedbackImages trigger copies them into the permanent path + writes
  // imageUrls — so submit is just this one doc write (instant).
  const hasStagedImages = !!stagedImagePaths && stagedImagePaths.length > 0;

  const feedbackData = {
    userId: effectiveUser.uid,
    userEmail: effectiveUser.email,
    userDisplayName: effectiveUser.displayName,
    userPhotoURL: effectiveUser.photoURL,
    type: formData.type,
    title,
    description: formData.description,
    // Preserve originals (write-once) for long-term analysis of user language
    originalTitle: title,
    originalDescription: formData.description,
    priority: null,
    capturedModule,
    capturedTab,
    deviceContext,
    source: "app" as const,
    status: "new" as FeedbackStatus,
    createdAt: serverTimestamp(),
    updatedAt: null,
    // Consumed + cleared by the promoteFeedbackImages onCreate trigger.
    ...(hasStagedImages ? { stagedImagePaths } : {}),
  };

  // Report saving phase
  onProgress?.({ phase: "saving", fraction: 0 });

  let docRef;
  try {
    // Create document first to get ID
    docRef = await addDoc(
      collection(firestore, COLLECTION_NAME),
      feedbackData
    );
  } catch (error) {
    console.error("[FeedbackSubmitter] Failed to submit feedback:", error);
    toast.error("Failed to submit feedback. Please try again.");
    throw error;
  }

  // When images were staged, the promoteFeedbackImages trigger handles them from
  // the doc's stagedImagePaths — nothing more to do here (submit stays instant).
  // Fallback path: staging didn't complete (e.g. unavailable), so upload the raw
  // files now and write imageUrls directly.
  if (!hasStagedImages && images && images.length > 0) {
    onProgress?.({ phase: "uploading", fraction: 0 });

    try {
      const imageUrls = await uploadImagesWithProgress(
        images,
        docRef.id,
        effectiveUser.uid,
        onProgress
      );
      await updateDoc(docRef, { imageUrls });
    } catch (error) {
      console.error("[FeedbackSubmitter] Failed to upload images:", error);
      toast.warning("Feedback submitted but some images failed to upload.");
    }
  }

  // Put the feedback in the sender's direct thread with the admin, as a normal
  // message from them. Not awaited: the feedback item is already saved, and a
  // failed send is recorded and retried on the next app start rather than
  // shown to the person.
  const effectiveUserId = effectiveUser.uid;
  if (effectiveUserId !== ADMIN_USER_ID) {
    try {
      void sendFeedbackMessage(
        buildFeedbackOutboxRecord({
          feedbackId: docRef.id,
          userId: effectiveUserId,
          title,
          type: formData.type,
          description: formData.description,
        }),
        "submit"
      );
    } catch (error) {
      // Building the row needs the signed-in account. The feedback is saved
      // either way, so this must not fail the submission.
      console.error("[FeedbackSubmitter] Feedback thread message failed:", error);
      trackFeedbackThreadFailed({
        feedbackId: docRef.id,
        stage: "conversation",
        errorCode: errorCodeOf(error),
        attempt: "submit",
      });
    }
  }

  trackFeedbackSubmitted({
    feedbackId: docRef.id,
    type: formData.type,
    module: capturedModule,
    tab: capturedTab,
    imageCount: stagedImagePaths?.length ?? images?.length ?? 0,
  });

  return docRef.id;
}

function getEffectiveUser(user: {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}) {
  if (userPreviewState.isActive && userPreviewState.data.profile) {
    return {
      uid: userPreviewState.data.profile.uid,
      email: userPreviewState.data.profile.email || "",
      displayName:
        userPreviewState.data.profile.displayName || "Unknown User",
      photoURL: userPreviewState.data.profile.photoURL || null,
    };
  }
  return {
    uid: user.uid,
    email: user.email || "",
    displayName: user.displayName || user.email || "Anonymous",
    photoURL: user.photoURL || null,
  };
}

/**
 * Upload all images concurrently using resumable uploads.
 * Aggregates bytesTransferred across all images into a single 0–1 fraction
 * so the UI can render a smooth progress bar.
 */
async function uploadImagesWithProgress(
  files: File[],
  feedbackId: string,
  userId: string,
  onProgress?: FeedbackProgressCallback
): Promise<string[]> {
  const { ref, uploadBytesResumable, getDownloadURL } =
    await import("firebase/storage");
  const storage = await getStorageInstance();

  // Per-image byte tracking for aggregate progress
  const transferred = new Array<number>(files.length).fill(0);
  const totals = files.map((f) => f.size);
  const grandTotal = totals.reduce((a, b) => a + b, 0);

  function reportAggregate() {
    if (!onProgress || grandTotal === 0) return;
    const sumTransferred = transferred.reduce((a, b) => a + b, 0);
    onProgress({ phase: "uploading", fraction: sumTransferred / grandTotal });
  }

  const uploadPromises = files.map((file, index) => {
    return new Promise<string>((resolve, reject) => {
      const timestamp = Date.now();
      const sanitizedFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
      const storagePath = `feedback/${userId}/${feedbackId}/${timestamp}_${sanitizedFilename}`;
      const storageRef = ref(storage, storagePath);

      const task = uploadBytesResumable(storageRef, file);

      task.on(
        "state_changed",
        (snapshot) => {
          transferred[index] = snapshot.bytesTransferred;
          reportAggregate();
        },
        (error) => {
          console.error(`[FeedbackSubmitter] Failed to upload image: ${file.name}`, error);
          reject(new Error(`Failed to upload image: ${file.name}`));
        },
        async () => {
          try {
            transferred[index] = totals[index]!;
            reportAggregate();
            const url = await getDownloadURL(storageRef);
            resolve(url);
          } catch (error) {
            reject(error);
          }
        }
      );
    });
  });

  return Promise.all(uploadPromises);
}

/**
 * The thread message for one feedback item, shaped as a row of the inbox's
 * durable outbox. Filing it there before sending means a send that fails, or a
 * tab closed mid-send, leaves the message on this device to deliver later. If
 * the person opens their inbox first, the inbox's own outbox delivers it.
 */
function buildFeedbackOutboxRecord(input: {
  feedbackId: string;
  userId: string;
  title: string;
  type: FeedbackFormData["type"];
  description: string;
}): MessageOutboxRecord {
  const now = Date.now();
  return {
    id: feedbackMessageId(input.feedbackId),
    userId: input.userId,
    conversationId: conversationService.directConversationIdWith(ADMIN_USER_ID),
    content: buildFeedbackMessageText(input),
    preparedAttachments: [buildFeedbackAttachment(input)],
    createdAt: now,
    updatedAt: now,
    status: "queued",
    attemptCount: 0,
  };
}

function errorCodeOf(error: unknown): string {
  if (error && typeof error === "object") {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && code) return code;
  }
  return "unknown";
}

/**
 * Open (or create) the direct thread and send the feedback message into it.
 * Never throws. A failure is counted in PostHog and the outbox row is kept for
 * the next app start; a success removes the row.
 */
async function sendFeedbackMessage(
  record: MessageOutboxRecord,
  attempt: "submit" | "retry"
): Promise<boolean> {
  const repository = getMessageDeliveryRepository();
  if (attempt === "submit") {
    try {
      await repository.putOutbox(record);
    } catch (error) {
      // Without the durable row there is no later retry, but the send below
      // can still succeed, and a failure is still counted.
      console.warn("[FeedbackSubmitter] Could not file the thread message:", error);
    }
  }

  let stage: FeedbackThreadStage = "conversation";
  try {
    // Silent: the feedback is already saved, so a thread problem is not the
    // person's to see.
    const { conversation } = await conversationService.getOrCreateConversation(
      ADMIN_USER_ID,
      { silent: true }
    );
    stage = "send";
    await messagingService.sendMessage({
      messageId: record.id,
      conversationId: conversation.id,
      content: record.content,
      attachments: record.preparedAttachments,
    });
  } catch (error) {
    console.error("[FeedbackSubmitter] Feedback thread message failed:", error);
    const errorCode = errorCodeOf(error);
    trackFeedbackThreadFailed({
      feedbackId: feedbackIdFromMessageId(record.id),
      stage,
      errorCode,
      attempt,
    });
    try {
      await repository.putOutbox({
        ...record,
        status: "queued",
        attemptCount: record.attemptCount + 1,
        lastError: errorCode,
        updatedAt: Date.now(),
      });
    } catch {
      // The failure event above is the record that matters.
    }
    return false;
  }

  try {
    await repository.deleteOutbox(record.id);
  } catch {
    // A leftover row resends with the same id, which the callable ignores.
  }
  if (attempt === "retry") {
    trackFeedbackThreadRecovered(feedbackIdFromMessageId(record.id));
  }
  return true;
}

const retriesInFlight = new Map<string, Promise<void>>();

/**
 * Deliver feedback thread messages an earlier session could not send. Runs
 * once per sign-in from the auth listener; reads only this device's outbox, so
 * with nothing pending it touches no network.
 */
export function retryUnsentFeedbackMessages(userId: string): Promise<void> {
  if (userId === ADMIN_USER_ID) return Promise.resolve();
  const running = retriesInFlight.get(userId);
  if (running) return running;

  const run = (async () => {
    const rows = await getMessageDeliveryRepository().listOutbox(userId);
    const unsent = rows.filter(
      (row) => isFeedbackMessageId(row.id) && row.status !== "sent"
    );
    for (const row of unsent) {
      // The thread is opened as whoever is signed in. Stop if that is no
      // longer the account that filed the row.
      if (authState.user?.uid !== userId) return;
      await sendFeedbackMessage(row, "retry");
    }
  })()
    .catch((error) => {
      console.warn("[FeedbackSubmitter] Feedback message retry failed:", error);
    })
    .finally(() => {
      retriesInFlight.delete(userId);
    });

  retriesInFlight.set(userId, run);
  return run;
}
