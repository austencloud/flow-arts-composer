/**
 * Sign-in requests as notifications on the trusted phone. Trusting a phone also
 * turns these on: the phone gets an FCM token the way the app's other
 * notifications do (fcm-token-manager.ts), then names that token for sign-ins
 * (/api/phone-sign-in/push-target), signed with its trusted key so only the phone
 * trusted now can. A local copy of the app then rings this phone instead of
 * showing only the QR code.
 */

import { apiFetch, loadTrustedKey, signAutoApproval } from "./client";
import { pushTargetMessage } from "./values";

const TARGET = "/api/phone-sign-in/push-target";

/** "blocked": notifications are blocked for this site in the browser. "unavailable": no push here, or the prompt went unanswered. */
export type SignInNotifications = "on" | "blocked" | "unavailable" | "failed";

function notificationsSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator
  );
}

/** Where things stand before any token work, or null when notifications are allowed. */
function permissionAnswer(): SignInNotifications | null {
  if (!notificationsSupported()) return "unavailable";
  if (Notification.permission === "denied") return "blocked";
  return Notification.permission === "granted" ? null : "unavailable";
}

/**
 * Asks to show notifications, if the browser has not asked yet. Call it first
 * thing in a tap's handler: Android only shows the prompt for a tap it can still
 * connect to the request. A no only means the QR code.
 */
export async function askToNotify(): Promise<void> {
  if (!notificationsSupported() || Notification.permission !== "default") {
    return;
  }
  await Notification.requestPermission().catch(() => "default");
}

async function tokenManager() {
  // Firebase's messaging code loads only when a phone actually asks for this.
  const { getFCMTokenManager } = await import("../../push/get-fcm-token-manager");
  return getFCMTokenManager();
}

async function nameThisPhone(
  token: string | null,
  uid: string
): Promise<SignInNotifications> {
  if (!token) return "failed";
  // Only a phone that still holds the trusted key can have sign-ins sent to it.
  const keyPair = await loadTrustedKey(uid);
  if (!keyPair) return "unavailable";
  const { fcmTokenDocId } = await import("../../push/fcm-token-doc-id");
  const tokenDocId = await fcmTokenDocId(token);
  const signature = await signAutoApproval(
    keyPair,
    pushTargetMessage(tokenDocId)
  );
  const response = await apiFetch(
    TARGET,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tokenDocId, signature }),
    },
    // The server only accepts a token issued a moment ago, as for trusting the phone.
    { forceRefresh: true }
  );
  return response.ok ? "on" : "failed";
}

/** Gets this phone a token if it has none, and sends sign-ins here. Asks nothing new once askToNotify has run. */
export async function turnOnSignInNotifications(
  uid: string
): Promise<SignInNotifications> {
  const early = permissionAnswer();
  if (early) return early;
  try {
    const manager = await tokenManager();
    // Clears a "notifications off on this device" choice: this tap is asking for them.
    const state = await manager.enableForCurrentDevice(uid);
    if (state === "unsupported") return "unavailable";
    if (state === "blocked") return "blocked";
    if (state !== "ready") return "failed";
    return await nameThisPhone(manager.registeredTokenFor(uid), uid);
  } catch {
    return "failed";
  }
}

/**
 * For a phone already trusted: points sign-ins at this phone again, asking
 * nothing. This catches a token that changed and heals a target the server
 * dropped, and honors a "notifications off on this device" choice.
 */
export async function refreshSignInNotifications(
  uid: string
): Promise<SignInNotifications> {
  const early = permissionAnswer();
  if (early) return early;
  try {
    const manager = await tokenManager();
    const state = await manager.getRegistrationState(uid);
    if (state === "blocked") return "blocked";
    if (state === "failed") return "failed";
    if (state !== "ready") return "unavailable";
    return await nameThisPhone(manager.registeredTokenFor(uid), uid);
  } catch {
    return "failed";
  }
}

/** Stops sending sign-ins to this account's phone. */
export async function turnOffSignInNotifications(): Promise<void> {
  const response = await apiFetch(TARGET, { method: "DELETE" });
  if (!response.ok) throw new Error("Could not stop sign-in notifications");
}
