/**
 * Lifecycle contract for the Tauri desktop OAuth bridge.
 *
 * Every one of these exercises a disposal path, not a happy-path token: the
 * bridge registers a global `oauth-callback` listener and a two-minute timer
 * before it hands control to the system browser, and both have to come back
 * regardless of how the attempt ends. A leaked listener is not inert — it
 * stays subscribed to a global Tauri event and will fire on a *later*
 * sign-in's callback.
 *
 * The Tauri surface is mocked (no native runtime in CI), so these prove the
 * bridge's own disposal logic against the documented plugin contracts, not
 * the plugins' behaviour.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  invoke: vi.fn(async () => 49_152),
  open: vi.fn(async () => undefined),
  listen: vi.fn(),
  unlisten: vi.fn(),
  credential: vi.fn((idToken: string) => ({ idToken })),
  signInWithCredential: vi.fn(async () => undefined),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: h.invoke }));
vi.mock("@tauri-apps/plugin-shell", () => ({ open: h.open }));
vi.mock("@tauri-apps/api/event", () => ({ listen: h.listen }));

vi.mock("firebase/auth", () => ({
  GoogleAuthProvider: { credential: h.credential },
  signInWithCredential: h.signInWithCredential,
}));
vi.mock("$lib/shared/auth/firebase", () => ({ auth: { currentUser: null } }));
vi.mock("$lib/shared/auth/config/google-oauth", () => ({
  GOOGLE_CLIENT_ID: "test-client-id.apps.googleusercontent.com",
}));

/** Captures the handler `listen("oauth-callback", ...)` was given. */
let emitCallback: ((idToken: string) => void) | null = null;

/** Unhandled rejections the bridge produced, so a leaked timer is visible. */
let unhandled: unknown[] = [];
function recordUnhandled(reason: unknown) {
  unhandled.push(reason);
}

beforeEach(() => {
  vi.clearAllMocks();
  // `setImmediate` stays real so `flush()` can reach the macrotask turn where
  // Node reports an unhandled rejection.
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  unhandled = [];
  process.on("unhandledRejection", recordUnhandled);

  h.invoke.mockResolvedValue(49_152);
  h.open.mockResolvedValue(undefined);
  h.listen.mockImplementation(
    async (_event: string, handler: (e: { payload: { id_token: string } }) => void) => {
      emitCallback = (idToken: string) => handler({ payload: { id_token: idToken } });
      return h.unlisten;
    }
  );
});

afterEach(async () => {
  process.off("unhandledRejection", recordUnhandled);
  vi.useRealTimers();
  emitCallback = null;
});

/**
 * Drain the event loop far enough for the bridge's chain of dynamic imports
 * and awaits to reach `listen()`, and for Node to report an unhandled
 * rejection. `setImmediate` is deliberately not faked.
 */
async function flush(): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

async function loadBridge() {
  return await import("$lib/shared/desktop/tauri-auth-bridge");
}

// Resolve the bridge's dynamic imports once up front so `flush()` measures the
// bridge's own async steps rather than first-time module resolution.
beforeAll(async () => {
  await Promise.all([
    import("@tauri-apps/api/core"),
    import("@tauri-apps/plugin-shell"),
    import("@tauri-apps/api/event"),
    loadBridge(),
  ]);
});

describe("desktopGoogleCredential", () => {
  it("returns a credential and disposes the listener on success", async () => {
    const { desktopGoogleCredential } = await loadBridge();

    const pending = desktopGoogleCredential();
    await flush();

    expect(emitCallback).not.toBeNull();
    emitCallback!("id-token-abc");

    await expect(pending).resolves.toEqual({ idToken: "id-token-abc" });
    expect(h.unlisten).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("disposes the listener and the timer when the redirect never arrives", async () => {
    const { desktopGoogleCredential } = await loadBridge();

    const pending = desktopGoogleCredential();
    const settled = pending.catch((err: Error) => err);
    await flush();

    await vi.advanceTimersByTimeAsync(120_000);

    await expect(settled).resolves.toMatchObject({
      message: expect.stringContaining("timed out"),
    });
    expect(h.unlisten).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("disposes the listener and the timer when the browser cannot be opened", async () => {
    const launchFailure = new Error("shell.open is not allowed");
    h.open.mockRejectedValueOnce(launchFailure);

    const { desktopGoogleCredential } = await loadBridge();

    await expect(desktopGoogleCredential()).rejects.toBe(launchFailure);
    await flush();

    // The listener is subscribed to a GLOBAL Tauri event. Left behind, it
    // fires on the next sign-in attempt's callback.
    expect(h.unlisten).toHaveBeenCalledTimes(1);
    // A surviving timer rejects a promise nobody is awaiting two minutes later.
    expect(vi.getTimerCount()).toBe(0);

    await vi.advanceTimersByTimeAsync(120_000);
    await flush();
    expect(unhandled).toEqual([]);
  });

  it("disposes the listener when the loopback server cannot start", async () => {
    const bindFailure = new Error("Address already in use");
    h.invoke.mockRejectedValueOnce(bindFailure);

    const { desktopGoogleCredential } = await loadBridge();

    await expect(desktopGoogleCredential()).rejects.toBe(bindFailure);
    // Nothing was subscribed yet, so nothing may be left behind either.
    expect(h.listen).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("signInWithDesktopOAuth", () => {
  it("signs in with the bridge credential", async () => {
    const { signInWithDesktopOAuth } = await loadBridge();

    const pending = signInWithDesktopOAuth();
    await flush();
    emitCallback!("id-token-xyz");
    await pending;

    expect(h.signInWithCredential).toHaveBeenCalledWith(
      { currentUser: null },
      { idToken: "id-token-xyz" }
    );
    expect(h.unlisten).toHaveBeenCalledTimes(1);
  });
});
