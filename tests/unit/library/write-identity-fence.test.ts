/**
 * Writes are fenced to the account they were selected for, at the write
 * boundary — not at the call site.
 *
 * `LibraryRepository.saveSequence` resolves the uid it stamps as `ownerId`
 * AFTER `await getFirestoreInstance()`. Any caller that picked a row for a
 * specific account — the background sync retry sweeping local rows, the
 * guest-upgrade import writing into the account just signed into — has already
 * released the event loop by then, so a check at the call site is a
 * time-of-check/time-of-use gap: the account can change in the window between
 * "this row is mine" and "this row is being written". Only a check on the far
 * side of that await, against the uid actually about to be stamped, closes it.
 *
 * These tests drive the REAL repository method with a deferred Firestore
 * resolution so the account switch lands inside that exact window.
 *
 * Cover for the identity-fencing review of the audit fixes in
 * docs/superpowers/reviews/2026-09-12-guest-save-continuity-audit.md.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

/** Live auth identity, swapped mid-flight by the tests. */
const authStateMock = {
  isAuthenticated: true,
  isAnonymous: false,
  user: { uid: "account-B" },
  effectiveUserId: "account-B" as string | null,
};

/** Gate that holds getFirestoreInstance() open so a switch can land inside it. */
let releaseFirestore: (() => void) | null = null;
let firestoreGate: Promise<void> | null = null;

vi.mock("$lib/shared/auth/firebase", () => ({
  getAuthInstance: async () => ({ currentUser: authStateMock.user }),
  getFirestoreInstance: async () => {
    if (firestoreGate) await firestoreGate;
    return {} as any;
  },
}));
vi.mock("$lib/shared/auth/state/auth-state.svelte", () => ({
  authState: authStateMock,
}));
vi.mock("$lib/shared/debug/state/user-preview-state.svelte", () => ({
  isPreviewReadOnly: () => false,
}));

const { LibraryRepository } =
  await import("$lib/shared/library/services/library-repository");
const { LibraryError } =
  await import("$lib/shared/library/domain/library-error");

function makeRepo() {
  return new LibraryRepository({} as any);
}
function makeSequence() {
  return {
    id: "seq-1",
    steps: [{ letter: "A" }, { letter: "B" }, { letter: "C" }, { letter: "D" }],
    thumbnails: [],
    tags: [],
    name: "S",
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  authStateMock.effectiveUserId = "account-B";
  authStateMock.user = { uid: "account-B" };
  firestoreGate = null;
  releaseFirestore = null;
});

describe("saveSequence — identity fence", () => {
  it("refuses a write whose expected owner is no longer the signed-in account", async () => {
    const repo = makeRepo();
    authStateMock.effectiveUserId = "account-C";

    await expect(
      repo.saveSequence(makeSequence(), { expectedOwnerId: "account-B" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("refuses when the account switches INSIDE the Firestore-resolution await", async () => {
    // The exact window the call-site guard cannot see: the caller checked the
    // uid, called in, and the switch lands while the repository is still
    // resolving Firestore — before it reads the uid it will stamp.
    firestoreGate = new Promise<void>((resolve) => {
      releaseFirestore = resolve;
    });
    const repo = makeRepo();

    const write = repo.saveSequence(makeSequence(), {
      expectedOwnerId: "account-B",
    });

    // Caller's view of the world was correct when it called.
    expect(authStateMock.effectiveUserId).toBe("account-B");
    // ...and then the user switches accounts, still inside the await.
    authStateMock.effectiveUserId = "account-C";
    releaseFirestore!();

    await expect(write).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(write).rejects.toBeInstanceOf(LibraryError);
  });

  it("does not fence a write that carries no expected owner", async () => {
    // Ordinary saves resolve their own identity and must not be affected.
    const repo = makeRepo();
    authStateMock.effectiveUserId = "account-C";

    // Fails later for unrelated Firestore reasons, but NOT with UNAUTHORIZED.
    await expect(
      repo.saveSequence(makeSequence(), { visibility: "private" })
    ).rejects.not.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("still refuses when there is no signed-in account at all", async () => {
    const repo = makeRepo();
    authStateMock.effectiveUserId = null;

    // getWritableUserId throws UNAUTHORIZED for a missing uid; either way the
    // write must not proceed and must not be attributed to anyone.
    await expect(
      repo.saveSequence(makeSequence(), { expectedOwnerId: "account-B" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("saveSequenceWithMetadata — forwards the fence", () => {
  it("refuses a metadata write for a stale expected owner", async () => {
    const repo = makeRepo();
    authStateMock.effectiveUserId = "account-C";

    await expect(
      repo.saveSequenceWithMetadata(makeSequence(), {
        name: "S",
        visibility: "public",
        tags: [],
        notes: "",
        expectedOwnerId: "account-B",
      })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
