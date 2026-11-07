import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// What the approve page says about notifications has to match what happened: a
// phone told "on" that never named itself would wait for a sign-in that never
// comes. And it has to sign the id the server will check.
const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  loadTrustedKey: vi.fn(),
  signAutoApproval: vi.fn(async () => "signed"),
  enableForCurrentDevice: vi.fn(),
  getRegistrationState: vi.fn(),
  registeredTokenFor: vi.fn(),
}));
vi.mock("#lib/shared/auth/phone-sign-in/client", () => ({
  apiFetch: mocks.apiFetch,
  loadTrustedKey: mocks.loadTrustedKey,
  signAutoApproval: mocks.signAutoApproval,
}));
vi.mock("#lib/shared/push/get-fcm-token-manager", () => ({
  getFCMTokenManager: () => ({
    enableForCurrentDevice: mocks.enableForCurrentDevice,
    getRegistrationState: mocks.getRegistrationState,
    registeredTokenFor: mocks.registeredTokenFor,
  }),
}));

import {
  askToNotify,
  refreshSignInNotifications,
  turnOffSignInNotifications,
  turnOnSignInNotifications,
} from "#lib/shared/auth/phone-sign-in/phone-sign-in-push.js";
import { fcmTokenDocId } from "#lib/shared/push/fcm-token-doc-id.js";

function allow(permission: NotificationPermission) {
  const Notification = {
    permission,
    requestPermission: vi.fn(async () => "granted"),
  };
  vi.stubGlobal("Notification", Notification);
  vi.stubGlobal("window", { Notification });
  vi.stubGlobal("navigator", { serviceWorker: {} });
}

beforeEach(() => {
  vi.clearAllMocks();
  allow("granted");
  mocks.loadTrustedKey.mockResolvedValue({ key: "pair" });
  mocks.enableForCurrentDevice.mockResolvedValue("ready");
  mocks.getRegistrationState.mockResolvedValue("ready");
  mocks.registeredTokenFor.mockReturnValue("the-token");
  mocks.apiFetch.mockResolvedValue(new Response("{}", { status: 200 }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("turnOnSignInNotifications", () => {
  it("signs and names the token's document id with a fresh sign-in", async () => {
    expect(await turnOnSignInNotifications("austen")).toBe("on");

    const docId = await fcmTokenDocId("the-token");
    expect(mocks.signAutoApproval).toHaveBeenCalledWith(
      { key: "pair" },
      `push-target ${docId}`
    );
    const [url, init, options] = mocks.apiFetch.mock.calls[0]!;
    expect(url).toBe("/api/phone-sign-in/push-target");
    expect(JSON.parse(init.body)).toEqual({
      tokenDocId: docId,
      signature: "signed",
    });
    expect(options).toEqual({ forceRefresh: true });
  });

  it("says blocked, touching nothing, when the browser blocks notifications", async () => {
    allow("denied");
    expect(await turnOnSignInNotifications("austen")).toBe("blocked");
    expect(mocks.enableForCurrentDevice).not.toHaveBeenCalled();
  });

  it("says not available when the prompt went unanswered", async () => {
    allow("default");
    expect(await turnOnSignInNotifications("austen")).toBe("unavailable");
  });

  it.each([
    ["unsupported", "unavailable"],
    ["blocked", "blocked"],
    ["failed", "failed"],
  ])("maps a token manager state of %s to %s", async (state, answer) => {
    mocks.enableForCurrentDevice.mockResolvedValue(state);
    expect(await turnOnSignInNotifications("austen")).toBe(answer);
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });

  it("never says on when the server refuses", async () => {
    mocks.apiFetch.mockResolvedValue(new Response("{}", { status: 403 }));
    expect(await turnOnSignInNotifications("austen")).toBe("failed");
  });

  it("says failed when something throws", async () => {
    mocks.apiFetch.mockRejectedValue(new Error("offline"));
    expect(await turnOnSignInNotifications("austen")).toBe("failed");
  });

  it("names nothing without the trusted key", async () => {
    mocks.loadTrustedKey.mockResolvedValue(null);
    expect(await turnOnSignInNotifications("austen")).toBe("unavailable");
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });
});

describe("refreshSignInNotifications", () => {
  it("names the phone again, never asking and never overriding a choice", async () => {
    expect(await refreshSignInNotifications("austen")).toBe("on");
    expect(mocks.enableForCurrentDevice).not.toHaveBeenCalled();
    expect(Notification.requestPermission).not.toHaveBeenCalled();
  });

  it("leaves a phone with notifications off on this device alone", async () => {
    mocks.getRegistrationState.mockResolvedValue("off");
    expect(await refreshSignInNotifications("austen")).toBe("unavailable");
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });
});

describe("askToNotify", () => {
  it("asks only when the browser has not asked yet", async () => {
    allow("default");
    await askToNotify();
    expect(Notification.requestPermission).toHaveBeenCalledOnce();

    allow("granted");
    await askToNotify();
    expect(Notification.requestPermission).not.toHaveBeenCalled();
  });
});

describe("turnOffSignInNotifications", () => {
  it("rejects when the server did not clear it, so the page can say so", async () => {
    mocks.apiFetch.mockResolvedValue(new Response("{}", { status: 500 }));
    await expect(turnOffSignInNotifications()).rejects.toThrow();
  });
});
