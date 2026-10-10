// Unit coverage for captureAnonymousDrafts (SP2 enabler + capture-source fix).
//
// The load-bearing SP2 fix: draft capture reads LOCAL Dexie
// (dexiePersistence.getAllSequences), not Firestore — SP1 made Dexie
// authoritative for guest saves, so a just-saved guest sequence may never have
// reached Firestore, and a Firestore-only capture would strand it on account
// conversion.
//
// The capture-source fix: Dexie is flat, not uid-keyed, and never cleared on
// sign-out, so "all local rows" is NOT "this guest's saves" on a shared device.
// Capture is scoped to the ids THIS uid recorded (saved-sequence-ledger), so a
// prior user's rows are never swept into a colliding account. An empty ledger
// captures nothing (safe).

import { beforeEach, describe, expect, it, vi } from "vitest";

const dexieRef = vi.hoisted(() => ({ getAllSequences: vi.fn() }));
vi.mock("#lib/shared/persistence/services/dexie-persistence-service.js", () => ({
  getAllSequences: dexieRef.getAllSequences,
  getSequence: vi.fn(),
  saveSequence: vi.fn(),
}));

const ledgerRef = vi.hoisted(() => ({ getSavedSequenceIds: vi.fn() }));
vi.mock("#lib/shared/library/services/saved-sequence-ledger.js", () => ({
  getSavedSequenceIds: ledgerRef.getSavedSequenceIds,
  recordSavedSequenceId: vi.fn(),
}));

// Keep the real firebase SDK + HMR-heavy firebase module out of the graph.
vi.mock("firebase/auth", () => ({
  EmailAuthProvider: class {
    static credential = vi.fn();
  },
  FacebookAuthProvider: class {
    static credentialFromError = vi.fn();
  },
  GoogleAuthProvider: class {
    static credential = vi.fn();
    static credentialFromError = vi.fn();
  },
  linkWithCredential: vi.fn(),
  linkWithPopup: vi.fn(),
  signInWithCredential: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signInWithEmailLink: vi.fn(),
}));

vi.mock("#lib/shared/auth/firebase.js", () => ({
  getAuthInstance: async () => ({ currentUser: null }),
}));

vi.mock("#lib/shared/library/get-library-repository.js", () => ({
  getLibraryRepository: vi.fn(),
}));
vi.mock("#lib/shared/gamification/get-prop-unlock-manager.js", () => ({
  getPropUnlockManager: vi.fn(),
}));

import { captureAnonymousDrafts } from "#lib/shared/auth/services/anonymous-upgrade.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("captureAnonymousDrafts", () => {
  it("returns only THIS uid's ledger-recorded rows, from local Dexie", async () => {
    // Dexie holds a prior user's row (other) plus this guest's saves (s1,s2);
    // the ledger says only s1,s2 are this uid's.
    ledgerRef.getSavedSequenceIds.mockReturnValueOnce(["s1", "s2"]);
    dexieRef.getAllSequences.mockResolvedValueOnce([
      { id: "other", word: "PRIOR" },
      { id: "s1", word: "ABC" },
      { id: "s2", word: "DEF" },
    ]);

    const drafts = await captureAnonymousDrafts("anon-uid");

    expect(ledgerRef.getSavedSequenceIds).toHaveBeenCalledWith("anon-uid");
    expect(drafts.map((d) => d.id).sort()).toEqual(["s1", "s2"]);
    // The prior user's row is NOT captured — no cross-account bleed.
    expect(drafts.some((d) => d.id === "other")).toBe(false);
  });

  it("captures a Dexie-only (un-synced) just-saved sequence in the ledger", async () => {
    ledgerRef.getSavedSequenceIds.mockReturnValueOnce(["fresh"]);
    dexieRef.getAllSequences.mockResolvedValueOnce([{ id: "fresh", word: "X" }]);

    const drafts = await captureAnonymousDrafts("anon-uid");

    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ id: "fresh" });
  });

  it("captures NOTHING when the ledger is empty, even if Dexie has rows", async () => {
    ledgerRef.getSavedSequenceIds.mockReturnValueOnce([]);

    const drafts = await captureAnonymousDrafts("anon-uid");

    // Short-circuits before touching Dexie — a prior user's rows can't leak.
    expect(drafts).toEqual([]);
    expect(dexieRef.getAllSequences).not.toHaveBeenCalled();
  });

  it("degrades to an empty array when the Dexie read throws", async () => {
    ledgerRef.getSavedSequenceIds.mockReturnValueOnce(["s1"]);
    dexieRef.getAllSequences.mockRejectedValueOnce(new Error("db closed"));

    const drafts = await captureAnonymousDrafts("anon-uid");

    expect(drafts).toEqual([]);
  });
});
