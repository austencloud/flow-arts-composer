/**
 * notifyAdmins — shared helper for Pulse activity alerts.
 *
 * Writes a notification doc to every admin's users/{uid}/notifications
 * subcollection via the Admin SDK. The existing onNewNotification trigger
 * then delivers FCM push to their devices.
 *
 * Why server-side: the old client-side admin-notifier ran in the ACTING
 * user's browser, and firestore.rules correctly denies a non-admin writing
 * into another user's notifications subcollection — so every signup
 * notification since launch was silently swallowed. The Admin SDK bypasses
 * rules, which is exactly right here.
 */

import * as admin from "firebase-admin";
import { singleScanMessage, digestMessage } from "./scanDigestMessages";
import {
  singleVisitMessage,
  visitDigestMessage,
  type VisitSummary,
} from "./visitMessages";
import { isAgentUserId } from "./pulseIdentity";

const db = admin.firestore();

/** Admins to notify, keyed by uid, deduped across role/isAdmin queries. */
async function loadAdmins(): Promise<
  Map<string, FirebaseFirestore.DocumentData>
> {
  const [roleSnap, flagSnap] = await Promise.all([
    db.collection("users").where("role", "==", "admin").get(),
    db.collection("users").where("isAdmin", "==", true).get(),
  ]);
  const admins = new Map<string, FirebaseFirestore.DocumentData>();
  for (const doc of [...roleSnap.docs, ...flagSnap.docs]) {
    admins.set(doc.id, doc.data());
  }
  return admins;
}

/** Pulse notification type → preference key on users/{uid}.notificationPreferences */
const PULSE_PREF_KEYS: Record<string, string> = {
  "admin-new-user-signup": "adminNewUserSignup",
  "admin-user-returned": "adminUserReturned",
  "admin-qr-scan": "adminQrScan",
  "admin-content-created": "adminContentCreated",
  "admin-software-submission": "adminSoftwareSubmission",
  "admin-site-visit": "adminSiteVisit",
};

export interface AdminNotificationInput {
  type: string;
  message: string;
  /** The user who caused the event — admins never get pinged by themselves. */
  fromUserId?: string | null;
  fromUserName?: string | null;
  /** Extra fields merged into the notification doc (sequenceId, shortCode, …). */
  data?: Record<string, unknown>;
}

/** True when a user doc carries admin privileges. */
export function isAdminData(
  d: FirebaseFirestore.DocumentData | undefined | null
): boolean {
  return !!d && (d.isAdmin === true || d.role === "admin");
}

/**
 * Fan a Pulse notification out to all admins.
 *
 * Mute semantics: a muted type skips the DOC write, not just the push —
 * otherwise muted high-volume types (scans, returns) would still pile
 * unread docs into the admin's inbox and inflate the badge count.
 *
 * Returns the number of notification docs written.
 */
export async function notifyAdmins(
  input: AdminNotificationInput
): Promise<number> {
  // Browser verification should exercise the real app without presenting the
  // shared Codex + Claude profile as real user activity to Austen.
  if (isAgentUserId(input.fromUserId)) return 0;

  const admins = await loadAdmins();

  const prefKey = PULSE_PREF_KEYS[input.type];
  let written = 0;

  await Promise.all(
    [...admins.entries()].map(async ([adminId]) => {
      // No self-noise: the admin's own actions never ping them.
      if (input.fromUserId && adminId === input.fromUserId) return;

      const preferencesDoc = await db
        .doc(`users/${adminId}/settings/notificationPreferences`)
        .get();
      const prefs = preferencesDoc.data()?.notificationPreferences as
        | Record<string, boolean>
        | undefined;
      if (prefs && prefKey && prefs[prefKey] === false) return;

      await db
        .collection("users")
        .doc(adminId)
        .collection("notifications")
        .add({
          userId: adminId,
          type: input.type,
          message: input.message,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          read: false,
          ...(input.fromUserId ? { fromUserId: input.fromUserId } : {}),
          ...(input.fromUserName ? { fromUserName: input.fromUserName } : {}),
          ...(input.data ?? {}),
        });
      written++;
    })
  );

  return written;
}

export interface ScanDigestInput {
  /** The scanned short code (latest scan). */
  code: string;
  /** Simplified word/label for the scanned card. */
  label: string;
  /** Signed-in non-admin scanner's display name; null when anonymous. */
  scannerName: string | null;
  /** The scanner's uid — used only to skip pinging the admin about their own scan. */
  fromUserId: string | null;
  city: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  /** Coalescing window length in ms and its minute label. */
  windowMs: number;
  windowMinutes: number;
  /** Injected Date.now() (deterministic in tests). */
  now: number;
}

/**
 * Coalesce QR scans into one rolling digest per admin.
 *
 * A burst of scans must not produce a burst of pushes ("a ton of reds"). We
 * exploit the trigger topology: onNewNotification fires on document CREATE only.
 * So the digest is a per-admin doc with a deterministic id keyed to a fixed
 * window bucket, upserted transactionally:
 *
 *   - first scan in the window  → set   (fires onNewNotification → one push),
 *                                        message = full single-scan detail.
 *   - later scans in the window → update (no trigger, no push), accumulating
 *                                        count + distinct cities; once count > 1
 *                                        the message becomes the digest form.
 *
 * The deterministic doc id makes concurrent scans idempotent — two scans in the
 * same bucket resolve to the same ref and serialize through the transaction.
 */
export async function notifyAdminsScanDigest(
  input: ScanDigestInput
): Promise<void> {
  if (isAgentUserId(input.fromUserId)) return;

  const admins = await loadAdmins();
  const bucket = Math.floor(input.now / input.windowMs);
  const docId = `qr-scan-digest-${bucket}`;

  const latest = {
    shortCode: input.code,
    scanCity: input.city,
    scanCountry: input.country,
    scanLat: input.lat,
    scanLng: input.lng,
  };

  await Promise.all(
    [...admins.entries()].map(async ([adminId]) => {
      if (input.fromUserId && adminId === input.fromUserId) return;
      const preferencesDoc = await db
        .doc(`users/${adminId}/settings/notificationPreferences`)
        .get();
      const prefs = preferencesDoc.data()?.notificationPreferences as
        | Record<string, boolean>
        | undefined;
      if (prefs && prefs.adminQrScan === false) return;

      const ref = db
        .collection("users")
        .doc(adminId)
        .collection("notifications")
        .doc(docId);

      await db.runTransaction(async (tx) => {
        const cur = await tx.get(ref);
        if (!cur.exists) {
          tx.set(ref, {
            userId: adminId,
            type: "admin-qr-scan",
            message: singleScanMessage({
              label: input.label,
              scannerName: input.scannerName,
              city: input.city,
              country: input.country,
            }),
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            read: false,
            scanCount: 1,
            cities: input.city ? [input.city] : [],
            codes: [input.code],
            ...latest,
            ...(input.fromUserId ? { fromUserId: input.fromUserId } : {}),
            ...(input.scannerName ? { fromUserName: input.scannerName } : {}),
          });
          return;
        }

        const d = cur.data() ?? {};
        const scanCount =
          (typeof d.scanCount === "number" ? d.scanCount : 1) + 1;
        const cities: string[] = Array.isArray(d.cities) ? [...d.cities] : [];
        if (input.city && !cities.includes(input.city)) cities.push(input.city);
        const codes: string[] = Array.isArray(d.codes) ? [...d.codes] : [];
        if (!codes.includes(input.code)) codes.push(input.code);

        tx.update(ref, {
          message: digestMessage(scanCount, cities.length, input.windowMinutes),
          scanCount,
          cities,
          codes,
          ...latest,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          // Re-surface the single running digest as unread; no push (updates
          // don't trigger onNewNotification), so still just one "red".
          read: false,
        });
      });
    })
  );
}

export interface VisitDigestInput {
  visit: VisitSummary;
  /** Coalescing window length in ms and its minute label. */
  windowMs: number;
  windowMinutes: number;
  /** Injected Date.now() (deterministic in tests). */
  now: number;
}

/** How many visitors a digest doc keeps for the inbox click-through. */
const DIGEST_KEPT_VISITS = 20;

/**
 * Coalesce site visits into one rolling digest per admin — the same
 * create-pushes, update-is-silent topology as notifyAdminsScanDigest. The
 * first visitor in a window buzzes with full detail; later ones in the same
 * window rewrite the message into a per-visitor list without another push.
 */
export async function notifyAdminsVisitDigest(
  input: VisitDigestInput
): Promise<void> {
  const admins = await loadAdmins();
  const bucket = Math.floor(input.now / input.windowMs);
  const docId = `site-visit-digest-${bucket}`;

  await Promise.all(
    [...admins.keys()].map(async (adminId) => {
      const preferencesDoc = await db
        .doc(`users/${adminId}/settings/notificationPreferences`)
        .get();
      const prefs = preferencesDoc.data()?.notificationPreferences as
        | Record<string, boolean>
        | undefined;
      if (prefs && prefs.adminSiteVisit === false) return;

      const ref = db
        .collection("users")
        .doc(adminId)
        .collection("notifications")
        .doc(docId);

      await db.runTransaction(async (tx) => {
        const cur = await tx.get(ref);
        if (!cur.exists) {
          tx.set(ref, {
            userId: adminId,
            type: "admin-site-visit",
            message: singleVisitMessage(input.visit),
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            read: false,
            visitCount: 1,
            visits: [input.visit],
            postHogSessionId: input.visit.postHogSessionId,
          });
          return;
        }

        const d = cur.data() ?? {};
        const visitCount =
          (typeof d.visitCount === "number" ? d.visitCount : 1) + 1;
        const kept: VisitSummary[] = Array.isArray(d.visits) ? d.visits : [];
        const visits = [...kept, input.visit].slice(0, DIGEST_KEPT_VISITS);

        tx.update(ref, {
          message: visitDigestMessage(visits, visitCount, input.windowMinutes),
          visitCount,
          visits,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          // Re-surface as unread; updates never trigger onNewNotification, so
          // the burst stays one buzz.
          read: false,
        });
      });
    })
  );
}
