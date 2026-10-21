import * as admin from "firebase-admin";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import {
  createPlatformUpdateEmail,
  queueUserNotificationEmail,
  readEntryMedia,
} from "./notificationEmailQueue";

const RECIPIENT_BATCH_SIZE = 50;

export const onNewVersionEmail = onDocumentCreated(
  {
    document: "versions/{versionId}",
    retry: true,
    timeoutSeconds: 540,
    memory: "512MiB",
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const data = snapshot.data();
    const version =
      typeof data.version === "string" ? data.version : event.params.versionId;
    if (version === "0.0.0") return;

    const preferenceSnapshot = await admin
      .firestore()
      .collectionGroup("settings")
      .where("notificationPreferences.emailPlatformUpdates", "==", true)
      .get();
    const recipientIds = preferenceSnapshot.docs
      .filter(
        (preferenceDoc) =>
          preferenceDoc.id === "notificationPreferences" &&
          preferenceDoc.data().notificationPreferences?.emailEnabled === true
      )
      .map((preferenceDoc) => preferenceDoc.ref.parent.parent?.id)
      .filter((userId): userId is string => Boolean(userId));

    if (recipientIds.length === 0) return;

    const releaseNotes =
      typeof data.releaseNotes === "string" ? data.releaseNotes : undefined;
    const highlights = Array.isArray(data.highlights)
      ? data.highlights.filter(
          (highlight): highlight is string => typeof highlight === "string"
        )
      : undefined;
    const changelogEntries = Array.isArray(data.changelogEntries)
      ? data.changelogEntries
          .filter(
            (entry): entry is { category: string; text: string } =>
              typeof entry?.category === "string" &&
              typeof entry?.text === "string"
          )
          .map((entry) => {
            const media = readEntryMedia((entry as { media?: unknown }).media);
            return media
              ? { category: entry.category, text: entry.text, media }
              : { category: entry.category, text: entry.text };
          })
      : undefined;
    const hero = data.heroImage;
    const heroImage =
      typeof hero?.url === "string"
        ? {
            url: hero.url,
            alt: typeof hero.alt === "string" ? hero.alt : undefined,
            width: Number.isFinite(hero.width) ? hero.width : undefined,
            height: Number.isFinite(hero.height) ? hero.height : undefined,
          }
        : undefined;
    const email = createPlatformUpdateEmail({
      version,
      releaseNotes,
      highlights,
      changelogEntries,
      heroImage,
    });
    const failures: unknown[] = [];

    for (
      let offset = 0;
      offset < recipientIds.length;
      offset += RECIPIENT_BATCH_SIZE
    ) {
      const batch = recipientIds.slice(offset, offset + RECIPIENT_BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map((userId) =>
          queueUserNotificationEmail({
            userId,
            preferenceKey: "emailPlatformUpdates",
            sourceType: "platform-update",
            sourceId: snapshot.id,
            email,
          })
        )
      );
      failures.push(
        ...results
          .filter(
            (result): result is PromiseRejectedResult =>
              result.status === "rejected"
          )
          .map((result) => result.reason)
      );
    }

    if (failures.length > 0) {
      console.error(
        `onNewVersionEmail: ${failures.length}/${recipientIds.length} mail queue write(s) failed for version ${version}`,
        failures
      );
      throw new AggregateError(
        failures,
        `Version ${version} email delivery could not be queued`
      );
    }
  }
);
