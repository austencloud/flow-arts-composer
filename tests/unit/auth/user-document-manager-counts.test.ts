import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "firebase/auth";

const h = vi.hoisted(() => ({
  claimUsername: vi.fn(async () => undefined),
  captureWhenReady: vi.fn(),
  collection: vi.fn((_firestore: unknown, ...segments: string[]) =>
    segments.join("/")
  ),
  doc: vi.fn((_firestore: unknown, path: string) => path),
  generateAvatarUrl: vi.fn(() => "generated-avatar"),
  generateUniqueUsername: vi.fn(async () => "matty"),
  getCurrentPostHogSessionId: vi.fn(() => null),
  getCountFromServer: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  getFirestoreInstance: vi.fn(async () => ({ name: "firestore" })),
  getProviderIds: vi.fn(() => ({
    googleId: null,
    facebookId: null,
  })),
  getUsernameOwner: vi.fn(async () => "user-1"),
  serverTimestamp: vi.fn(() => ({ __serverTimestamp: true })),
  setDoc: vi.fn(async () => undefined),
  reportErrorTelemetry: vi.fn(async () => undefined),
  refreshPublicSequenceOwnerProfile: vi.fn(async () => ({
    scanned: 0,
    updated: 0,
    unchanged: 0,
    skipped: 0,
  })),
}));

vi.mock("firebase/firestore", () => ({
  collection: h.collection,
  doc: h.doc,
  getCountFromServer: h.getCountFromServer,
  getDoc: h.getDoc,
  getDocs: h.getDocs,
  serverTimestamp: h.serverTimestamp,
  setDoc: h.setDoc,
}));

vi.mock("#lib/shared/auth/firebase.js", () => ({
  getFirestoreInstance: h.getFirestoreInstance,
}));

vi.mock("#lib/shared/auth/services/profile-picture-manager.js", () => ({
  getProviderIds: h.getProviderIds,
}));

vi.mock("#lib/shared/auth/services/username-validator.js", () => ({
  claimUsername: h.claimUsername,
  generateUniqueUsername: h.generateUniqueUsername,
  getUsernameOwner: h.getUsernameOwner,
}));

vi.mock("#lib/shared/foundation/utils/avatar-generator.js", () => ({
  generateAvatarUrl: h.generateAvatarUrl,
}));

vi.mock("#lib/shared/analytics/services/posthog.js", () => ({
  captureWhenReady: h.captureWhenReady,
  getCurrentPostHogSessionId: h.getCurrentPostHogSessionId,
}));

vi.mock("#lib/shared/error/services/error-telemetry-reporter.js", () => ({
  reportErrorTelemetry: h.reportErrorTelemetry,
}));

vi.mock("#lib/shared/library/services/public-sequence-persister.js", () => ({
  refreshPublicSequenceOwnerProfile: h.refreshPublicSequenceOwnerProfile,
}));

import { UserDocumentManager } from "#lib/shared/auth/services/user-document-manager.js";

function fullUser(): User {
  return {
    uid: "user-1",
    isAnonymous: false,
    displayName: "matty mover",
    email: "matty@example.com",
    photoURL: null,
    providerData: [],
    getIdToken: vi.fn(async () => "fresh-token"),
  } as unknown as User;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.setDoc.mockResolvedValue(undefined);
  h.getDoc.mockResolvedValue({
    exists: () => false,
  });
  h.getCountFromServer.mockResolvedValue({
    data: () => ({ count: 7 }),
  });
  h.getDocs.mockResolvedValue({
    docs: [
      { data: () => ({ name: "Favorites", systemType: "favorites" }) },
      { data: () => ({ name: "Practice" }) },
      { data: () => ({ name: "Null system marker", systemType: null }) },
      { data: () => ({ name: "Showcase" }) },
    ],
  });
});

describe("UserDocumentManager parent reconstruction", () => {
  it("creates zeroed server-owned counters for the profile trigger to reconcile", async () => {
    const user = fullUser();

    await new UserDocumentManager().createOrUpdateUserDocument(user);

    expect(h.getCountFromServer).not.toHaveBeenCalled();
    expect(h.getDocs).not.toHaveBeenCalled();
    expect(h.setDoc).toHaveBeenCalledTimes(2);
    expect(h.setDoc.mock.calls[0][1]).toMatchObject({
      publicProfileVersion: 2,
      displayName: "Matty Mover",
      sequenceCount: 0,
      collectionCount: 0,
    });
    expect(h.claimUsername).toHaveBeenCalledWith("user-1", "matty");
    expect(h.captureWhenReady).toHaveBeenCalledWith(
      "profile_document_read_completed",
      expect.objectContaining({
        telemetry_schema_version: 2,
        telemetry_path_shape: "users/{id}",
      })
    );
  });

  it("reports an exact privacy-safe fingerprint when the profile read is denied", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const error = Object.assign(
      new Error("Missing or insufficient permissions"),
      {
        code: "permission-denied",
      }
    );
    h.getDoc.mockRejectedValue(error);

    await new UserDocumentManager().createOrUpdateUserDocument(fullUser());

    expect(h.getDoc).toHaveBeenCalledTimes(2);
    expect(h.reportErrorTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({
        error,
        context: {
          module: "firestore",
          action: "get",
          additionalData: { path: "users/user-1" },
        },
      })
    );
    expect(h.captureWhenReady).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("refreshes auth and retries a denied private-profile write", async () => {
    const user = fullUser();
    const error = Object.assign(
      new Error("Missing or insufficient permissions"),
      { code: "permission-denied" }
    );
    h.setDoc
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce(undefined);

    await new UserDocumentManager().createOrUpdateUserDocument(user);

    expect(h.setDoc).toHaveBeenCalledTimes(3);
    expect(user.getIdToken).toHaveBeenCalledWith(true);
    expect(h.reportErrorTelemetry).not.toHaveBeenCalled();
    expect(h.claimUsername).toHaveBeenCalledWith("user-1", "matty");
  });

  it("reports the exact private-profile step after its retry is denied", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const error = Object.assign(
      new Error("Missing or insufficient permissions"),
      { code: "permission-denied" }
    );
    h.setDoc
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(error)
      .mockRejectedValueOnce(error);

    await new UserDocumentManager().createOrUpdateUserDocument(fullUser());

    expect(h.reportErrorTelemetry).toHaveBeenCalledWith({
      message: "Could not update the signed-in user's private profile",
      error,
      context: {
        module: "firestore",
        action: "set-private-profile",
        additionalData: { path: "userPrivateProfiles/user-1" },
      },
    });
    expect(consoleError).toHaveBeenCalledWith(
      "[UserDocumentManager] Could not update the signed-in user's private profile:",
      error
    );
    expect(h.claimUsername).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("does not claim a full-account-only username for an anonymous guest", async () => {
    const user = {
      ...fullUser(),
      isAnonymous: true,
    } as User;

    await new UserDocumentManager().createOrUpdateUserDocument(user);

    // Local tests exercise the development guard, which skips anonymous
    // production-profile writes altogether.
    expect(h.setDoc).not.toHaveBeenCalled();
    expect(h.claimUsername).not.toHaveBeenCalled();
  });

  it("refreshes public sequence projections when sign-in rotates the avatar", async () => {
    const user = { ...fullUser(), photoURL: "new-avatar" } as User;
    h.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        displayName: "Matty Mover",
        photoURL: "old-avatar",
        username: "matty",
        usernameLowercase: "matty",
        sequenceCount: 1,
      }),
    });

    await new UserDocumentManager().createOrUpdateUserDocument(user);

    expect(h.refreshPublicSequenceOwnerProfile).toHaveBeenCalledWith(
      { name: "firestore" },
      "user-1",
      { displayName: "Matty Mover", avatarUrl: "new-avatar" }
    );
  });

  it("rechecks sequence owners after a prior projection fan-out could have failed", async () => {
    const user = { ...fullUser(), photoURL: "current-avatar" } as User;
    h.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        displayName: "Matty Mover",
        photoURL: "current-avatar",
        username: "matty",
        usernameLowercase: "matty",
        sequenceCount: 1,
      }),
    });

    await new UserDocumentManager().createOrUpdateUserDocument(user);

    expect(h.refreshPublicSequenceOwnerProfile).toHaveBeenCalledWith(
      { name: "firestore" },
      "user-1",
      { displayName: "Matty Mover", avatarUrl: "current-avatar" }
    );
  });

  it("refreshes public sequence projections after an explicit photo change", async () => {
    h.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ displayName: "Matty Mover", photoURL: "new-avatar" }),
    });
    const user = fullUser();

    await new UserDocumentManager().updatePhotoURL(user, "new-avatar");

    expect(h.refreshPublicSequenceOwnerProfile).toHaveBeenCalledWith(
      { name: "firestore" },
      "user-1",
      { displayName: "Matty Mover", avatarUrl: "new-avatar" }
    );
  });
});
