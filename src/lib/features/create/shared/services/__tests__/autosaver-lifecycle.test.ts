import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

const mocks = vi.hoisted(() => {
  const draftRows: Array<{
    id?: number;
    data?: { sessionId?: string };
  }> = [];
  const collection = {
    delete: vi.fn().mockResolvedValue(undefined),
    toArray: vi.fn(async () => draftRows),
    sortBy: vi.fn(async () => draftRows),
  };
  const equals = vi.fn(() => collection);
  const where = vi.fn(() => ({ equals }));

  return {
    auth: { currentUser: null as { uid: string } | null },
    firestore: { name: "firestore" },
    draftRows,
    collection,
    equals,
    where,
    add: vi.fn().mockResolvedValue(1),
    bulkDelete: vi.fn().mockResolvedValue(undefined),
    getFirestoreInstance: vi.fn(),
    setDoc: vi.fn().mockResolvedValue(undefined),
    trackWrite: vi.fn((operation: () => Promise<unknown>) => operation()),
  };
});

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  setDoc: mocks.setDoc,
  deleteDoc: vi.fn(),
  deleteField: vi.fn(() => "__deleteField__"),
  getDocs: vi.fn(),
  serverTimestamp: vi.fn(),
}));

vi.mock("#lib/shared/auth/firebase.js", () => ({
  getFirestoreInstance: mocks.getFirestoreInstance,
  getAuthSync: vi.fn(() => mocks.auth),
}));

vi.mock("#lib/shared/offline/state/sync-status-state.svelte.js", () => ({
  trackWrite: mocks.trackWrite,
}));

vi.mock("#lib/shared/persistence/database/tka-database.js", () => ({
  db: {
    userWork: {
      where: mocks.where,
      add: mocks.add,
      bulkDelete: mocks.bulkDelete,
    },
  },
}));

import { Autosaver } from "../autosaver";

function sequenceWithSteps(count: number): SequenceData {
  return {
    id: "sequence-1",
    name: "Matty",
    steps: Array.from({ length: count }, (_, index) => ({
      id: `step-${index}`,
    })),
  } as unknown as SequenceData;
}

describe("Autosaver lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.auth.currentUser = null;
    mocks.draftRows.length = 0;
    mocks.collection.delete.mockReset().mockResolvedValue(undefined);
    mocks.collection.toArray.mockClear();
    mocks.add.mockReset().mockResolvedValue(1);
    mocks.bulkDelete.mockReset().mockResolvedValue(undefined);
    mocks.getFirestoreInstance.mockReset().mockResolvedValue(mocks.firestore);
    mocks.setDoc.mockReset().mockResolvedValue(undefined);
    mocks.trackWrite
      .mockReset()
      .mockImplementation((operation: () => Promise<unknown>) => operation());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("persists and reports the same shared session ID", async () => {
    const autosaver = new Autosaver();
    const onDraftSaved = vi.fn();
    const sequence = sequenceWithSteps(3);

    autosaver.startAutosave(
      () => sequence,
      "shared-session",
      30_000,
      onDraftSaved
    );
    autosaver.markDirty();
    await vi.advanceTimersByTimeAsync(30_000);

    expect(autosaver.getSessionId()).toBe("shared-session");
    expect(mocks.add).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sessionId: "shared-session" }),
      })
    );
    expect(onDraftSaved).toHaveBeenCalledWith(sequence);
  });

  it("resumes the local draft session after an ordinary reload", async () => {
    mocks.draftRows.push({
      id: 1,
      data: { sessionId: "recovered-session" },
    });
    const autosaver = new Autosaver();

    await expect(
      autosaver.resolveSessionForStart(true, () => "new-session")
    ).resolves.toEqual({
      sessionId: "recovered-session",
      recovered: true,
    });
  });

  it("starts a distinct session for explicitly loaded work", async () => {
    mocks.draftRows.push({
      id: 1,
      data: { sessionId: "unrelated-local-draft" },
    });
    const autosaver = new Autosaver();

    await expect(
      autosaver.resolveSessionForStart(false, () => "new-session")
    ).resolves.toEqual({
      sessionId: "new-session",
      recovered: false,
    });
  });

  it("does not create a session record for an empty sequence", async () => {
    const autosaver = new Autosaver();
    const onDraftSaved = vi.fn();

    autosaver.startAutosave(
      () => sequenceWithSteps(0),
      "shared-session",
      30_000,
      onDraftSaved
    );
    autosaver.markDirty();
    await vi.advanceTimersByTimeAsync(30_000);

    expect(mocks.add).not.toHaveBeenCalled();
    expect(onDraftSaved).not.toHaveBeenCalled();
  });

  it("deletes only the local draft owned by the completed session", async () => {
    mocks.draftRows.push(
      { id: 1, data: { sessionId: "shared-session" } },
      { id: 2, data: { sessionId: "another-session" } }
    );
    const autosaver = new Autosaver();

    await autosaver.deleteLocalDraft("shared-session");

    expect(mocks.bulkDelete).toHaveBeenCalledWith([1]);
  });

  it("waits for an in-flight save before deleting the completed draft", async () => {
    let finishWrite!: () => void;
    mocks.add.mockImplementationOnce(
      () =>
        new Promise<number>((resolve) => {
          finishWrite = () => resolve(1);
        })
    );
    mocks.draftRows.push({ id: 1, data: { sessionId: "shared-session" } });
    const autosaver = new Autosaver();
    const save = autosaver.saveDraft("shared-session", sequenceWithSteps(2));
    await Promise.resolve();

    const cleanup = autosaver.deleteLocalDraft("shared-session");
    await Promise.resolve();
    expect(mocks.bulkDelete).not.toHaveBeenCalled();

    finishWrite();
    await Promise.all([save, cleanup]);

    expect(mocks.bulkDelete).toHaveBeenCalledWith([1]);
  });

  it("drains the pending cloud write before deleting the completed draft", async () => {
    let finishCloudWrite!: () => void;
    mocks.auth.currentUser = { uid: "user-1" };
    mocks.setDoc.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishCloudWrite = resolve;
        })
    );
    mocks.draftRows.push({ id: 1, data: { sessionId: "shared-session" } });
    const autosaver = new Autosaver();

    await autosaver.saveDraft("shared-session", sequenceWithSteps(2));
    await vi.waitFor(() => {
      expect(finishCloudWrite).toBeTypeOf("function");
    });

    const cleanup = autosaver.deleteLocalDraft("shared-session");
    await Promise.resolve();
    expect(mocks.bulkDelete).not.toHaveBeenCalled();

    finishCloudWrite();
    await cleanup;

    expect(mocks.bulkDelete).toHaveBeenCalledWith([1]);
  });

  it("attributes a failed cloud backup and keeps completion usable", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.auth.currentUser = { uid: "user-1" };
    mocks.getFirestoreInstance.mockRejectedValueOnce(
      new Error("firestore unavailable")
    );
    mocks.draftRows.push({ id: 1, data: { sessionId: "shared-session" } });
    const autosaver = new Autosaver();

    await autosaver.saveDraft("shared-session", sequenceWithSteps(2));
    await autosaver.deleteLocalDraft("shared-session");

    expect(warning).toHaveBeenCalledWith(
      "[Autosaver] Firestore draft sync failed:",
      expect.any(Error)
    );
    expect(mocks.bulkDelete).toHaveBeenCalledWith([1]);
    warning.mockRestore();
  });
});
