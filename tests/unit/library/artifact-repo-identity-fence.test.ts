/**
 * The four artifact writes a save fans out to are fenced at their own await
 * boundary.
 *
 * `HandPathRepository.save` and `SoloPropRepository.save` both do
 * `await getFirestoreInstance()` and only THEN `requireAuth()` — and that uid
 * is the collection PATH (`users/{uid}/handPaths`, `users/{uid}/soloProps`),
 * not just a stamped field. So a save's artifacts could land in a different
 * account's subtree while still carrying the original `ownerId`: a mismatched
 * cross-account write.
 *
 * These drive the REAL repository methods with a deferred Firestore resolution
 * so the account switch lands inside that exact window.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const liveUid = { value: "account-B" as string | null };
let releaseFirestore: (() => void) | null = null;
let firestoreGate: Promise<void> | null = null;
const setDocMock = vi.fn().mockResolvedValue(undefined);

vi.mock("$lib/shared/auth/firebase", () => ({
  getFirestoreInstance: async () => {
    if (firestoreGate) await firestoreGate;
    return {} as any;
  },
}));
// The REAL requireAuth() is used — it simply reads authState — so the uid the
// repository resolves after its await is the one this mock reports.
vi.mock("$lib/shared/auth/state/auth-state.svelte", () => ({
  authState: {
    get effectiveUserId() {
      return liveUid.value;
    },
  },
}));
vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, path: string) => ({ path }),
  getDoc: vi.fn().mockResolvedValue({ exists: () => false, data: () => ({}) }),
  setDoc: (...a: unknown[]) => setDocMock(...a),
  arrayUnion: (...ids: unknown[]) => ids,
}));

const { HandPathRepository } =
  await import("$lib/shared/foundation/services/hand-path-repository-store");
const { SoloPropRepository } =
  await import("$lib/shared/foundation/services/solo-prop-repository-store");

const provenance = {
  sourceSequenceIds: ["seq-1"],
  isOriginal: false,
  firstSeenAt: new Date(),
} as any;
const handPath = {
  id: "hp-1",
  ownerId: "account-B",
  locations: [],
  contentHash: "h1",
  bigrams: [],
  uniqueLocations: [],
} as any;
const soloProp = {
  id: "sp-1",
  ownerId: "account-B",
  contentHash: "s1",
  orientations: [],
  handPath,
} as any;

beforeEach(() => {
  vi.clearAllMocks();
  liveUid.value = "account-B";
  firestoreGate = null;
  releaseFirestore = null;
  setDocMock.mockResolvedValue(undefined);
});

describe("HandPathRepository.save — identity fence", () => {
  it("refuses a write whose expected owner is no longer signed in", async () => {
    liveUid.value = "account-C";

    await expect(
      new HandPathRepository().save(handPath, provenance, "account-B")
    ).rejects.toThrow(/account changed/i);
    expect(setDocMock).not.toHaveBeenCalled();
  });

  it("refuses when the switch lands INSIDE the Firestore-resolution await", async () => {
    firestoreGate = new Promise<void>((resolve) => {
      releaseFirestore = resolve;
    });

    const write = new HandPathRepository().save(
      handPath,
      provenance,
      "account-B"
    );
    liveUid.value = "account-C";
    releaseFirestore!();

    await expect(write).rejects.toThrow(/account changed/i);
    expect(setDocMock).not.toHaveBeenCalled();
  });

  it("writes into the owning account's own subtree when it still matches", async () => {
    await new HandPathRepository().save(handPath, provenance, "account-B");

    expect(setDocMock).toHaveBeenCalledTimes(1);
    expect(setDocMock.mock.calls[0]?.[0]).toMatchObject({
      path: "users/account-B/handPaths/hp-1",
    });
  });

  it("leaves an unfenced write alone", async () => {
    liveUid.value = "account-C";

    await new HandPathRepository().save(handPath, provenance);

    expect(setDocMock).toHaveBeenCalledTimes(1);
  });
});

describe("SoloPropRepository.save — identity fence", () => {
  it("refuses a write whose expected owner is no longer signed in", async () => {
    liveUid.value = "account-C";

    await expect(
      new SoloPropRepository().save(soloProp, provenance, "account-B")
    ).rejects.toThrow(/account changed/i);
    expect(setDocMock).not.toHaveBeenCalled();
  });

  it("refuses when the switch lands INSIDE the Firestore-resolution await", async () => {
    firestoreGate = new Promise<void>((resolve) => {
      releaseFirestore = resolve;
    });

    const write = new SoloPropRepository().save(
      soloProp,
      provenance,
      "account-B"
    );
    liveUid.value = "account-C";
    releaseFirestore!();

    await expect(write).rejects.toThrow(/account changed/i);
    expect(setDocMock).not.toHaveBeenCalled();
  });

  it("writes into the owning account's own subtree when it still matches", async () => {
    await new SoloPropRepository().save(soloProp, provenance, "account-B");

    expect(setDocMock.mock.calls[0]?.[0]).toMatchObject({
      path: "users/account-B/soloProps/sp-1",
    });
  });
});
