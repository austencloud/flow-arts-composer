import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const batch = {
    set: vi.fn(),
    delete: vi.fn(),
    commit: vi.fn().mockResolvedValue(undefined),
  };

  return {
    auth: { currentUser: { uid: "user-1" } as { uid: string } | null },
    firestore: { name: "firestore" },
    batch,
    doc: vi.fn((_firestore: unknown, path: string) => ({ path })),
    setDoc: vi.fn().mockResolvedValue(undefined),
    updateDoc: vi.fn().mockResolvedValue(undefined),
    serverTimestamp: vi.fn(() => ({ kind: "server-timestamp" })),
    writeBatch: vi.fn(() => batch),
  };
});

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  doc: mocks.doc,
  getDoc: vi.fn(),
  setDoc: mocks.setDoc,
  updateDoc: mocks.updateDoc,
  query: vi.fn(),
  where: vi.fn(),
  getDocs: vi.fn(),
  serverTimestamp: mocks.serverTimestamp,
  writeBatch: mocks.writeBatch,
}));

vi.mock("#lib/shared/auth/firebase.js", () => ({
  getFirestoreInstance: vi.fn(async () => mocks.firestore),
  getAuthSync: vi.fn(() => mocks.auth),
}));

import { SessionManager } from "../session-manager.svelte";

describe("SessionManager", () => {
  beforeEach(() => {
    mocks.auth.currentUser = { uid: "user-1" };
    mocks.doc.mockClear();
    mocks.setDoc.mockReset().mockResolvedValue(undefined);
    mocks.updateDoc.mockReset().mockResolvedValue(undefined);
    mocks.serverTimestamp.mockClear();
    mocks.writeBatch.mockClear();
    mocks.batch.set.mockClear();
    mocks.batch.delete.mockClear();
    mocks.batch.commit.mockReset().mockResolvedValue(undefined);
  });

  it("does not create an empty Firestore session at construction", () => {
    const manager = new SessionManager("shared-session", "device-1");

    expect(manager.getSessionId()).toBe("shared-session");
    expect(manager.getCurrentSession()).toBeNull();
    expect(mocks.setDoc).not.toHaveBeenCalled();
  });

  it("creates the first session record from a meaningful autosave", async () => {
    const manager = new SessionManager("shared-session", "device-1");

    await manager.recordAutosave(4, "Matty");

    expect(mocks.doc).toHaveBeenCalledWith(
      mocks.firestore,
      "users/user-1/sessions/shared-session"
    );
    expect(mocks.setDoc).toHaveBeenCalledWith(
      { path: "users/user-1/sessions/shared-session" },
      expect.objectContaining({
        sessionId: "shared-session",
        deviceId: "device-1",
        stepCount: 4,
        name: "Matty",
        isSaved: false,
        sequenceId: null,
        status: "active",
      }),
      { merge: true }
    );
  });

  it("atomically completes a session and deletes its matching cloud draft", async () => {
    const manager = new SessionManager("shared-session", "device-1");

    await manager.markAsSaved("sequence-1");

    expect(mocks.batch.set).toHaveBeenCalledWith(
      { path: "users/user-1/sessions/shared-session" },
      expect.objectContaining({
        sessionId: "shared-session",
        isSaved: true,
        sequenceId: "sequence-1",
        status: "completed",
      }),
      { merge: true }
    );
    expect(mocks.batch.delete).toHaveBeenCalledWith({
      path: "users/user-1/drafts/shared-session",
    });
    expect(mocks.batch.commit).toHaveBeenCalledOnce();
  });

  it("preserves the original creation time when completing an existing session", async () => {
    const manager = new SessionManager("shared-session", "device-1");
    await manager.recordAutosave(3);

    await manager.markAsSaved("sequence-1");

    const completionPayload = mocks.batch.set.mock.calls[0]?.[1];
    expect(completionPayload).not.toHaveProperty("createdAt");
  });

  it("serializes autosave and completion so the final state stays completed", async () => {
    let finishAutosave!: () => void;
    mocks.setDoc.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishAutosave = resolve;
        })
    );
    const manager = new SessionManager("shared-session", "device-1");

    const autosave = manager.recordAutosave(8);
    const completion = manager.markAsSaved("sequence-1");
    await vi.waitFor(() => {
      expect(finishAutosave).toBeTypeOf("function");
    });

    expect(mocks.writeBatch).not.toHaveBeenCalled();
    finishAutosave();
    await Promise.all([autosave, completion]);

    expect(manager.getCurrentSession()).toEqual(
      expect.objectContaining({
        status: "completed",
        sequenceId: "sequence-1",
      })
    );
  });

  it("does not turn a completed session into abandoned during teardown", async () => {
    const manager = new SessionManager("shared-session", "device-1");
    await manager.markAsSaved("sequence-1");

    await manager.abandonSession();

    expect(mocks.updateDoc).not.toHaveBeenCalled();
    expect(manager.getCurrentSession()).toBeNull();
  });

  it("reactivates the same session when a later edit produces a new draft", async () => {
    const manager = new SessionManager("shared-session", "device-1");
    await manager.markAsSaved("sequence-1");

    await manager.recordAutosave(9, "Edited");

    expect(manager.getCurrentSession()).toEqual(
      expect.objectContaining({
        isSaved: false,
        sequenceId: null,
        status: "active",
        stepCount: 9,
      })
    );
  });
});
