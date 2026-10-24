/**
 * onNewMessage Cloud Function
 *
 * Firestore trigger that fires when a new message is created in a conversation.
 * Sends push notifications to all participants except the sender.
 *
 * Trigger path: conversations/{conversationId}/messages/{messageId}
 */

import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import { sendPushToUser, getUnreadCount } from "./pushDispatcher";
import type { PushPayload } from "./types";

const db = admin.firestore();

export const onNewMessage = onDocumentCreated(
  "conversations/{conversationId}/messages/{messageId}",
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
      console.warn("onNewMessage: No data in event");
      return;
    }

    const messageData = snapshot.data();
    const { conversationId } = event.params;

    const senderId: string = messageData.senderId;
    const senderName: string = messageData.senderName || "Someone";
    const content: string = messageData.content || "";
    const attachmentType: string | undefined =
      messageData.attachments?.[0]?.type;

    const attachmentPreview =
      attachmentType === "image"
        ? "Sent an image"
        : attachmentType === "sequence"
          ? "Shared a sequence"
          : attachmentType
            ? "Sent an attachment"
            : "New message";
    const bodyPreview = content
      ? content.length > 100
        ? content.substring(0, 97) + "..."
        : content
      : attachmentPreview;

    // Get the conversation to find participants and type
    const conversationRef = db.collection("conversations").doc(conversationId);
    const conversationDoc = await conversationRef.get();

    if (!conversationDoc.exists) {
      console.warn(`onNewMessage: Conversation ${conversationId} not found`);
      return;
    }

    const conversationData = conversationDoc.data()!;
    const participants: string[] = conversationData.participants || [];
    const conversationType: string = conversationData.type || "direct";
    const groupName: string | undefined = conversationData.groupMetadata?.name;

    // Build recipient list (everyone except sender)
    const recipients = participants.filter((uid) => uid !== senderId);

    if (recipients.length === 0) {
      return;
    }

    // Send push to each recipient
    const results = await Promise.allSettled(
      recipients.map(async (recipientId) => {
        // Check if this user has push enabled for messages
        const userDoc = await db
          .collection("users")
          .doc(recipientId)
          .collection("settings")
          .doc("notificationPreferences")
          .get();
        if (userDoc.exists) {
          const prefs = userDoc.data()?.notificationPreferences as
            | Record<string, boolean>
            | undefined;
          if (prefs?.messageReceived === false) {
            return;
          }
        }

        const unreadCount = await getUnreadCount(recipientId);

        // Build title based on conversation type
        const title =
          conversationType === "group" && groupName
            ? `${senderName} in ${groupName}`
            : senderName;

        const payload: PushPayload = {
          title,
          body: bodyPreview,
          url: `/app?conversation=${conversationId}`,
          tag: `message-${conversationId}`,
          type: "message-received",
          conversationId,
        };

        await sendPushToUser(recipientId, payload, unreadCount);
      })
    );

    // Log any failures for debugging
    const failures = results.filter((r) => r.status === "rejected");
    if (failures.length > 0) {
      console.error(
        `onNewMessage: ${failures.length}/${recipients.length} push(es) failed`,
        failures.map((f) => (f as PromiseRejectedResult).reason)
      );
    }
  }
);
