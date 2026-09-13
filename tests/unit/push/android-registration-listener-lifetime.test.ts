/**
 * Native Android FCM registration listener lifetime.
 *
 * `PushNotifications.addListener` registers a process-global Capacitor
 * listener. `registerToken` is called once per signed-in user (the inbox
 * provider re-runs it whenever the effective user changes, including preview
 * mode and re-sign-in), so listeners that are never removed stack up — and the
 * next `register()` replays its single registration event into *every*
 * listener still attached, each holding the user id its own call captured.
 *
 * The silent failure that causes: this device's FCM token gets written into the
 * previously signed-in account's `fcmTokens` collection, so that account keeps
 * receiving this device's push notifications. Nothing surfaces it in the UI.
 *
 * Invariant: one registration attempt attaches its listeners, consumes its own
 * event, and leaves nothing attached behind it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Handler = (payload: never) => void;

const h = vi.hoisted(() => {
  const listeners = new Map<string, Array<{ id: number; handler: Handler }>>();
  let nextListenerId = 1;
  const state = { token: "token-a" };

  const addListener = vi.fn(async (event: string, handler: Handler) => {
    const entry = { id: nextListenerId++, handler };
    const forEvent = listeners.get(event) ?? [];
    forEvent.push(entry);
    listeners.set(event, forEvent);
    return {
      remove: async () => {
        listeners.set(
          event,
          (listeners.get(event) ?? []).filter((item) => item.id !== entry.id)
        );
      },
    };
  });

  const register = vi.fn(async () => {
    // Capacitor emits one registration event to every attached listener.
    for (const entry of [...(listeners.get("registration") ?? [])]) {
      (entry.handler as (payload: { value: string }) => void)({
        value: state.token,
      });
    }
  });

  return {
    listeners,
    state,
    addListener,
    register,
    checkPermissions: vi.fn(async () => ({ receive: "granted" as const })),
    createChannel: vi.fn(async () => undefined),
    unregister: vi.fn(async () => undefined),
    setDoc: vi.fn(async () => undefined),
    deleteDoc: vi.fn(async () => undefined),
    getDocs: vi.fn(async () => ({ forEach: () => {} })),
    listenerCount: (event: string) => (listeners.get(event) ?? []).length,
  };
});

vi.mock("@capacitor/core", () => ({
  Capacitor: { getPlatform: () => "android" },
}));

vi.mock("@capacitor/push-notifications", () => ({
  PushNotifications: {
    addListener: h.addListener,
    register: h.register,
    unregister: h.unregister,
    checkPermissions: h.checkPermissions,
    requestPermissions: vi.fn(async () => ({ receive: "granted" })),
    createChannel: h.createChannel,
  },
}));

vi.mock("firebase/messaging", () => ({
  getMessaging: vi.fn(),
  getToken: vi.fn(),
  deleteToken: vi.fn(),
  isSupported: vi.fn(async () => true),
}));

vi.mock("firebase/firestore", () => ({
  collection: (_firestore: unknown, ...segments: string[]) =>
    segments.join("/"),
  doc: (path: string, id: string) => `${path}/${id}`,
  setDoc: h.setDoc,
  deleteDoc: h.deleteDoc,
  getDocs: h.getDocs,
  serverTimestamp: () => ({ __serverTimestamp: true }),
}));

vi.mock("$lib/shared/auth/firebase", () => ({
  getFirestoreInstance: async () => ({ name: "firestore" }),
  app: { name: "app" },
}));

vi.mock("$lib/shared/auth/services/device-id-service", () => ({
  getDeviceId: () => "device-1",
}));

const { FCMTokenManager } = await import(
  "$lib/shared/push/services/fcm-token-manager"
);

function writtenTokenPaths(): string[] {
  return h.setDoc.mock.calls.map((call) => call[0] as unknown as string);
}

describe("native Android token registration", () => {
  beforeEach(() => {
    h.listeners.clear();
    h.state.token = "token-a";
    h.setDoc.mockClear();
    h.register.mockClear();
    h.addListener.mockClear();
  });

  it("registers the token for the requesting user", async () => {
    const manager = new FCMTokenManager();

    await expect(manager.registerToken("user-a")).resolves.toBe("token-a");

    expect(writtenTokenPaths()).toHaveLength(1);
    expect(writtenTokenPaths()[0]).toMatch(/^users\/user-a\/fcmTokens\//);
  });

  it("leaves no listener attached after a registration settles", async () => {
    const manager = new FCMTokenManager();

    await manager.registerToken("user-a");

    expect(h.listenerCount("registration")).toBe(0);
    expect(h.listenerCount("registrationError")).toBe(0);
  });

  it("does not write a later registration into the previous user's account", async () => {
    const manager = new FCMTokenManager();

    await manager.registerToken("user-a");

    // Same device, next signed-in user, new token from the SDK.
    h.setDoc.mockClear();
    h.state.token = "token-b";
    await expect(manager.registerToken("user-b")).resolves.toBe("token-b");

    const paths = writtenTokenPaths();
    expect(paths).toHaveLength(1);
    expect(paths[0]).toMatch(/^users\/user-b\/fcmTokens\//);
    expect(paths.some((path) => path.startsWith("users/user-a/"))).toBe(false);
  });

  it("reports failure without leaving its listeners attached", async () => {
    const manager = new FCMTokenManager();
    h.register.mockImplementationOnce(async () => {
      for (const entry of [...(h.listeners.get("registrationError") ?? [])]) {
        (entry.handler as (payload: { error: string }) => void)({
          error: "SERVICE_NOT_AVAILABLE",
        });
      }
    });

    await expect(manager.registerToken("user-a")).resolves.toBeNull();

    expect(h.listenerCount("registration")).toBe(0);
    expect(h.listenerCount("registrationError")).toBe(0);
  });
});
