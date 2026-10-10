import { describe, expect, it, vi } from "vitest";
import { createViewerDestinationActions } from "#lib/shared/sequence-viewer/services/viewer-destination-actions.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

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
  const saveSequenceHandoff = vi.fn();
  const navigate = vi.fn();

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
      saveSequenceHandoff: saveSequenceHandoff as never,
      navigate,
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
    saveSequenceHandoff,
    navigate,
  };
}

describe("viewer Studio destination", () => {
  it("keeps the sequence handoff through the Compose compatibility route", async () => {
    const harness = createActions();

    await harness.actions.handleOpenInCompose("combo-export");

    expect(harness.saveSequenceHandoff).toHaveBeenCalledWith(
      expect.objectContaining({
        sequence: expect.objectContaining({ id: "sequence-1" }),
        preferredPreset: "combo-export",
        returnPath: "/browse/library",
      })
    );
    expect(harness.onClose).toHaveBeenCalledWith("navigate");
    expect(harness.navigate).toHaveBeenCalledWith("/compose?handoff=true");
    expect(harness.showToast).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Opening in Studio for combined export...",
      })
    );
  });
});

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
