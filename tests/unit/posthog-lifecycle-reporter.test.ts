import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authedFetch: vi.fn(),
  getSessionId: vi.fn(),
  auth: {
    currentUser: { uid: "firebase-uid" },
    authStateReady: vi.fn(async () => {}),
  },
}));

vi.mock("#lib/shared/auth/services/authed-fetch.js", () => ({
  authedFetch: mocks.authedFetch,
}));
vi.mock("#lib/shared/analytics/services/posthog.js", () => ({
  getCurrentPostHogSessionId: mocks.getSessionId,
}));
vi.mock("#lib/shared/auth/firebase.js", () => ({ auth: mocks.auth }));
vi.mock("firebase/auth", () => ({ onAuthStateChanged: vi.fn() }));

import { reportPostHogLifecycleEvent } from "#lib/shared/analytics/services/posthog-lifecycle-reporter.js";
import {
  readLifecycleOutbox,
  resetLifecycleOutboxForTests,
} from "#lib/shared/analytics/services/posthog-lifecycle-outbox.js";

describe("PostHog lifecycle reporter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetLifecycleOutboxForTests();
    mocks.getSessionId.mockResolvedValue("session-123");
    mocks.authedFetch.mockResolvedValue(new Response(null, { status: 200 }));
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      "6a0d8c75-cf65-4c53-a378-f6533d654c73"
    );
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-21T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("sends one replay-linked, idempotent envelope to the authenticated endpoint", async () => {
    await reportPostHogLifecycleEvent({
      event: "sequence_save",
      properties: {
        sequenceId: "sequence-1",
        stepCount: 20,
        visibility: "public",
        durability: "cloud",
      },
    });

    expect(mocks.authedFetch).toHaveBeenCalledOnce();
    const [url, init] = mocks.authedFetch.mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/api/rune/lifecycle");
    expect(new Headers(init.headers).get("X-PostHog-Session-ID")).toBe(
      "session-123"
    );
    expect(JSON.parse(String(init.body))).toEqual({
      event: "sequence_save",
      eventId: "6a0d8c75-cf65-4c53-a378-f6533d654c73",
      occurredAt: "2026-08-21T12:00:00.000Z",
      properties: {
        sequenceId: "sequence-1",
        stepCount: 20,
        visibility: "public",
        durability: "cloud",
      },
    });
    expect(init.keepalive).toBe(true);
  });

  it("keeps a non-success response in the owner-scoped outbox", async () => {
    mocks.authedFetch.mockResolvedValue(new Response(null, { status: 502 }));

    await reportPostHogLifecycleEvent({
      event: "guest_upgraded_to_account",
      properties: { status: "linked" },
    });
    expect(crypto.randomUUID).toHaveBeenCalledOnce();
    expect(readLifecycleOutbox()).toEqual([
      expect.objectContaining({
        ownerUid: "firebase-uid",
        attempts: 1,
        envelope: expect.objectContaining({
          event: "guest_upgraded_to_account",
          eventId: "6a0d8c75-cf65-4c53-a378-f6533d654c73",
        }),
      }),
    ]);
  });
});
