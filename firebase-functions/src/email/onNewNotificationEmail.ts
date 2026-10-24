import { onDocumentCreated } from "firebase-functions/v2/firestore";
import {
  createFeedbackEmail,
  getEmailPreferenceForNotificationType,
  queueUserNotificationEmail,
} from "./notificationEmailQueue";
import { unsubscribeSecret } from "./unsubscribeToken";

export const onNewNotificationEmail = onDocumentCreated(
  {
    document: "users/{userId}/notifications/{notificationId}",
    retry: true,
    timeoutSeconds: 60,
    memory: "256MiB",
    secrets: [unsubscribeSecret],
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const notification = snapshot.data();
    const type = typeof notification.type === "string" ? notification.type : "";
    const preferenceKey = getEmailPreferenceForNotificationType(type);
    if (!preferenceKey) return;

    const { userId, notificationId } = event.params;
    await queueUserNotificationEmail({
      userId,
      preferenceKey,
      sourceType: "feedback",
      sourceId: notificationId,
      email: createFeedbackEmail({
        type,
        feedbackId:
          typeof notification.feedbackId === "string"
            ? notification.feedbackId
            : notificationId,
        feedbackTitle:
          typeof notification.feedbackTitle === "string"
            ? notification.feedbackTitle
            : undefined,
        message:
          typeof notification.message === "string" ? notification.message : "",
      }),
    });
  }
);
