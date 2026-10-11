import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "firebase/auth";

const h = vi.hoisted(() => ({
  doc: vi.fn((_firestore: unknown, ...segments: string[]) =>
    segments.join("/")
  ),
  getFirestoreInstance: vi.fn(async () => ({ name: "firestore" })),
  setDoc: vi.fn(async () => undefined),
  updateProfile: vi.fn(async () => undefined),
}));

vi.mock("firebase/auth", () => ({
  EmailAuthProvider: { credential: vi.fn() },
  reauthenticateWithCredential: vi.fn(),
  sendEmailVerification: vi.fn(),
  updateEmail: vi.fn(),
  updateProfile: h.updateProfile,
}));

vi.mock("firebase/firestore", () => ({
  doc: h.doc,
  getDoc: vi.fn(),
  setDoc: h.setDoc,
}));

vi.mock("#lib/shared/auth/firebase.js", () => ({
  getFirestoreInstance: h.getFirestoreInstance,
}));

vi.mock("#lib/shared/auth/services/username-validator.js", () => ({
  claimUsername: vi.fn(),
  releaseUsername: vi.fn(),
}));

import { updateDisplayName } from "#lib/shared/auth/services/profile-field-updater.js";

function authenticatedUser(): User {
  return {
    uid: "user-1",
    getIdToken: vi.fn(async () => "fresh-token"),
  } as unknown as User;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.setDoc.mockResolvedValue(undefined);
  h.updateProfile.mockResolvedValue(undefined);
});

describe("updateDisplayName", () => {
  it("updates Auth and the canonical public profile with one normalized value", async () => {
    const user = authenticatedUser();

    await expect(updateDisplayName(user, "  Krysten Ryan  ")).resolves.toEqual({
      success: true,
      message: "Display name updated successfully.",
    });

    expect(h.updateProfile).toHaveBeenCalledWith(user, {
      displayName: "Krysten Ryan",
    });
    expect(h.doc).toHaveBeenCalledWith(
      { name: "firestore" },
      "users",
      "user-1"
    );
    expect(h.setDoc).toHaveBeenCalledWith(
      "users/user-1",
      { displayName: "Krysten Ryan" },
      { merge: true }
    );
  });

  it("refreshes auth and retries a public-profile permission race", async () => {
    const user = authenticatedUser();
    const permissionDenied = Object.assign(
      new Error("Missing or insufficient permissions"),
      { code: "permission-denied" }
    );
    h.setDoc
      .mockRejectedValueOnce(permissionDenied)
      .mockResolvedValueOnce(undefined);

    await expect(updateDisplayName(user, "Ryan")).resolves.toMatchObject({
      success: true,
    });

    expect(user.getIdToken).toHaveBeenCalledWith(true);
    expect(h.updateProfile).toHaveBeenCalledTimes(1);
    expect(h.setDoc).toHaveBeenCalledTimes(2);
  });

  it("does not report success when the public profile remains unsynchronized", async () => {
    const user = authenticatedUser();
    const offline = new Error("offline");
    h.setDoc.mockRejectedValue(offline);

    await expect(updateDisplayName(user, "Ryan")).rejects.toBe(offline);

    expect(h.updateProfile).toHaveBeenCalledTimes(1);
    expect(h.setDoc).toHaveBeenCalledTimes(1);
  });
});
