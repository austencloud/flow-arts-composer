import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "firebase/auth";

const h = vi.hoisted(() => {
  const order: string[] = [];
  return {
    order,
    reportLifecycle: vi.fn(async ({ event }: { event: string }) => {
      order.push(`event:${event}`);
    }),
    createOrUpdateUserDocument: vi.fn(async () => {
      order.push("profile");
    }),
    getAuthInstance: vi.fn(async () => {
      throw new Error("linked User should be authoritative");
    }),
    getIdToken: vi.fn(async () => {
      order.push("token");
      return "fresh-token";
    }),
    mergeGuestCollection: vi.fn(async () => undefined),
    toastSuccess: vi.fn(),
    refreshUser: vi.fn(async () => {
      order.push("refresh");
    }),
  };
});

vi.mock("firebase/auth", () => ({
  EmailAuthProvider: class {},
  FacebookAuthProvider: class {},
  GoogleAuthProvider: class {},
  linkWithCredential: vi.fn(),
  linkWithPopup: vi.fn(),
  signInWithCredential: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signInWithEmailLink: vi.fn(),
}));

vi.mock("#lib/shared/auth/firebase.js", () => ({
  getAuthInstance: h.getAuthInstance,
}));

vi.mock("#lib/shared/auth/services/pending-credential-link.js", () => ({
  stashPendingLink: vi.fn(),
}));

vi.mock("#lib/shared/auth/services/last-auth-method.svelte.js", () => ({
  recordLastAuthMethod: vi.fn(),
}));

vi.mock("#lib/shared/gamification/get-prop-unlock-manager.js", () => ({
  getPropUnlockManager: () => ({
    mergeGuestCollection: h.mergeGuestCollection,
  }),
}));

vi.mock("#lib/shared/library/get-library-repository.js", () => ({
  getLibraryRepository: vi.fn(),
}));

vi.mock("#lib/shared/toast/state/toast-state.svelte.js", () => ({
  toast: { success: h.toastSuccess },
}));

vi.mock("#lib/shared/analytics/services/posthog-lifecycle-reporter.js", () => ({
  reportPostHogLifecycleEvent: h.reportLifecycle,
}));

vi.mock(
  "#lib/shared/persistence/services/dexie-persistence-service.js",
  () => ({
    getAllSequences: vi.fn(async () => []),
  })
);

vi.mock("#lib/shared/library/services/saved-sequence-ledger.js", () => ({
  getSavedSequenceIds: vi.fn(() => []),
}));

vi.mock("#lib/shared/auth/get-user-document-manager.js", () => ({
  getUserDocumentManager: () => ({
    createOrUpdateUserDocument: h.createOrUpdateUserDocument,
  }),
}));

vi.mock("#lib/shared/auth/state/auth-state.svelte.js", () => ({
  refreshUser: h.refreshUser,
}));

import { notifyUpgradeSignup } from "#lib/shared/auth/services/anonymous-upgrade.js";

beforeEach(() => {
  vi.clearAllMocks();
  h.order.length = 0;
});

describe("notifyUpgradeSignup", () => {
  it("finalizes the exact linked user before profile persistence and conversion capture", async () => {
    const linkedUser = {
      uid: "guest-upgraded-in-place",
      isAnonymous: false,
      getIdToken: h.getIdToken,
    } as unknown as User;

    await notifyUpgradeSignup(linkedUser);

    expect(h.getAuthInstance).not.toHaveBeenCalled();
    expect(h.getIdToken).toHaveBeenCalledWith(true);
    expect(h.createOrUpdateUserDocument).toHaveBeenCalledWith(linkedUser);
    expect(h.reportLifecycle).toHaveBeenCalledWith({
      event: "guest_upgraded_to_account",
      properties: {
        status: "linked",
      },
    });
    expect(h.order).toEqual([
      "token",
      "refresh",
      "profile",
      "event:guest_upgraded_to_account",
    ]);
  });

  // Regression (2026-07-29): an in-place link keeps the same uid, so
  // onAuthStateChanged never fires and nothing reassigns authState's user.
  // isFullAccount stayed false, MainApplication's {#if isGuest} kept the
  // sign-in modal mounted, and users retried a Google sign-in that had already
  // succeeded. The client-state refresh is what closes that sheet.
  it("refreshes client auth state so the upgraded user stops reading as a guest", async () => {
    const linkedUser = {
      uid: "guest-upgraded-in-place",
      isAnonymous: false,
      getIdToken: h.getIdToken,
    } as unknown as User;

    await notifyUpgradeSignup(linkedUser);

    expect(h.refreshUser).toHaveBeenCalledTimes(1);
  });

  it("still refreshes client auth state when the user-doc write fails", async () => {
    h.createOrUpdateUserDocument.mockRejectedValueOnce(
      new Error("permission-denied")
    );
    const linkedUser = {
      uid: "guest-upgraded-in-place",
      isAnonymous: false,
      getIdToken: h.getIdToken,
    } as unknown as User;

    await notifyUpgradeSignup(linkedUser);

    // The refresh runs before the doc write and has its own catch, so a denied
    // write can never leave the UI stranded on the sign-in sheet.
    expect(h.refreshUser).toHaveBeenCalledTimes(1);
  });

  it("does not refresh for a still-anonymous user (no upgrade happened)", async () => {
    const stillGuest = {
      uid: "guest",
      isAnonymous: true,
      getIdToken: h.getIdToken,
    } as unknown as User;

    await notifyUpgradeSignup(stillGuest);

    expect(h.refreshUser).not.toHaveBeenCalled();
  });
});
