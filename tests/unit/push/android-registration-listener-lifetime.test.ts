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
  const pendingListenerHandles: Array<{
    resolve: (handle: { remove: () => Promise<void> }) => void;
    handle: { remove: () => Promise<void> };
  }> = [];
  const pendingFirestore: Array<() => void> = [];
  const pendingTokenDeletes: Array<() => void> = [];
  let nextListenerId = 1;
  const state = {
    token: "token-a",
    rejectEvent: null as string | null,
    holdNextListenerHandle: false,
    registrationEventCount: 1,
    holdFirestore: false,
    holdTokenDelete: false,
  };

  const addListener = vi.fn(async (event: string, handler: Handler) => {
    if (state.rejectEvent === event) {
      state.rejectEvent = null;
      throw new Error(`Could not attach ${event}`);
    }
    const entry = { id: nextListenerId++, handler };
    const forEvent = listeners.get(event) ?? [];
    forEvent.push(entry);
    listeners.set(event, forEvent);
    const handle = {
      remove: async () => {
        listeners.set(
          event,
          (listeners.get(event) ?? []).filter((item) => item.id !== entry.id)
        );
      },
    };
    if (state.holdNextListenerHandle) {
      state.holdNextListenerHandle = false;
      return new Promise<typeof handle>((resolve) => {
        pendingListenerHandles.push({ resolve, handle });
      });
    }
    return handle;
  });

  const register = vi.fn(async () => {
    // Capacitor emits one registration event to every attached listener.
    for (let index = 0; index < state.registrationEventCount; index += 1) {
      for (const entry of [...(listeners.get("registration") ?? [])]) {
        (entry.handler as (payload: { value: string }) => void)({
          value: state.token,
        });
      }
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
    deleteDoc: vi.fn(async () => {
      if (state.holdTokenDelete) {
        await new Promise<void>((resolve) => pendingTokenDeletes.push(resolve));
      }
    }),
    getDocs: vi.fn(async () => ({ forEach: () => {} })),
    listenerCount: (event: string) => (listeners.get(event) ?? []).length,
    releaseListenerHandles: () => {
      for (const pending of pendingListenerHandles.splice(0)) {
        pending.resolve(pending.handle);
      }
    },
    pendingListenerHandles,
    pendingFirestore,
    pendingTokenDeletes,
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
  getFirestoreInstance: async () => {
    if (h.state.holdFirestore) {
      await new Promise<void>((resolve) => h.pendingFirestore.push(resolve));
    }
    return { name: "firestore" };
  },
  app: { name: "app" },
}));

vi.mock("$lib/shared/auth/services/device-id-service", () => ({
  getDeviceId: () => "device-1",
}));

const { FCMTokenManager } =
  await import("$lib/shared/push/services/fcm-token-manager");

function writtenTokenPaths(): string[] {
  return h.setDoc.mock.calls.map((call) => call[0] as unknown as string);
}

describe("native Android token registration", () => {
  beforeEach(() => {
    h.listeners.clear();
    h.state.token = "token-a";
    h.state.rejectEvent = null;
    h.state.holdNextListenerHandle = false;
    h.state.registrationEventCount = 1;
    h.state.holdFirestore = false;
    h.state.holdTokenDelete = false;
    h.pendingListenerHandles.length = 0;
    h.pendingFirestore.length = 0;
    h.pendingTokenDeletes.length = 0;
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

  it("removes the first listener when the second listener fails to attach", async () => {
    const manager = new FCMTokenManager();
    h.state.rejectEvent = "registrationError";

    await expect(manager.registerToken("user-a")).resolves.toBeNull();

    expect(h.listenerCount("registration")).toBe(0);
    expect(h.listenerCount("registrationError")).toBe(0);
  });

  it("lets only the latest overlapping registration store the shared event", async () => {
    const manager = new FCMTokenManager();
    h.state.holdNextListenerHandle = true;

    const first = manager.registerToken("user-a");
    await vi.waitFor(() => expect(h.listenerCount("registration")).toBe(1));

    h.state.token = "token-b";
    const second = manager.registerToken("user-b");
    await expect(second).resolves.toBe("token-b");

    h.releaseListenerHandles();
    await expect(first).resolves.toBeNull();

    const paths = writtenTokenPaths();
    expect(paths).toHaveLength(1);
    expect(paths[0]).toMatch(/^users\/user-b\/fcmTokens\//);
    expect(paths.some((path) => path.startsWith("users/user-a/"))).toBe(false);
    expect(h.listenerCount("registration")).toBe(0);
    expect(h.listenerCount("registrationError")).toBe(0);
  });

  it("stores at most once when the native plugin repeats its callback", async () => {
    const manager = new FCMTokenManager();
    h.state.registrationEventCount = 2;

    await expect(manager.registerToken("user-a")).resolves.toBe("token-a");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(h.setDoc).toHaveBeenCalledTimes(1);
    expect(h.listenerCount("registration")).toBe(0);
    expect(h.listenerCount("registrationError")).toBe(0);
  });

  it("abandons a token write still resolving for a superseded account", async () => {
    const manager = new FCMTokenManager();
    h.state.holdFirestore = true;

    const first = manager.registerToken("user-a");
    await vi.waitFor(() => expect(h.pendingFirestore).toHaveLength(1));

    h.state.holdFirestore = false;
    h.state.token = "token-b";
    const second = manager.registerToken("user-b");
    await expect(second).resolves.toBe("token-b");
    await expect(first).resolves.toBeNull();

    for (const release of h.pendingFirestore.splice(0)) release();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const paths = writtenTokenPaths();
    expect(paths).toHaveLength(1);
    expect(paths[0]).toMatch(/^users\/user-b\/fcmTokens\//);
    expect(paths.some((path) => path.startsWith("users/user-a/"))).toBe(false);
  });

  it("cancels an in-flight registration when its owner unregisters", async () => {
    const manager = new FCMTokenManager();
    h.state.holdFirestore = true;

    const registration = manager.registerToken("user-a");
    await vi.waitFor(() => expect(h.pendingFirestore).toHaveLength(1));

    await manager.unregisterToken("user-a");
    for (const release of h.pendingFirestore.splice(0)) release();

    await expect(registration).resolves.toBeNull();
    expect(h.setDoc).not.toHaveBeenCalled();
    expect(h.listenerCount("registration")).toBe(0);
    expect(h.listenerCount("registrationError")).toBe(0);
  });

  it("does not unregister the newer account's completed token", async () => {
    const manager = new FCMTokenManager();
    h.state.token = "token-b";
    await expect(manager.registerToken("user-b")).resolves.toBe("token-b");
    h.deleteDoc.mockClear();
    h.unregister.mockClear();

    await manager.unregisterToken("user-a");

    expect(h.deleteDoc).not.toHaveBeenCalled();
    expect(h.unregister).not.toHaveBeenCalled();

    await manager.unregisterToken("user-b");
    expect(h.deleteDoc).toHaveBeenCalledTimes(1);
    expect(h.unregister).toHaveBeenCalledTimes(1);
  });

  it("does not disrupt a newer registration when the old owner unregisters", async () => {
    const manager = new FCMTokenManager();
    await manager.registerToken("user-a");
    h.unregister.mockClear();
    h.state.holdNextListenerHandle = true;
    h.state.token = "token-b";

    const registration = manager.registerToken("user-b");
    await vi.waitFor(() => expect(h.listenerCount("registration")).toBe(1));

    await manager.unregisterToken("user-a");
    expect(h.unregister).not.toHaveBeenCalled();

    h.releaseListenerHandles();
    await expect(registration).resolves.toBe("token-b");
  });

  it("does not unregister a different account that completes during token deletion", async () => {
    const manager = new FCMTokenManager();
    await manager.registerToken("user-a");
    h.unregister.mockClear();
    h.state.holdTokenDelete = true;

    const staleUnregister = manager.unregisterToken("user-a");
    await vi.waitFor(() => expect(h.pendingTokenDeletes).toHaveLength(1));

    h.state.token = "token-b";
    await manager.registerToken("user-b");
    h.state.holdTokenDelete = false;
    for (const release of h.pendingTokenDeletes.splice(0)) release();
    await staleUnregister;

    expect(h.unregister).not.toHaveBeenCalled();
    await manager.unregisterToken("user-b");
    expect(h.unregister).toHaveBeenCalledTimes(1);
  });

  it("does not erase a same-owner registration that completes during token deletion", async () => {
    const manager = new FCMTokenManager();
    await manager.registerToken("user-a");
    h.unregister.mockClear();
    h.state.holdTokenDelete = true;

    const staleUnregister = manager.unregisterToken("user-a");
    await vi.waitFor(() => expect(h.pendingTokenDeletes).toHaveLength(1));

    h.state.token = "token-a-new";
    await manager.registerToken("user-a");
    h.state.holdTokenDelete = false;
    for (const release of h.pendingTokenDeletes.splice(0)) release();
    await staleUnregister;

    expect(h.unregister).not.toHaveBeenCalled();
    await manager.unregisterToken("user-a");
    expect(h.unregister).toHaveBeenCalledTimes(1);
  });
});
