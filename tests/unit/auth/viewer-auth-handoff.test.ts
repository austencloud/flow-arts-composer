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
}));
vi.mock("#lib/shared/auth/services/guest-identity.js", () => ({
  ensureGuestIdentity: vi.fn().mockResolvedValue(undefined),
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
