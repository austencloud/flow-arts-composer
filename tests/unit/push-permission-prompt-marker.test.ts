// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const firestore = vi.hoisted(() => ({
  database: {},
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  doc: vi.fn((_database: unknown, path: string) => ({ path })),
}));

vi.mock("#lib/shared/auth/firebase.js", () => ({
  getFirestoreInstance: vi.fn(async () => firestore.database),
}));

vi.mock("firebase/firestore", () => ({
  doc: firestore.doc,
  getDoc: firestore.getDoc,
  setDoc: firestore.setDoc,
}));

import { claimPushPermissionPrompt } from "#lib/shared/push/services/push-permission-prompt-marker.js";

const USER_ID = "user-1";
const LOCAL_MARKER = `tka-push-permission-prompt-seen:${USER_ID}`;
const CLOUD_MARKER = `users/${USER_ID}/settings/pushPermissionPrompt`;

function localMarker(): string | null {
  const stored = localStorage.getItem(LOCAL_MARKER);
  return stored ? JSON.parse(stored) : null;
}

describe("push permission prompt marker", () => {
  beforeEach(() => {
    localStorage.clear();
    firestore.doc.mockClear();
    firestore.getDoc.mockReset();
    firestore.setDoc.mockReset();
    firestore.setDoc.mockResolvedValue(undefined);
  });

  it("claims and persists the first prompt for an account", async () => {
    firestore.getDoc.mockResolvedValue({
      exists: () => false,
    });

    await expect(claimPushPermissionPrompt(USER_ID)).resolves.toBe(true);
    await expect(claimPushPermissionPrompt(USER_ID)).resolves.toBe(false);

    expect(firestore.doc).toHaveBeenCalledWith(
      firestore.database,
      CLOUD_MARKER
    );
    expect(firestore.setDoc).toHaveBeenCalledWith(
      { path: CLOUD_MARKER },
      { seen: true },
      { merge: true }
    );
    expect(firestore.getDoc).toHaveBeenCalledOnce();
    expect(firestore.setDoc).toHaveBeenCalledOnce();
    expect(localMarker()).toBe("cloud");
  });

  it("hydrates a seen marker from the account and suppresses the prompt", async () => {
    firestore.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ seen: true }),
    });

    await expect(claimPushPermissionPrompt(USER_ID)).resolves.toBe(false);

    expect(firestore.setDoc).not.toHaveBeenCalled();
    expect(localMarker()).toBe("cloud");
  });

  it("migrates the legacy browser dismissal without showing again", async () => {
    localStorage.setItem("tka-push-prompt-dismissed", String(Date.now() - 1));

    await expect(claimPushPermissionPrompt(USER_ID)).resolves.toBe(false);

    expect(firestore.getDoc).not.toHaveBeenCalled();
    expect(firestore.setDoc).toHaveBeenCalledWith(
      { path: CLOUD_MARKER },
      { seen: true },
      { merge: true }
    );
    expect(localMarker()).toBe("cloud");
  });

  it("retries a failed cloud write later without re-showing the prompt", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    firestore.getDoc.mockResolvedValue({
      exists: () => false,
    });
    firestore.setDoc.mockRejectedValueOnce(new Error("offline"));

    await expect(claimPushPermissionPrompt(USER_ID)).resolves.toBe(false);
    expect(localMarker()).toBe("pending");

    firestore.setDoc.mockResolvedValueOnce(undefined);
    await expect(claimPushPermissionPrompt(USER_ID)).resolves.toBe(false);

    expect(firestore.getDoc).toHaveBeenCalledOnce();
    expect(firestore.setDoc).toHaveBeenCalledTimes(2);
    expect(localMarker()).toBe("cloud");
    warn.mockRestore();
  });
});
