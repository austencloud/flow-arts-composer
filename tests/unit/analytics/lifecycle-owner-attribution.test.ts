/**
 * A lifecycle event is attributed to the account that DID the thing.
 *
 * `reportPostHogLifecycleEvent` awaits `authStateReady()` and then reads
 * `auth.currentUser` — live, after an await — and stamps that uid as the
 * event's `ownerUid`. For a milestone raised by a completed action (a save),
 * the acting account can already have changed: a guest save followed by a
 * sign-in was enqueued under the account they signed INTO, so account A's
 * milestone landed in account B's funnel.
 *
 * `ownerUid` already existed to stop a later account claiming a QUEUED event.
 * This closes the same gap at enqueue time. Drives the real reporter.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const currentUid = { value: "account-B" as string | undefined };
let releaseAuthReady: (() => void) | null = null;
let authReadyGate: Promise<void> | null = null;
const enqueueMock = vi.fn();

vi.mock("$app/environment", () => ({ browser: true }));
vi.mock("$lib/shared/auth/firebase", () => ({
  auth: {
    authStateReady: async () => {
      if (authReadyGate) await authReadyGate;
    },
    get currentUser() {
      return currentUid.value ? { uid: currentUid.value } : null;
    },
  },
}));
vi.mock("firebase/auth", () => ({ onAuthStateChanged: vi.fn() }));
vi.mock("$lib/shared/auth/services/authed-fetch", () => ({
  authedFetch: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock("$lib/shared/analytics/services/posthog-lifecycle-outbox", () => ({
  enqueueLifecycleEvent: (...a: unknown[]) => enqueueMock(...a),
  dueLifecycleEvents: () => [],
  readLifecycleOutbox: () => [],
  getLifecycleOutboxStorage: () => ({}),
  deferLifecycleEvent: vi.fn(),
  removeLifecycleEvent: vi.fn(),
}));
vi.mock("$lib/shared/analytics/services/posthog", () => ({
  getCurrentPostHogSessionId: vi.fn().mockResolvedValue("session-1"),
}));

const { reportPostHogLifecycleEvent } =
  await import("$lib/shared/analytics/services/posthog-lifecycle-reporter");

const saveEvent = {
  event: "sequence_save",
  properties: { sequenceId: "seq-1" },
} as any;

beforeEach(() => {
  vi.clearAllMocks();
  currentUid.value = "account-B";
  authReadyGate = null;
  releaseAuthReady = null;
});

describe("reportPostHogLifecycleEvent — owner attribution", () => {
  it("enqueues under the acting account when it is still signed in", async () => {
    await reportPostHogLifecycleEvent(saveEvent, "account-B");

    expect(enqueueMock).toHaveBeenCalledTimes(1);
    expect(enqueueMock.mock.calls[0]?.[0]).toMatchObject({
      ownerUid: "account-B",
    });
  });

  it("drops the event rather than attributing it to a different account", async () => {
    currentUid.value = "account-C";

    await reportPostHogLifecycleEvent(saveEvent, "account-B");

    // Enqueuing under C would put A's save in C's funnel — the exact
    // corruption the measurement exists to avoid.
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("drops it when the sign-in lands INSIDE the authStateReady await", async () => {
    authReadyGate = new Promise<void>((resolve) => {
      releaseAuthReady = resolve;
    });

    const report = reportPostHogLifecycleEvent(saveEvent, "account-B");
    // The guest's save completed as B; they sign into C while the reporter is
    // still waiting for auth to settle.
    currentUid.value = "account-C";
    releaseAuthReady!();
    await report;

    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("still enqueues when no expected owner is supplied", async () => {
    currentUid.value = "account-C";

    await reportPostHogLifecycleEvent(saveEvent);

    expect(enqueueMock).toHaveBeenCalledTimes(1);
    expect(enqueueMock.mock.calls[0]?.[0]).toMatchObject({
      ownerUid: "account-C",
    });
  });

  it("still refuses an event with no authenticated owner at all", async () => {
    currentUid.value = undefined;

    await expect(
      reportPostHogLifecycleEvent(saveEvent, "account-B")
    ).rejects.toThrow(/no authenticated owner/i);
    expect(enqueueMock).not.toHaveBeenCalled();
  });
});
