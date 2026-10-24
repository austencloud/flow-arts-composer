/**
 * Firebase Cloud Functions for Flow Arts Composer
 *
 * Handles subscription-related background tasks like role sync,
 * custom email delivery via Brevo, and feedback claim management.
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();

export { sendMagicLink } from "./sendMagicLink";
export { transcribeAudio } from "./transcribeAudio";
export { onNewMessage } from "./push/onNewMessage";
export { onNewNotification } from "./push/onNewNotification";
export { onNotificationSync } from "./push/onNotificationSync";
export { onNewMessageEmail } from "./email/onNewMessageEmail";
export { onNewNotificationEmail } from "./email/onNewNotificationEmail";
export { onNewVersionEmail } from "./email/onNewVersionEmail";
export { emailUnsubscribe } from "./email/emailUnsubscribe";
export {
  pulseUserActivity,
  pulseScanActivity,
  pulseSequenceCreated,
  pulseCollectionCreated,
  pulseSoftwareSubmission,
  pulseSiteVisit,
} from "./pulse/pulseTriggers";
export { onFollowCreated, onFollowDeleted } from "./social/onFollowChange";
export {
  syncSequenceCountOnCreate,
  syncSequenceCountOnDelete,
  syncCollectionCountOnCreate,
  syncCollectionCountOnDelete,
  syncLibraryCountsOnProfileCreate,
} from "./profiles/syncLibraryCounts";
export { onAuthUserCreated } from "./profiles/onAuthUserCreated";
export { reconcileMissingProfiles } from "./profiles/reconcileMissingProfiles";
export {
  syncPublicPerformanceMetadataOnVideoWrite,
  syncPublicPerformanceMetadataOnSequencePublish,
} from "./videos/syncPublicPerformanceMetadata";

export {
  cleanupStaleAgentSessions,
  registerAgentSession,
  heartbeatAgentSession,
  claimFeedback,
  validateHeartbeat,
  unclaimFeedback,
  updateFeedbackStatus,
  touchFile,
  checkFileConflicts,
  getActiveFileEdits,
  releaseFileEdit,
  httpClaimFeedback,
  httpValidateHeartbeat,
  httpUnclaimFeedback,
  httpRegisterAgentSession,
  httpTouchFile,
  httpCheckFileConflicts,
  httpUpdateFeedbackStatus,
} from "./feedbackClaims";

export { snapshotShortCodes } from "./snapshotShortCodes";
export { syncShortcodeToKV } from "./syncShortcodeToKV";

export {
  r2PresignUrl,
  r2MultipartStart,
  r2MultipartPartUrl,
  r2MultipartComplete,
  r2MultipartAbort,
  r2MultipartListParts,
  r2DeleteObject,
  r2DeleteByPrefix,
} from "./r2/index";

export { cleanupStaleAnonymousAccounts } from "./cleanupStaleAnonymousAccounts";
export { cleanupStagedUploads } from "./cleanupStagedUploads";
export { finalizeMessageImage } from "./messaging/finalizeMessageImage";
export { deliverMessage } from "./messaging/deliverMessage";
export { deleteMessageImages } from "./messaging/deleteMessageImages";
export {
  shareCollection,
  updateCollectionShare,
  mutateSharedCollection,
  loadSharedCollectionMembers,
  cleanupCollectionShares,
} from "./collections/collectionCollaboration";
export { promoteFeedbackImages } from "./promoteFeedbackImages";
export { backupHealthCheck } from "./backupHealthCheck";
export { createMerchCheckout } from "./merch/createMerchCheckout";
export { createCartCheckout } from "./merch/createCartCheckout";
export { handleMerchWebhook } from "./merch/handleMerchWebhook";
export { createDonationCheckout } from "./donation/createDonationCheckout";
export {
  purgeOneCountSequences,
  adminDeleteSequence,
} from "./adminPurgeOneCount";
export { onAuthUserDeleted } from "./accountDeletions/onAuthUserDeleted";
export { purgeExpiredTombstones } from "./accountDeletions/purgeExpiredTombstones";
export {
  startInstagramAuth,
  instagramAuthCallback,
  completeInstagramAuth,
  unlinkInstagramAuth,
  instagramDeauthorizeCallback,
} from "./auth/instagramAuth";
export { instagramDataDeletionCallback } from "./auth/instagramDataDeletion";
export {
  startMetaConnect,
  metaConnectCallback,
  completeMetaConnect,
  disconnectMetaAccount,
  selectMetaFacebookPage,
  refreshMetaPublishStatus,
} from "./share/metaConnect";
export { publishToMeta } from "./share/publishToMeta";
export { refreshMetaPublishTokens } from "./share/refreshMetaTokens";

const db = admin.firestore();

// Role hierarchy: user < premium < tester < admin
const ROLE_HIERARCHY = ["user", "premium", "tester", "admin"] as const;
type UserRole = (typeof ROLE_HIERARCHY)[number];

/**
 * Triggers when a subscription document is created or updated.
 * Updates the user's role to "premium" if subscription is active,
 * or reverts to "user" if canceled (unless they have a higher role).
 */
export const syncSubscriptionRole = functions.firestore
  .document("customers/{userId}/subscriptions/{subscriptionId}")
  .onWrite(async (change, context) => {
    const { userId } = context.params;
    const subscriptionData = change.after.exists ? change.after.data() : null;

    const userRef = db.collection("users").doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      console.log(`User ${userId} not found, skipping role sync`);
      return null;
    }

    const userData = userDoc.data();
    const currentRole = (userData?.role as UserRole) || "user";

    const isSubscriptionActive =
      subscriptionData?.status === "active" ||
      subscriptionData?.status === "trialing";

    if (isSubscriptionActive) {
      const currentRoleIndex = ROLE_HIERARCHY.indexOf(currentRole);
      const premiumIndex = ROLE_HIERARCHY.indexOf("premium");

      if (currentRoleIndex < premiumIndex) {
        console.log(`Upgrading user ${userId} from ${currentRole} to premium`);
        await userRef.update({
          role: "premium",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        await admin.auth().setCustomUserClaims(userId, {
          ...((await admin.auth().getUser(userId)).customClaims || {}),
          role: "premium",
        });
      }
    } else {
      if (currentRole === "premium") {
        console.log(`Reverting user ${userId} from premium to user`);
        await userRef.update({
          role: "user",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        await admin.auth().setCustomUserClaims(userId, {
          ...((await admin.auth().getUser(userId)).customClaims || {}),
          role: "user",
        });
      }
    }

    return null;
  });

/**
 * Runs daily to remove checkout sessions older than 24 hours that were never completed.
 */
export const cleanupExpiredCheckoutSessions = functions.pubsub
  .schedule("every 24 hours")
  .onRun(async () => {
    const cutoffTime = admin.firestore.Timestamp.fromDate(
      new Date(Date.now() - 24 * 60 * 60 * 1000)
    );

    const customersSnapshot = await db.collection("customers").get();
    let deletedCount = 0;

    for (const customerDoc of customersSnapshot.docs) {
      const sessionsRef = customerDoc.ref.collection("checkout_sessions");
      const expiredSessions = await sessionsRef
        .where("created", "<", cutoffTime)
        .where("url", "==", null)
        .get();

      for (const sessionDoc of expiredSessions.docs) {
        await sessionDoc.ref.delete();
        deletedCount++;
      }
    }

    console.log(`Cleaned up ${deletedCount} expired checkout sessions`);
    return null;
  });
