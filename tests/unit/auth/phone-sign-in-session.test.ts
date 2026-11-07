import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Which view the computer shows is decided by what the server said it did, so a
// request that did not ring the phone never tells anyone to tap a notification.
const mocks = vi.hoisted(() => ({
  startPhoneSignIn: vi.fn(),
  collectPhoneSignIn: vi.fn(async () => ({ status: "pending" })),
}));
vi.mock("#lib/shared/auth/phone-sign-in/client.js", () => mocks);
vi.mock("#lib/shared/auth/phone-sign-in/client", () => mocks);

import { createPhoneSignInSession } from "#lib/shared/auth/phone-sign-in/phone-sign-in-session.svelte.js";

function started(notified: boolean) {
  return {
    id: "AbCdEfGhIjKlMnOpQr12",
    secret: "s",
    code: "123456",
    approveUrl: "https://tkaflowarts.com/sign-in/AbCdEfGhIjKlMnOpQr12",
    expiresInMs: 180_000,
    notified,
  };
}

let session: ReturnType<typeof createPhoneSignInSession>;

beforeEach(() => {
  vi.useFakeTimers();
  mocks.startPhoneSignIn.mockReset();
  session = createPhoneSignInSession();
});

afterEach(() => {
  session.dispose();
  vi.useRealTimers();
});

describe("createPhoneSignInSession", () => {
  it("always asks the server to notify, and leaves the decision to it", async () => {
    mocks.startPhoneSignIn.mockResolvedValue(started(false));
    await session.start();
    expect(mocks.startPhoneSignIn).toHaveBeenCalledWith({ notify: true });
  });

  it("shows the QR when the server did not ring the phone", async () => {
    mocks.startPhoneSignIn.mockResolvedValue(started(false));
    await session.start();
    expect(session.notified).toBe(false);
    expect(session.mode).toBe("qr");
    expect(session.announcement).toContain("Scan the QR code");
  });

  it("points at the phone when it did", async () => {
    mocks.startPhoneSignIn.mockResolvedValue(started(true));
    await session.start();
    expect(session.notified).toBe(true);
    expect(session.mode).toBe("phone");
    expect(session.announcement).toContain("Tap the notification");
  });

  it("scanning instead keeps the same request, asking for no new one", async () => {
    mocks.startPhoneSignIn.mockResolvedValue(started(true));
    await session.start();
    const before = session.view;

    session.scanInstead();

    expect(session.mode).toBe("qr");
    expect(session.view).toBe(before);
    expect(mocks.startPhoneSignIn).toHaveBeenCalledOnce();
  });

  it("forgets the old mode while a new request is on its way", async () => {
    mocks.startPhoneSignIn.mockResolvedValue(started(true));
    await session.start();
    await vi.advanceTimersByTimeAsync(181_000);
    expect(session.view.kind).toBe("expired");

    mocks.startPhoneSignIn.mockReturnValue(new Promise(() => {}));
    void session.start();

    expect(session.mode).toBeNull();
  });
});
