import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Deleting a batch uses one transaction PER sequence — owner doc, public
 * mirror and hash claims move together, so a mid-batch failure can never
 * strand a public document whose owner is gone.
 *
 * Profile counts are server-owned projections maintained by Firestore triggers.
 * This file guards that clients never mutate those counters while preserving
 * per-sequence deletion reporting.
 */
const firestoreMocks = vi.hoisted(() => ({
  getDocs: vi.fn(),
  updateDoc: vi.fn(async () => undefined),
  deleteSequenceCompletely: vi.fn(),
  notifyLibraryMutated: vi.fn(),
  toastWarning: vi.fn(),
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn((_db: unknown, path: string) => ({ path })),
  doc: vi.fn((_db: unknown, path: string) => ({ path })),
  getDocs: firestoreMocks.getDocs,
  query: vi.fn((value: unknown) => value),
  where: vi.fn(),
  writeBatch: vi.fn(),
  updateDoc: firestoreMocks.updateDoc,
  serverTimestamp: vi.fn(() => "server-timestamp"),
  increment: vi.fn((value: number) => ({ incrementBy: value })),
  arrayUnion: vi.fn(),
  documentId: vi.fn(() => "document-id"),
}));

vi.mock("#lib/shared/library/services/public-sequence-persister.js", () => ({
  deleteSequenceCompletely: firestoreMocks.deleteSequenceCompletely,
}));
vi.mock("#lib/shared/toast/state/toast-state.svelte.js", () => ({
  toast: { error: vi.fn(), warning: firestoreMocks.toastWarning },
}));
vi.mock("#lib/shared/offline/state/sync-status-state.svelte.js", () => ({
  trackWrite: (operation: () => Promise<unknown>) => operation(),
}));
vi.mock("#lib/shared/foundation/services/sequence-hydrator.js", () => ({
  ensureComposition: (sequence: unknown) => sequence,
}));
vi.mock("#lib/shared/library/library-events.js", () => ({
  notifyLibraryMutated: firestoreMocks.notifyLibraryMutated,
}));

import { LibraryBatchOperations } from "#lib/shared/library/services/library-batch-operations.js";

function makeOperations() {
  const reportError = vi.fn();
  const operations = new LibraryBatchOperations(
    async () => ({}) as never,
    () => "user-1",
    (data, id) => ({ ...data, id }) as never,
    {
      syncToPublicIndex: vi.fn(),
      updateThumbnails: vi.fn(),
      removeFromPublicIndex: vi.fn(),
    },
    reportError
  );
  return { operations, reportError };
}

describe("LibraryBatchOperations server-owned delete counts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    firestoreMocks.updateDoc.mockResolvedValue(undefined);
    firestoreMocks.deleteSequenceCompletely.mockImplementation(
      async (_firestore, _userId, sequenceId) => ({
        ownerDeleted: sequenceId !== "already-missing",
      })
    );
  });

  it("checks every requested id so an owner-missing public orphan can still be removed", async () => {
    const results = await makeOperations().operations.deleteSequences([
      "private-1",
      "public-1",
      "already-missing",
    ]);

    expect(
      firestoreMocks.deleteSequenceCompletely.mock.calls.map((call) => call[2])
    ).toEqual(["private-1", "public-1", "already-missing"]);
    expect(results).toEqual([
      {
        sequenceId: "private-1",
        status: "ok",
        deletion: { ownerDeleted: true },
      },
      {
        sequenceId: "public-1",
        status: "ok",
        deletion: { ownerDeleted: true },
      },
      {
        sequenceId: "already-missing",
        status: "ok",
        deletion: { ownerDeleted: false },
      },
    ]);
  });

  it("does not mutate the profile count from the client", async () => {
    await makeOperations().operations.deleteSequences([
      "private-1",
      "public-1",
      "already-missing",
    ]);

    expect(firestoreMocks.updateDoc).not.toHaveBeenCalled();
  });

  it("leaves counts server-owned regardless of whether owner documents existed", async () => {
    firestoreMocks.deleteSequenceCompletely
      .mockResolvedValueOnce({ ownerDeleted: true })
      .mockResolvedValueOnce({ ownerDeleted: false });

    await makeOperations().operations.deleteSequences([
      "private-1",
      "public-1",
    ]);

    expect(firestoreMocks.updateDoc).not.toHaveBeenCalled();
  });

  it("has no client counter write that can mask committed deletes", async () => {
    firestoreMocks.updateDoc.mockRejectedValue(new Error("counter offline"));
    const { operations, reportError } = makeOperations();

    const results = await operations.deleteSequences(["private-1", "public-1"]);

    expect(results.every((result) => result.status === "ok")).toBe(true);
    expect(firestoreMocks.updateDoc).not.toHaveBeenCalled();
    expect(reportError).not.toHaveBeenCalled();
  });

  it("reports a failed sequence instead of silently dropping it", async () => {
    firestoreMocks.deleteSequenceCompletely
      .mockResolvedValueOnce({ ownerDeleted: true })
      .mockRejectedValueOnce(new Error("transaction aborted"));

    await expect(
      makeOperations().operations.deleteSequences(["private-1", "public-1"])
    ).rejects.toThrow("Failed to delete sequences");

    expect(firestoreMocks.updateDoc).not.toHaveBeenCalled();
  });
});
