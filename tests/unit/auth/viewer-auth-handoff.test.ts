// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PendingActionQueue } from "#lib/shared/sequence-viewer/services/pending-action-queue.js";

const auth = vi.hoisted(() => ({
  isAuthenticated: false,
  isAnonymous: false,
  isFullAccount: false,
}));
vi.mock("$app/env", () => ({ browser: true }));
vi.mock("#lib/shared/auth/state/auth-state.svelte.js", () => ({
  authState: auth,
  learnWhoIsSignedIn: vi.fn(),
}));
vi.mock("#lib/shared/auth/state/auth-drawer-state.svelte.js", () => ({
  authDrawerState: { show: vi.fn() },
}));
vi.mock("#lib/shared/auth/services/guest-identity.js", () => ({
  ensureGuestIdentity: vi.fn(),
}));
vi.mock("#lib/shared/navigation/services/url-state.js", () => ({
  removeCurrentUrlParams: vi.fn(),
  mutateCurrentUrl: vi.fn(),
}));
const pending = new PendingActionQueue();
vi.mock("#lib/shared/sequence-viewer/get-pending-action-queue.js", () => ({
  getPendingActionQueue: () => pending,
}));
import { createAuthActionQueue } from "#lib/shared/sequence-viewer/components/auth-action-queue.svelte.js";
import { ensureGuestIdentity } from "#lib/shared/auth/services/guest-identity.js";
import { learnWhoIsSignedIn } from "#lib/shared/auth/state/auth-state.svelte.js";
import { authDrawerState } from "#lib/shared/auth/state/auth-drawer-state.svelte.js";
import { ensureFullAccountForExport } from "#lib/shared/auth/domain/export-gate.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

const callbacks = {
  handleSave: vi.fn(),
  handleFavoriteToggle: vi.fn(),
  handlePublishAction: vi.fn(async () => {}),
  handleEdit: vi.fn(),
  handleShare: vi.fn(),
  handleDownload: vi.fn(),
  handleOpenInBrowser: vi.fn(),
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(learnWhoIsSignedIn).mockImplementation(async () => {});
  vi.mocked(ensureGuestIdentity).mockImplementation(async () => {});
  pending.clear();
  Object.assign(auth, {
    isAuthenticated: false,
    isAnonymous: false,
    isFullAccount: false,
  });
});

describe("viewer account handoff", () => {
  it.each(["save", "favorite", "remix", "sendTo"])(
    "resumes guest %s links without a sign-in prompt",
    (type) => {
      history.replaceState(null, "", `/q/example?pending=${type}`);
      const queue = createAuthActionQueue();
      expect(queue.bootstrapFromUrl()).toBe(type);
      expect(queue.signInSheetOpen).toBe(false);
      expect(ensureGuestIdentity).toHaveBeenCalledOnce();
      Object.assign(auth, { isAuthenticated: true, isAnonymous: true });
      expect(queue.replayPendingAction(callbacks)).toBe(true);
      expect(pending.peek()).toBeNull();
    }
  );

  it.each(["download", "publish"])(
    "retains pending %s until the guest becomes a full account",
    (type) => {
      Object.assign(auth, { isAuthenticated: true, isAnonymous: true });
      history.replaceState(null, "", `/q/example?pending=${type}`);
      const queue = createAuthActionQueue();
      queue.bootstrapFromUrl();
      expect(queue.signInSheetOpen).toBe(true);
      expect(queue.replayPendingAction(callbacks)).toBe(false);
      expect(pending.peek()?.type).toBe(type);
      expect(callbacks.handlePublishAction).not.toHaveBeenCalled();
      expect(callbacks.handleDownload).not.toHaveBeenCalled();
      Object.assign(auth, { isFullAccount: true, isAnonymous: false });
      expect(queue.replayPendingAction(callbacks)).toBe(true);
      expect(
        type === "download"
          ? callbacks.handleDownload
          : callbacks.handlePublishAction
      ).toHaveBeenCalledOnce();
      expect(queue.replayPendingAction(callbacks)).toBe(false);
    }
  );

  it("discards the pending action when the account prompt is dismissed", () => {
    history.replaceState(null, "", "/q/example?pending=download");
    const queue = createAuthActionQueue();
    queue.bootstrapFromUrl();
    queue.closeSignInSheet();
    Object.assign(auth, { isAuthenticated: true, isFullAccount: true });
    expect(queue.replayPendingAction(callbacks)).toBe(false);
    expect(callbacks.handleDownload).not.toHaveBeenCalled();
  });
});

describe("a visitor the page never signed in", () => {
  // /sequence/[id] leaves the auth listener off at load for a visitor with no
  // saved session. Model that: Firebase knows who is here, but authState hears
  // nothing until learnWhoIsSignedIn() starts the listener.
  const firebase = { who: null as "guest" | "account" | null };
  const sequence = { id: "example-id", word: "G" } as SequenceData;

  beforeEach(() => {
    firebase.who = null;
    vi.mocked(learnWhoIsSignedIn).mockImplementation(async () => {
      Object.assign(auth, {
        isAuthenticated: firebase.who !== null,
        isAnonymous: firebase.who === "guest",
        isFullAccount: firebase.who === "account",
      });
    });
    vi.mocked(ensureGuestIdentity).mockImplementation(async () => {
      firebase.who ??= "guest";
    });
  });

  it("runs a favourite as the guest that tap created", async () => {
    const ranSignedIn = vi.fn();
    createAuthActionQueue().invokeGatedAction(
      "favorite",
      () => ranSignedIn(auth.isAuthenticated),
      sequence
    );
    await vi.waitFor(() => expect(ranSignedIn).toHaveBeenCalledOnce());
    expect(ranSignedIn).toHaveBeenCalledWith(true);
  });

  it("downloads for an account holder instead of asking them to sign in", async () => {
    firebase.who = "account";
    const download = vi.fn();
    const queue = createAuthActionQueue();
    queue.invokeGatedAction("download", download, sequence);
    await vi.waitFor(() => expect(download).toHaveBeenCalledOnce());
    expect(queue.signInSheetOpen).toBe(false);
  });

  it("asks a signed-out visitor to sign in, with authState listening", async () => {
    const download = vi.fn();
    const queue = createAuthActionQueue();
    queue.invokeGatedAction("download", download, sequence);
    await vi.waitFor(() => expect(queue.signInSheetOpen).toBe(true));
    expect(learnWhoIsSignedIn).toHaveBeenCalled();
    expect(pending.peek()?.type).toBe("download");
    expect(download).not.toHaveBeenCalled();
  });

  it("lets an account holder past the export gate", async () => {
    firebase.who = "account";
    await expect(ensureFullAccountForExport()).resolves.toBe(true);
    expect(authDrawerState.show).not.toHaveBeenCalled();
  });

  it("offers sign-up at the export gate instead of waiting forever", async () => {
    await expect(ensureFullAccountForExport()).resolves.toBe(false);
    expect(authDrawerState.show).toHaveBeenCalledWith("signup", "export");
  });
});
