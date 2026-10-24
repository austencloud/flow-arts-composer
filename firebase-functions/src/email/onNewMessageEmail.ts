import * as admin from "firebase-admin";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import {
  createMessageEmail,
  queueUserNotificationEmail,
} from "./notificationEmailQueue";
import { unsubscribeSecret } from "./unsubscribeToken";

const db = admin.firestore();

export const onNewMessageEmail = onDocumentCreated(
  {
    document: "conversations/{conversationId}/messages/{messageId}",
    retry: true,
    timeoutSeconds: 120,
    memory: "256MiB",
    secrets: [unsubscribeSecret],
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const messageData = snapshot.data();
    const senderId =
      typeof messageData.senderId === "string" ? messageData.senderId : "";
    const senderName =
      typeof messageData.senderName === "string"
        ? messageData.senderName
        : "Someone";
    const senderAvatar =
      typeof messageData.senderAvatar === "string"
        ? messageData.senderAvatar
        : undefined;
    const { conversationId, messageId } = event.params;
    const conversation = await db
      .collection("conversations")
      .doc(conversationId)
      .get();

    if (!conversation.exists) {
      console.warn(
        `onNewMessageEmail: Conversation ${conversationId} not found`
      );
      return;
    }

    const participants = conversation.data()?.participants;
    const recipientIds = Array.isArray(participants)
      ? [
          ...new Set(
            participants.filter(
              (userId): userId is string =>
                typeof userId === "string" &&
                userId.length > 0 &&
                userId !== senderId
            )
          ),
        ]
      : [];
    if (recipientIds.length === 0) return;

    const email = createMessageEmail(senderName, conversationId, senderAvatar);
    const results = await Promise.allSettled(
      recipientIds.map((userId) =>
        queueUserNotificationEmail({
          userId,
          preferenceKey: "emailMessages",
          sourceType: "message",
          sourceId: `${conversationId}:${messageId}`,
          email,
        })
      )
    );
    const failures = results
      .filter(
        (result): result is PromiseRejectedResult =>
          result.status === "rejected"
      )
      .map((result) => result.reason);

    if (failures.length > 0) {
      console.error(
        `onNewMessageEmail: ${failures.length}/${recipientIds.length} mail queue write(s) failed`,
        failures
      );
      throw new AggregateError(
        failures,
        "Message email delivery could not be queued"
      );
    }
  }
);
