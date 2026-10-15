import type { UserNotification } from "#lib/shared/notifications/domain/models/notification-models.js";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import InboxNotificationItem from "./InboxNotificationItem.svelte";

const mocks = vi.hoisted(() => ({
  closeInbox: vi.fn(),
  goto: vi.fn(),
  handleModuleChange: vi.fn(),
  setNotificationTargetFeedback: vi.fn(),
  setScanNotificationTarget: vi.fn(),
  showUserError: vi.fn(),
  getFirestoreInstance: vi.fn(),
  getDocFromServer: vi.fn(),
  mapDocToSequence: vi.fn(),
  openSequenceViewer: vi.fn(),
  openCreatorProfile: vi.fn(),
  setPendingBrowseIntent: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock("$app/navigation", () => ({
  goto: mocks.goto,
}));

vi.mock("#lib/shared/application/get-error-handler.js", () => ({
  getErrorHandler: () => ({ showUserError: mocks.showUserError }),
}));

vi.mock("#lib/shared/application/get-haptic-feedback.js", () => ({
  getHapticFeedback: () => ({ trigger: vi.fn() }),
}));

vi.mock("#lib/shared/auth/state/auth-state.svelte.js", () => ({
  authState: { effectiveUserId: "admin-user" },
}));

vi.mock("#lib/shared/auth/firebase.js", () => ({
  getFirestoreInstance: mocks.getFirestoreInstance,
}));

vi.mock("firebase/firestore", () => ({
  doc: (_firestore: unknown, path: string) => ({ path }),
  getDocFromServer: mocks.getDocFromServer,
}));

vi.mock("#lib/shared/library/services/collection-firestore-mapper.js", () => ({
  mapDocToSequence: mocks.mapDocToSequence,
}));

vi.mock(
  "#lib/shared/sequence-viewer/services/sequence-viewer-navigator.js",
  () => ({ openSequenceViewer: mocks.openSequenceViewer })
);

vi.mock("#lib/features/creators/state/creators-routing.svelte.js", () => ({
  openCreatorProfile: mocks.openCreatorProfile,
}));

vi.mock("#lib/features/browse/state/pending-browse-intent.svelte.js", () => ({
  setPendingBrowseIntent: mocks.setPendingBrowseIntent,
}));

vi.mock("#lib/shared/toast/state/toast-state.svelte.js", () => ({
  showToast: mocks.showToast,
}));

vi.mock(
  "#lib/shared/navigation-coordinator/navigation-coordinator.svelte.js",
  () => ({
    handleModuleChange: mocks.handleModuleChange,
  })
);

vi.mock(
  "#lib/shared/feedback/state/notification-action-state.svelte.js",
  () => ({
    setNotificationTargetFeedback: mocks.setNotificationTargetFeedback,
  })
);

vi.mock(
  "#lib/features/choreo-card/state/scan-notification-target.svelte.js",
  () => ({
    setScanNotificationTarget: mocks.setScanNotificationTarget,
  })
);

vi.mock("../../state/inbox-state.svelte", () => ({
  inboxState: {
    close: mocks.closeInbox,
    setTab: vi.fn(),
  },
}));

describe("InboxNotificationItem navigation", () => {
  beforeEach(() => {
    mocks.closeInbox.mockReset();
    mocks.goto.mockReset();
    mocks.goto.mockResolvedValue(undefined);
    mocks.handleModuleChange.mockReset();
    mocks.handleModuleChange.mockResolvedValue(undefined);
    mocks.showUserError.mockReset();
    mocks.getFirestoreInstance.mockReset();
    mocks.getFirestoreInstance.mockResolvedValue({ kind: "firestore" });
    mocks.getDocFromServer.mockReset();
    mocks.mapDocToSequence.mockReset();
    mocks.openSequenceViewer.mockReset();
    mocks.openCreatorProfile.mockReset();
    mocks.setPendingBrowseIntent.mockReset();
    mocks.showToast.mockReset();
    mocks.openCreatorProfile.mockResolvedValue(undefined);
  });

  it("opens a follower notification through the canonical creator route", async () => {
    const notification = {
      id: "follow-1",
      userId: "admin-user",
      type: "user-followed",
      message: "River followed you",
      createdAt: new Date("2026-08-19T14:30:20.000Z"),
      read: true,
      fromUserId: "river-user",
    } satisfies UserNotification;

    render(InboxNotificationItem, { notification });

    await page.getByRole("button", { name: "River followed you" }).click();

    await vi.waitFor(() => {
      expect(mocks.openCreatorProfile).toHaveBeenCalledWith(
        "river-user",
        undefined,
        "inbox_notification"
      );
    });
    expect(mocks.closeInbox).toHaveBeenCalledOnce();
    expect(mocks.goto).not.toHaveBeenCalled();
  });

  it("opens an achievement notification on the signed-in creator profile", async () => {
    const notification = {
      id: "achievement-1",
      userId: "admin-user",
      type: "achievement-unlocked",
      message: "You unlocked a new achievement",
      createdAt: new Date("2026-08-19T14:30:20.000Z"),
      read: true,
    } satisfies UserNotification;

    render(InboxNotificationItem, { notification });

    await page
      .getByRole("button", { name: "You unlocked a new achievement" })
      .click();

    await vi.waitFor(() => {
      expect(mocks.openCreatorProfile).toHaveBeenCalledWith(
        "admin-user",
        undefined,
        "inbox_notification"
      );
    });
    expect(mocks.closeInbox).toHaveBeenCalledOnce();
    expect(mocks.goto).not.toHaveBeenCalled();
  });

  it("opens the user activity page when an older live payload only has fromUserId", async () => {
    const notification = {
      id: "return-1",
      userId: "admin-user",
      type: "admin-user-returned",
      message: "Codex + Claude is back in the app",
      createdAt: new Date("2026-08-09T05:26:35.592Z"),
      read: true,
      fromUserId: "agent-codex-claude",
    } satisfies UserNotification;

    render(InboxNotificationItem, { notification });

    await page
      .getByRole("button", { name: "Codex + Claude is back in the app" })
      .click();

    await vi.waitFor(() => {
      expect(mocks.goto).toHaveBeenCalledWith(
        "/admin/users?inspectUser=agent-codex-claude",
        { replace: true, reset: false }
      );
    });
    expect(mocks.closeInbox).toHaveBeenCalledOnce();
    expect(mocks.handleModuleChange).toHaveBeenCalledWith("admin", "users", {
      skipHistory: true,
    });
    expect(mocks.showUserError).not.toHaveBeenCalled();
  });

  it("opens an admin content notification from the owner's private library", async () => {
    const notification = {
      id: "created-1",
      userId: "admin-user",
      type: "admin-content-created",
      message: 'Handsome_banana saved "ABC"',
      createdAt: new Date("2026-08-20T14:00:00.000Z"),
      read: true,
      fromUserId: "creator-1",
      fromUserName: "Handsome_banana",
      contentType: "sequence",
      sequenceId: "sequence-1",
      word: "ABC",
    } satisfies UserNotification;
    const mappedSequence = {
      id: "sequence-1",
      word: "ABC",
      steps: [],
    };
    mocks.getDocFromServer.mockResolvedValue({
      exists: () => true,
      data: () => ({ word: "ABC", visibility: "private" }),
      id: "sequence-1",
    });
    mocks.mapDocToSequence.mockReturnValue(mappedSequence);

    render(InboxNotificationItem, { notification });

    await page
      .getByRole("button", { name: 'Handsome_banana saved "ABC"' })
      .click();

    await vi.waitFor(() => {
      expect(mocks.getDocFromServer).toHaveBeenCalledWith({
        path: "users/creator-1/sequences/sequence-1",
      });
    });
    expect(mocks.openSequenceViewer).toHaveBeenCalledWith(
      {
        ...mappedSequence,
        ownerId: "creator-1",
        ownerDisplayName: "Handsome_banana",
      },
      {
        source: "inbox_notification",
        returnPath: window.location.pathname,
        returnLabel: "Notifications",
      }
    );
    expect(mocks.closeInbox).toHaveBeenCalledOnce();
    expect(mocks.goto).not.toHaveBeenCalled();
    expect(mocks.showUserError).not.toHaveBeenCalled();
  });

  it("opens a created public collection on its Explore page", async () => {
    const notification = {
      id: "created-collection-1",
      userId: "admin-user",
      type: "admin-content-created",
      message: 'Duncan created collection "8-step caps"',
      createdAt: new Date("2026-10-14T21:52:15.000Z"),
      read: true,
      fromUserId: "creator-2",
      fromUserName: "Duncan",
      contentType: "collection",
      collectionId: "collection-2",
      collectionName: "8-step caps",
    } satisfies UserNotification;
    mocks.getDocFromServer.mockResolvedValue({
      exists: () => true,
      data: () => ({ name: "8-step caps", isPublic: true }),
    });

    render(InboxNotificationItem, { notification });

    await page
      .getByRole("button", { name: 'Duncan created collection "8-step caps"' })
      .click();

    await vi.waitFor(() => {
      expect(mocks.handleModuleChange).toHaveBeenCalledWith(
        "browse",
        "gallery"
      );
    });
    expect(mocks.getDocFromServer).toHaveBeenCalledWith({
      path: "users/creator-2/collections/collection-2",
    });
    expect(mocks.setPendingBrowseIntent).toHaveBeenCalledWith({
      kind: "public-collection-detail",
      ownerId: "creator-2",
      collectionId: "collection-2",
      collectionName: "8-step caps",
    });
    expect(mocks.closeInbox).toHaveBeenCalledOnce();
    expect(mocks.showToast).not.toHaveBeenCalled();
    expect(mocks.showUserError).not.toHaveBeenCalled();
  });

  it("says a created private collection cannot be opened", async () => {
    const notification = {
      id: "created-collection-2",
      userId: "admin-user",
      type: "admin-content-created",
      message: 'Sky created smart collection "Drafts"',
      createdAt: new Date("2026-10-14T21:52:15.000Z"),
      read: true,
      fromUserId: "creator-3",
      fromUserName: "Sky",
      contentType: "collection",
      collectionId: "collection-3",
      collectionName: "Drafts",
    } satisfies UserNotification;
    mocks.getDocFromServer.mockResolvedValue({
      exists: () => true,
      data: () => ({ name: "Drafts", isPublic: false }),
    });

    render(InboxNotificationItem, { notification });

    await page
      .getByRole("button", { name: 'Sky created smart collection "Drafts"' })
      .click();

    await vi.waitFor(() => {
      expect(mocks.showToast).toHaveBeenCalledOnce();
    });
    expect(mocks.setPendingBrowseIntent).not.toHaveBeenCalled();
    expect(mocks.handleModuleChange).not.toHaveBeenCalled();
    expect(mocks.closeInbox).not.toHaveBeenCalled();
    expect(mocks.showUserError).not.toHaveBeenCalled();
  });
});
