/**
 * Tag READS are account-scoped too, at the real tag-manager boundary.
 *
 * `findTagByName` resolves `getAuthenticatedUserId()` after
 * `await getFirestoreInstance()` and uses it as the collection path
 * (`users/{uid}/tags`). During a save that is a deferred lookup: the account can
 * change before it runs, and then it answers "does this tag exist?" about the
 * WRONG account — a false "no" creates a duplicate tag, a false "yes" hands back
 * a stranger's tag id.
 *
 * `createUserTag` calls `findTagByName` a SECOND time internally, which
 * re-resolves live auth all over again, so both lookups have to carry the owner.
 *
 * These drive the REAL tag-manager with a deferred Firestore resolution, so the
 * switch lands inside the exact window. The save-service test that mocks
 * tag-manager cannot see any of this.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const liveUid = { value: "account-B" as string | null };
let releaseFirestore: (() => void) | null = null;
let firestoreGate: Promise<void> | null = null;
const getDocsMock = vi.fn();
const setDocMock = vi.fn().mockResolvedValue(undefined);
const collectionMock = vi.fn((_db: unknown, path: string) => ({ path }));

vi.mock("$lib/shared/auth/firebase", () => ({
  getFirestoreInstance: async () => {
    if (firestoreGate) await firestoreGate;
    return {} as any;
  },
}));
vi.mock("$lib/shared/auth/state/auth-state.svelte", () => ({
  authState: {
    get effectiveUserId() {
      return liveUid.value;
    },
  },
}));
vi.mock("firebase/firestore", () => ({
  collection: (...a: unknown[]) => collectionMock(...(a as [unknown, string])),
  doc: (_db: unknown, path: string) => ({ path }),
  getDocs: (...a: unknown[]) => getDocsMock(...a),
  setDoc: (...a: unknown[]) => setDocMock(...a),
  query: (ref: unknown) => ref,
  where: vi.fn(),
  serverTimestamp: () => "ts",
  deleteDoc: vi.fn(),
  updateDoc: vi.fn(),
  getDoc: vi.fn().mockResolvedValue({ exists: () => false, data: () => ({}) }),
  orderBy: vi.fn(),
  limit: vi.fn(),
  writeBatch: vi.fn(),
  increment: vi.fn(),
  arrayUnion: vi.fn(),
  arrayRemove: vi.fn(),
}));

const { findTagByName, createUserTag } =
  await import("$lib/features/library/services/tag-manager");

beforeEach(() => {
  vi.clearAllMocks();
  liveUid.value = "account-B";
  firestoreGate = null;
  releaseFirestore = null;
  getDocsMock.mockResolvedValue({ empty: true, docs: [] });
  setDocMock.mockResolvedValue(undefined);
  collectionMock.mockImplementation((_db: unknown, path: string) => ({ path }));
});

describe("findTagByName — identity fence on the lookup", () => {
  it("refuses a lookup whose expected owner is no longer signed in", async () => {
    liveUid.value = "account-C";

    await expect(findTagByName("flow", "account-B")).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(getDocsMock).not.toHaveBeenCalled();
  });

  it("refuses when the switch lands INSIDE the Firestore-resolution await", async () => {
    firestoreGate = new Promise<void>((resolve) => {
      releaseFirestore = resolve;
    });

    const lookup = findTagByName("flow", "account-B");
    liveUid.value = "account-C";
    releaseFirestore!();

    await expect(lookup).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    // The whole point: it must not have queried the wrong account's tags.
    expect(getDocsMock).not.toHaveBeenCalled();
  });

  it("queries the owning account's own tag collection when it still matches", async () => {
    await findTagByName("flow", "account-B");

    expect(collectionMock.mock.calls[0]?.[1]).toContain("account-B");
  });

  it("leaves an unscoped lookup alone", async () => {
    liveUid.value = "account-C";

    await expect(findTagByName("flow")).resolves.toBeNull();
    expect(getDocsMock).toHaveBeenCalledTimes(1);
  });
});

describe("createUserTag — its internal duplicate lookup carries the same owner", () => {
  it("refuses the whole operation when the owner went stale", async () => {
    liveUid.value = "account-C";

    await expect(
      createUserTag("flow", { color: "#fff" }, "account-B")
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(setDocMock).not.toHaveBeenCalled();
  });

  it("refuses when the switch lands inside the write's own await", async () => {
    firestoreGate = new Promise<void>((resolve) => {
      releaseFirestore = resolve;
    });

    const write = createUserTag("flow", { color: "#fff" }, "account-B");
    liveUid.value = "account-C";
    releaseFirestore!();

    await expect(write).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(setDocMock).not.toHaveBeenCalled();
  });

  it("writes into the owning account's tag collection when it still matches", async () => {
    await createUserTag("flow", { color: "#fff" }, "account-B");

    expect(setDocMock).toHaveBeenCalledTimes(1);
    expect(setDocMock.mock.calls[0]?.[0]).toMatchObject({
      path: expect.stringContaining("account-B"),
    });
  });

  it("scopes its duplicate check to that same account, not a fresh live read", async () => {
    // If the internal findTagByName were unscoped it would re-resolve live auth
    // and query whichever account is current. Every collection path this
    // operation touches must name the same owner.
    await createUserTag("flow", { color: "#fff" }, "account-B");

    for (const call of collectionMock.mock.calls) {
      expect(call[1]).toContain("account-B");
    }
  });
});
