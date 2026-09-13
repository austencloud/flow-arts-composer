/**
 * Unowned saves are adopted by a fresh ANONYMOUS identity, and by nothing else.
 *
 * A save can complete before any identity exists, because `ensureGuestIdentity`
 * swallows its own failures rather than losing the user's work. Those rows are
 * parked as unowned. The only moment they can be honestly attributed is when
 * this browser provisions a new anonymous identity — the same person continuing
 * the same guest session.
 *
 * A full account signing in must never adopt them. It did not make them, and
 * auto-adoption across an account boundary is the entire class of bug this work
 * exists to remove. The boundary is structural: adoption lives inside the
 * anonymous-provisioning path, which a full-account sign-in never enters.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const signInAnonymouslyMock = vi.fn();
const currentUser = {
  value: null as { uid: string; isAnonymous?: boolean } | null,
};

vi.mock("firebase/auth", () => ({
  signInAnonymously: (...a: unknown[]) => signInAnonymouslyMock(...a),
}));
vi.mock("$lib/shared/auth/firebase", () => ({
  getAuthInstance: async () => ({ currentUser: currentUser.value }),
}));
vi.mock("$lib/shared/analytics/services/posthog", () => ({
  captureWhenReady: vi.fn(),
  captureExceptionWhenReady: vi.fn(),
}));
// NOT mocked: the ledger. Adoption is asserted through the real predicate.

const { ensureGuestIdentity } =
  await import("$lib/shared/auth/services/guest-identity");
const {
  recordUnownedSequenceId,
  getUnownedSequenceIds,
  getOwnedSequenceIdSet,
  adoptUnownedSequenceIds,
} = await import("$lib/shared/library/services/saved-sequence-ledger");

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  currentUser.value = null;
  signInAnonymouslyMock.mockResolvedValue({ user: { uid: "anon-new" } });
});

describe("ensureGuestIdentity — adoption of unowned saves", () => {
  it("hands parked saves to the anonymous identity it provisions", async () => {
    recordUnownedSequenceId("seq-1");
    recordUnownedSequenceId("seq-2");

    await ensureGuestIdentity();

    expect(getOwnedSequenceIdSet("anon-new")).toEqual(
      new Set(["seq-1", "seq-2"])
    );
    expect(getUnownedSequenceIds()).toEqual([]);
  });

  it("is a no-op when there is nothing parked", async () => {
    await ensureGuestIdentity();

    expect(getOwnedSequenceIdSet("anon-new").size).toBe(0);
  });

  it("adopts into a RESTORED anonymous identity, not just a fresh one", async () => {
    // The browser already holds an anonymous user, so ensureGuestIdentity takes
    // its early return and never calls signInAnonymously. Without adopting
    // here the parked rows stayed parked forever — invisible and unsyncable,
    // the exact orphaning the park exists to end.
    currentUser.value = { uid: "anon-restored", isAnonymous: true };
    recordUnownedSequenceId("seq-1");

    await ensureGuestIdentity();

    expect(signInAnonymouslyMock).not.toHaveBeenCalled();
    expect(getOwnedSequenceIdSet("anon-restored").has("seq-1")).toBe(true);
    expect(getUnownedSequenceIds()).toEqual([]);
  });

  it("does not adopt into an already signed-in FULL account", async () => {
    currentUser.value = { uid: "already-signed-in", isAnonymous: false };
    recordUnownedSequenceId("seq-1");

    await ensureGuestIdentity();

    expect(signInAnonymouslyMock).not.toHaveBeenCalled();
    expect(getOwnedSequenceIdSet("already-signed-in").size).toBe(0);
    // Still parked — a later anonymous session can still claim it.
    expect(getUnownedSequenceIds()).toEqual(["seq-1"]);
  });

  it("leaves parked saves alone when anonymous sign-in fails", async () => {
    signInAnonymouslyMock.mockRejectedValue(
      Object.assign(new Error("disabled"), {
        code: "auth/admin-restricted-operation",
      })
    );
    recordUnownedSequenceId("seq-1");

    // The failure is swallowed so a save is never lost over it.
    await expect(ensureGuestIdentity()).resolves.toBeUndefined();
    expect(getUnownedSequenceIds()).toEqual(["seq-1"]);
  });
});

describe("adoption is anonymous-only by construction", () => {
  it("is not reachable from any full-account sign-in path", async () => {
    // The only production caller of adoptUnownedSequenceIds is inside
    // ensureGuestIdentity's signInAnonymously().then(...). A full-account
    // sign-in never provisions an anonymous identity, so it never reaches it.
    // This test pins the consequence rather than the wiring: a full account
    // signing in over parked saves does not acquire them.
    recordUnownedSequenceId("guest-work");
    currentUser.value = { uid: "full-account", isAnonymous: false };

    await ensureGuestIdentity();

    expect(getOwnedSequenceIdSet("full-account").size).toBe(0);
    expect(getUnownedSequenceIds()).toEqual(["guest-work"]);
  });

  it("still refuses an empty uid if called directly", () => {
    recordUnownedSequenceId("seq-1");

    expect(adoptUnownedSequenceIds(undefined)).toEqual([]);
    expect(getUnownedSequenceIds()).toEqual(["seq-1"]);
  });
});

describe("the park is released only for ledger writes that persisted", () => {
  /**
   * `recordSavedSequenceId` swallows quota and private-browsing failures.
   * Clearing the park on the strength of having CALLED it would drop the id
   * from both sides — owned by nobody, parked by nobody — which is strictly
   * worse than the orphaning this mechanism was built to fix.
   */
  it("keeps an id parked when its owner-ledger write fails", () => {
    recordUnownedSequenceId("seq-1");
    const realSetItem = localStorage.setItem.bind(localStorage);
    const setItemSpy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation((key: string, value: string) => {
        // Only the OWNER ledger write fails; the park remains writable.
        if (key.startsWith("tka-saved-seq-ids:")) {
          throw new DOMException("quota", "QuotaExceededError");
        }
        realSetItem(key, value);
      });

    try {
      const adopted = adoptUnownedSequenceIds("anon-1");

      expect(adopted).toEqual([]);
      expect(getOwnedSequenceIdSet("anon-1").size).toBe(0);
      // Still claimable by a later attempt, rather than silently gone.
      expect(getUnownedSequenceIds()).toEqual(["seq-1"]);
    } finally {
      setItemSpy.mockRestore();
    }
  });

  it("releases only the ids that actually persisted", () => {
    recordUnownedSequenceId("ok-1");
    recordUnownedSequenceId("fails");
    const realSetItem = localStorage.setItem.bind(localStorage);
    const setItemSpy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation((key: string, value: string) => {
        if (key.startsWith("tka-saved-seq-ids:") && value.includes("fails")) {
          throw new DOMException("quota", "QuotaExceededError");
        }
        realSetItem(key, value);
      });

    try {
      const adopted = adoptUnownedSequenceIds("anon-1");

      expect(adopted).toEqual(["ok-1"]);
      expect(getUnownedSequenceIds()).toEqual(["fails"]);
    } finally {
      setItemSpy.mockRestore();
    }
  });

  it("retries successfully once storage recovers", () => {
    recordUnownedSequenceId("seq-1");
    const realSetItem = localStorage.setItem.bind(localStorage);
    const setItemSpy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation((key: string, value: string) => {
        if (key.startsWith("tka-saved-seq-ids:")) {
          throw new DOMException("quota", "QuotaExceededError");
        }
        realSetItem(key, value);
      });
    adoptUnownedSequenceIds("anon-1");
    setItemSpy.mockRestore();

    const adopted = adoptUnownedSequenceIds("anon-1");

    expect(adopted).toEqual(["seq-1"]);
    expect(getOwnedSequenceIdSet("anon-1").has("seq-1")).toBe(true);
    expect(getUnownedSequenceIds()).toEqual([]);
  });
});
