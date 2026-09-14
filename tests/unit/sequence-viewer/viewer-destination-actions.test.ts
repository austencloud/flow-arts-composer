import { describe, expect, it, vi } from "vitest";
import { createViewerDestinationActions } from "$lib/shared/sequence-viewer/services/viewer-destination-actions";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

function createActions(
  options: {
    authenticated?: boolean;
    canManageVideos?: boolean;
    saveMakesVideosManageable?: boolean;
  } = {}
) {
  let canManageVideos = options.canManageVideos ?? false;
  const saveSequence = vi.fn(async () => {
    if (options.saveMakesVideosManageable) canManageVideos = true;
  });
  const enterVideoUpload = vi.fn();
  const showToast = vi.fn();
  const onClose = vi.fn();
  const savePendingEditSequence = vi.fn();
  const openCreateConstruct = vi.fn();
  const showAuth = vi.fn();

  const actions = createViewerDestinationActions(
    {
      playback: {} as never,
      interactive: {} as never,
      getSequence: () => ({ id: "sequence-1", steps: [] }) as SequenceData,
      getIsAuthenticated: () => options.authenticated ?? true,
      canManageSequenceVideos: () => canManageVideos,
      saveSequence,
      onClose,
      enterVideoUpload,
    },
    {
      saveSequenceHandoff: vi.fn() as never,
      navigate: vi.fn(),
      showToast: showToast as never,
      showAuth,
      savePendingEditSequence,
      openCreateConstruct,
      getReturnPath: () => "/browse/library",
    }
  );

  return {
    actions,
    saveSequence,
    enterVideoUpload,
    showToast,
    onClose,
    savePendingEditSequence,
    openCreateConstruct,
    showAuth,
  };
}

describe("viewer Remix destination", () => {
  it("hands off the sequence and closes without Back navigation before opening Construct", () => {
    const harness = createActions();
    harness.actions.handleEdit();
    expect(harness.savePendingEditSequence).toHaveBeenCalledWith({
      id: "sequence-1",
      steps: [],
    });
    expect(harness.onClose).toHaveBeenCalledWith("navigate");
    expect(harness.openCreateConstruct).toHaveBeenCalledOnce();
    expect(
      harness.savePendingEditSequence.mock.invocationCallOrder[0]
    ).toBeLessThan(harness.onClose.mock.invocationCallOrder[0]!);
    expect(harness.onClose.mock.invocationCallOrder[0]).toBeLessThan(
      harness.openCreateConstruct.mock.invocationCallOrder[0]!
    );
  });

  it("keeps an unauthenticated remix in the viewer until sign-in", () => {
    const harness = createActions({ authenticated: false });
    harness.actions.handleEdit();
    expect(harness.showAuth).toHaveBeenCalledWith("signup", "edit-community");
    expect(harness.savePendingEditSequence).not.toHaveBeenCalled();
    expect(harness.onClose).not.toHaveBeenCalled();
    expect(harness.openCreateConstruct).not.toHaveBeenCalled();
  });
});

describe("viewer video upload destination", () => {
  it("automatically saves an unsaved sequence before opening the uploader", async () => {
    const harness = createActions({ saveMakesVideosManageable: true });

    await harness.actions.handleVideoUpload();

    expect(harness.saveSequence).toHaveBeenCalledOnce();
    expect(harness.enterVideoUpload).toHaveBeenCalledOnce();
  });

  it("does not open the uploader when saving did not create an attachable record", async () => {
    const harness = createActions({ saveMakesVideosManageable: false });

    await harness.actions.handleVideoUpload();

    expect(harness.saveSequence).toHaveBeenCalledOnce();
    expect(harness.enterVideoUpload).not.toHaveBeenCalled();
  });

  it("does not save again when the sequence already has a manageable library record", async () => {
    const harness = createActions({ canManageVideos: true });

    await harness.actions.handleVideoUpload();

    expect(harness.saveSequence).not.toHaveBeenCalled();
    expect(harness.enterVideoUpload).toHaveBeenCalledOnce();
  });
});
