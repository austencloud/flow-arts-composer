import {
  getMessaging,
  getToken,
  deleteToken,
  isSupported as fcmIsSupported,
} from "firebase/messaging";
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  serverTimestamp,
  getDocs,
  type CollectionReference,
} from "firebase/firestore";
import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { getFirestoreInstance, app } from "$lib/shared/auth/firebase";
import { getDeviceId } from "$lib/shared/auth/services/device-id-service";
import { ANDROID_NOTIFICATION_CHANNELS } from "../notification-channels";
import { VAPID_KEY } from "../config/vapid";

const FCM_TOKENS_COLLECTION = "fcmTokens";

export type PushDeviceRegistrationState =
  | "checking"
  | "unsupported"
  | "blocked"
  | "setup-required"
  | "ready"
  | "failed";

export class FCMTokenManager {
  private currentToken: string | null = null;

  async registerToken(userId: string): Promise<string | null> {
    try {
      if (Capacitor.getPlatform() === "android") {
        return await this.registerNativeAndroidToken(userId);
      }

      const supported = await this.isSupported();
      if (!supported) {
        console.warn("[FCMTokenManager] Push not supported in this browser");
        return null;
      }

      if ((await this.getPermissionState()) !== "granted") {
        console.warn("[FCMTokenManager] Notification permission not granted");
        return null;
      }

      const messaging = getMessaging(app);

      let swRegistration = await navigator.serviceWorker.getRegistration("/");
      if (!swRegistration) {
        // Dev mode unregisters the app service worker (HMR protection —
        // see hooks.client.ts), which made push impossible on the dev
        // origin. Register the dedicated FCM-only worker instead: it has
        // no fetch handler and caches nothing, so it can't break HMR.
        // In production this branch never runs (/sw.js registers at boot).
        try {
          swRegistration = await navigator.serviceWorker.register(
            "/firebase-messaging-sw.js",
            { scope: "/" }
          );
          await navigator.serviceWorker.ready;
        } catch (swError) {
          console.warn(
            "[FCMTokenManager] Could not register FCM service worker:",
            swError
          );
          return null;
        }
      }

      const token = await getToken(messaging, {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: swRegistration,
      });

      if (!token) {
        console.warn("[FCMTokenManager] Failed to get FCM token");
        return null;
      }

      await this.storeToken(userId, token);
      this.currentToken = token;

      return token;
    } catch (error) {
      console.error("[FCMTokenManager] Token registration failed:", error);
      return null;
    }
  }

  async unregisterToken(userId: string): Promise<void> {
    try {
      if (this.currentToken) {
        await this.removeToken(userId, this.currentToken);

        if (Capacitor.getPlatform() === "android") {
          await PushNotifications.unregister();
        } else {
          const messaging = getMessaging(app);
          await deleteToken(messaging);
        }

        this.currentToken = null;
      }
    } catch (error) {
      console.error("[FCMTokenManager] Token unregistration failed:", error);
    }
  }

  async isSupported(): Promise<boolean> {
    if (Capacitor.getPlatform() === "android") return true;
    if (!("Notification" in window)) return false;
    if (!("serviceWorker" in navigator)) return false;

    try {
      return await fcmIsSupported();
    } catch {
      return false;
    }
  }

  async getPermissionState(): Promise<NotificationPermission> {
    if (Capacitor.getPlatform() === "android") {
      const status = await PushNotifications.checkPermissions();
      if (status.receive === "granted") return "granted";
      if (status.receive === "denied") return "denied";
      return "default";
    }
    if (!("Notification" in window)) return "denied";
    return Notification.permission;
  }

  async requestPermission(): Promise<NotificationPermission> {
    if (Capacitor.getPlatform() === "android") {
      const status = await PushNotifications.requestPermissions();
      return status.receive === "granted" ? "granted" : "denied";
    }
    if (!("Notification" in window)) return "denied";
    return Notification.requestPermission();
  }

  async getRegistrationState(
    userId: string
  ): Promise<PushDeviceRegistrationState> {
    if (!(await this.isSupported())) return "unsupported";

    const permission = await this.getPermissionState();
    if (permission === "denied") return "blocked";
    if (permission !== "granted") return "setup-required";

    return (await this.registerToken(userId)) ? "ready" : "failed";
  }

  async getSetupState(): Promise<PushDeviceRegistrationState> {
    if (!(await this.isSupported())) return "unsupported";

    const permission = await this.getPermissionState();
    if (permission === "denied") return "blocked";
    return "setup-required";
  }

  async enableForCurrentDevice(
    userId: string
  ): Promise<PushDeviceRegistrationState> {
    if (!(await this.isSupported())) return "unsupported";

    let permission = await this.getPermissionState();
    if (permission !== "granted") {
      permission = await this.requestPermission();
    }
    if (permission === "denied") return "blocked";
    if (permission !== "granted") return "setup-required";

    return (await this.registerToken(userId)) ? "ready" : "failed";
  }

  private async registerNativeAndroidToken(
    userId: string
  ): Promise<string | null> {
    const permission = await PushNotifications.checkPermissions();
    if (permission.receive !== "granted") return null;

    await Promise.all(
      ANDROID_NOTIFICATION_CHANNELS.map((channel) =>
        PushNotifications.createChannel(channel)
      )
    );

    // Capacitor listeners are process-global and stack up. These used to be
    // added on every registerToken call and never removed, so the single
    // registration event from a later register() was replayed into every
    // earlier call's closure — each still holding the user id it captured.
    // A device that registered as one user and then as another wrote its
    // current token into BOTH accounts, leaving the signed-out one receiving
    // this device's push notifications.
    const handles: PluginListenerHandle[] = [];
    const removeListeners = async (): Promise<void> => {
      const attached = handles.splice(0);
      await Promise.all(
        attached.map((handle) => handle.remove().catch(() => undefined))
      );
    };

    return new Promise((resolve) => {
      let settled = false;
      const finish = (token: string | null) => {
        if (settled) return;
        settled = true;
        // Resolve only once this attempt's listeners are detached, so the
        // caller's next registration starts from a clean slate.
        void removeListeners().then(() => resolve(token));
      };

      void (async () => {
        try {
          handles.push(
            await PushNotifications.addListener("registration", ({ value }) => {
              void this.storeToken(userId, value, "android-native")
                .then(() => {
                  this.currentToken = value;
                  finish(value);
                })
                .catch((error) => {
                  console.error(
                    "[FCMTokenManager] Token storage failed:",
                    error
                  );
                  finish(null);
                });
            }),
            await PushNotifications.addListener(
              "registrationError",
              ({ error }) => {
                console.error(
                  "[FCMTokenManager] Native registration failed:",
                  error
                );
                finish(null);
              }
            )
          );

          if (settled) {
            await removeListeners();
            return;
          }

          await PushNotifications.register();
        } catch (error) {
          console.error("[FCMTokenManager] Native registration failed:", error);
          finish(null);
        }
      })();
    });
  }

  private async storeToken(
    userId: string,
    token: string,
    transport: "web" | "android-native" = "web"
  ): Promise<void> {
    const firestore = await getFirestoreInstance();
    const tokenHash = await this.hashToken(token);
    const deviceId = getDeviceId();
    const tokensCol = collection(
      firestore,
      "users",
      userId,
      FCM_TOKENS_COLLECTION
    );

    await setDoc(doc(tokensCol, tokenHash), {
      token,
      createdAt: serverTimestamp(),
      lastRefreshed: serverTimestamp(),
      device: this.getDeviceLabel(),
      deviceId,
      transport,
      userAgent: navigator.userAgent,
    });

    // One live token per physical device. A device that rotates its FCM
    // token (SDK refresh, PWA reinstall, dev-mode service-worker churn)
    // mints a new token — and a new hash-keyed doc — while the old doc
    // lingers as a tombstone. FCM may still "accept" a send to that dead
    // subscription (returns SENT ok) yet deliver nowhere, so server-side
    // error cleanup never reclaims it. Prune every other doc stamped with
    // THIS deviceId, keeping only the one just written.
    await this.pruneStaleDeviceTokens(tokensCol, tokenHash, deviceId);
  }

  /**
   * Delete FCM token docs belonging to this same physical device that are not
   * the token just registered. Matches on deviceId only: it is origin-scoped
   * (per-origin localStorage), so an installed PWA and a dev build on the same
   * phone carry distinct deviceIds and never prune each other's tokens.
   * Best-effort — never fails token registration over cleanup.
   */
  private async pruneStaleDeviceTokens(
    tokensCol: CollectionReference,
    keepHash: string,
    deviceId: string
  ): Promise<void> {
    try {
      const snap = await getDocs(tokensCol);
      const deletions: Promise<void>[] = [];
      snap.forEach((d) => {
        if (d.id === keepHash) return;
        if (d.data().deviceId === deviceId) deletions.push(deleteDoc(d.ref));
      });
      if (deletions.length > 0) await Promise.all(deletions);
    } catch (error) {
      console.warn("[FCMTokenManager] Stale-token prune skipped:", error);
    }
  }

  private async removeToken(userId: string, token: string): Promise<void> {
    const firestore = await getFirestoreInstance();
    const tokenHash = await this.hashToken(token);
    const tokenRef = doc(
      collection(firestore, "users", userId, FCM_TOKENS_COLLECTION),
      tokenHash
    );
    await deleteDoc(tokenRef);
  }

  private async hashToken(token: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(token);
    const hash = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hash));
    return hashArray
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 32);
  }

  private getDeviceLabel(): string {
    const ua = navigator.userAgent;
    if (ua.includes("Android")) return "Android";
    if (ua.includes("iPhone") || ua.includes("iPad")) return "iOS";
    if (ua.includes("Windows")) return "Windows";
    if (ua.includes("Mac")) return "macOS";
    if (ua.includes("Linux")) return "Linux";
    return "Unknown";
  }
}
