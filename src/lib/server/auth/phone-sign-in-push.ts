/**
 * Sends a new phone sign-in request to the trusted phone as a notification that
 * one tap approves. Each account names one FCM token for this, in
 * phone_sign_in_push/{uid}, set from the phone with a signature from its trusted
 * key. Before every send the server checks that the same phone is still trusted
 * and the token document is still that account's; any mismatch deletes the
 * target and sends nothing. Anything missing means no notification, and the
 * computer shows the QR code.
 *
 * FCM rather than raw Web Push: the phone's worker registration already holds
 * FCM's push subscription, and a second raw one would fight it. Only the server
 * reads or writes the collection; firestore.rules has no match for it, so
 * clients are denied.
 */

import { formatCode } from "@austencloud/phone-sign-in";
import type {
  PhoneSignInStore,
  SignInNotice,
} from "@austencloud/phone-sign-in/server";
import { fcmTokenDocId } from "#lib/shared/push/fcm-token-doc-id.js";
import {
  LIVE_ORIGIN,
  SIGN_IN_PUSH_TYPE,
  reviewPath,
  signInTag,
} from "#lib/shared/auth/phone-sign-in/values.js";

export const SIGN_IN_PUSH_COLLECTION = "phone_sign_in_push";
export const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const TRUSTED_PHONES = "trusted_phones";

/** Notifications per 10 minutes, across everyone, so the sign-in sheet cannot be used to spam the phone. */
export const PUSH_LIMIT = 5;
const PUSH_WINDOW_MS = 10 * 60 * 1000;
/** And per day, so a slow, steady trickle cannot keep the phone buzzing either. */
export const PUSH_DAILY_LIMIT = 20;
const PUSH_DAY_MS = 24 * 60 * 60 * 1000;

const TOKEN_DOC_ID = /^[0-9a-f]{32}$/;

export function isTokenDocId(value: unknown): value is string {
  return typeof value === "string" && TOKEN_DOC_ID.test(value);
}

export interface PushTarget {
  uid: string;
  /** The users/{uid}/fcmTokens document id. The token itself is never stored here. */
  tokenDocId: string;
  /** The phone, such as "Chrome on Android". */
  label: string;
  /** The trusted phone's keyTag when this was set: trusting another phone stops these notifications. */
  keyTag: string;
}

export interface SavedFcmToken {
  token: string;
  /** "web" or "android-native". A native token has no worker to show a data-only message. */
  transport: string | null;
}

export interface SignInPushDeps {
  store: Pick<PhoneSignInStore, "get" | "set" | "delete">;
  listTargets: () => Promise<PushTarget[]>;
  tokens: {
    get: (uid: string, docId: string) => Promise<SavedFcmToken | null>;
    delete: (uid: string, docId: string) => Promise<void>;
  };
  /** True when another notification may go out under this cap. */
  rateLimit: (check: {
    route: string;
    limit: number;
    windowMs: number;
  }) => boolean | Promise<boolean>;
  projectId: () => string;
  /** fetch with the service account's token for FCM_SCOPE. */
  fcmFetch: (url: string, init: RequestInit) => Promise<Response>;
  now?: () => number;
}

/** What the phone's worker needs. FCM data values are strings. */
export function signInMessageData(
  notice: SignInNotice
): Record<string, string> {
  const { label, place, site } = notice.device;
  const lines = [`Tap to sign it in. Code ${formatCode(notice.code)}`];
  if (place) lines.push(`Near ${place}`);
  if (site && site !== new URL(LIVE_ORIGIN).host) lines.push(`On ${site}`);
  return {
    type: SIGN_IN_PUSH_TYPE,
    id: notice.id,
    title: `Sign in ${label}?`,
    body: lines.join("\n"),
    tag: signInTag(notice.id),
    url: reviewPath(notice.id),
    label,
    expiresInMs: String(notice.expiresInMs),
  };
}

export function createSignInPush(deps: SignInPushDeps) {
  const now = deps.now ?? Date.now;

  async function deleteTarget(uid: string): Promise<void> {
    await deps.store.delete(SIGN_IN_PUSH_COLLECTION, uid);
  }

  /** A web token that still hashes to its document id, or null. */
  async function usableToken(target: PushTarget): Promise<string | null> {
    const saved = await deps.tokens.get(target.uid, target.tokenDocId);
    if (!saved || saved.transport === "android-native") return null;
    // The owner can write these documents, so a token rewritten in place no
    // longer matches the id the trusted phone signed.
    if ((await fcmTokenDocId(saved.token)) !== target.tokenDocId) return null;
    return saved.token;
  }

  async function capsAllow(): Promise<boolean> {
    try {
      for (const [route, limit, windowMs] of [
        ["phone-sign-in-push", PUSH_LIMIT, PUSH_WINDOW_MS],
        ["phone-sign-in-push-day", PUSH_DAILY_LIMIT, PUSH_DAY_MS],
      ] as const) {
        if (!(await deps.rateLimit({ route, limit, windowMs }))) return false;
      }
      return true;
    } catch (cause) {
      // Fails closed: a broken limiter means the QR code, never an open phone.
      console.error("[phone-sign-in-push] rate limit failed", cause);
      return false;
    }
  }

  /** Sends one target its notification. True when FCM took it. */
  async function notifyTarget(
    target: PushTarget,
    notice: SignInNotice
  ): Promise<boolean> {
    // Stopping automatic approval removes the trusted phone, and trusting
    // another phone changes its keyTag; either way this phone no longer rings.
    const trusted = await deps.store.get(TRUSTED_PHONES, target.uid);
    const token =
      trusted?.keyTag === target.keyTag ? await usableToken(target) : null;
    if (!token) {
      await deleteTarget(target.uid);
      return false;
    }

    const response = await deps.fcmFetch(
      `https://fcm.googleapis.com/v1/projects/${deps.projectId()}/messages:send`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: {
            token,
            data: signInMessageData(notice),
            webpush: {
              headers: {
                Urgency: "high",
                // FCM drops it once the request has expired.
                TTL: String(Math.max(1, Math.floor(notice.expiresInMs / 1000))),
              },
            },
          },
        }),
      }
    );
    if (response.ok) return true;

    const answer = await response.text().catch(() => "");
    if (response.status === 404 || answer.includes("UNREGISTERED")) {
      await Promise.allSettled([
        deps.tokens.delete(target.uid, target.tokenDocId),
        deleteTarget(target.uid),
      ]);
    } else {
      console.error(`[phone-sign-in-push] FCM answered ${response.status}`);
    }
    return false;
  }

  return {
    /** The trusted phone's keyTag for this account, or null when it has none. */
    async trustedKeyTag(uid: string): Promise<string | null> {
      const trusted = await deps.store.get(TRUSTED_PHONES, uid);
      return typeof trusted?.keyTag === "string" ? trusted.keyTag : null;
    },

    savedToken: deps.tokens.get,

    async setTarget(target: PushTarget): Promise<void> {
      await deps.store.set(SIGN_IN_PUSH_COLLECTION, target.uid, {
        tokenDocId: target.tokenDocId,
        label: target.label,
        keyTag: target.keyTag,
        updatedAt: new Date(now()),
      });
    },

    deleteTarget,

    /** The phone sign-in server's notifier: true when a trusted phone was sent the request. */
    async notify(notice: SignInNotice): Promise<boolean> {
      const targets = await deps.listTargets();
      if (targets.length === 0) return false;
      if (!(await capsAllow())) return false;

      const sent = await Promise.allSettled(
        targets.map((target) => notifyTarget(target, notice))
      );
      for (const result of sent) {
        if (result.status === "rejected") {
          console.error("[phone-sign-in-push] send failed", result.reason);
        }
      }
      return sent.some(
        (result) => result.status === "fulfilled" && result.value
      );
    },
  };
}
