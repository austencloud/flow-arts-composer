import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  saveSequence: vi.fn(),
  ensureGuestIdentity: vi.fn(),
  showToast: vi.fn(() => "pending-toast"),
  removeToast: vi.fn(),
  onGuestSaveSucceeded: vi.fn(),
  hasMatchingContent: vi.fn(async () => false),
  getSequence: vi.fn(async () => null),
  updateSequence: vi.fn(async () => undefined),
  computeHash: vi.fn(async () => "content-hash-1"),
  authState: { user: { uid: "viewer-test-user" } },
}));

vi.mock("$lib/shared/library/services/collection-manager", () => ({
  isFavorite: vi.fn(async () => false),
  toggleFavorite: vi.fn(async () => undefined),
}));

vi.mock("$lib/shared/library/get-library-repository", () => ({
  getLibraryRepository: () => ({
    hasMatchingContent: mocks.hasMatchingContent,
    getSequence: mocks.getSequence,
    updateSequence: mocks.updateSequence,
    publishSequence: vi.fn(async () => undefined),
    unpublishSequence: vi.fn(async () => undefined),
    deleteSequence: vi.fn(async () => undefined),
  }),
}));

vi.mock("$lib/shared/foundation/domain/models/sequence-data", () => ({
  createSequenceData: (sequence: unknown) => sequence,
}));

vi.mock(
  "$lib/shared/animation-engine/state/animation-visibility-state.svelte",
  () => ({
    getAnimationVisibilityManager: () => ({ getPathShape: () => "arc" }),
  })
);

vi.mock("$lib/shared/auth/state/auth-state.svelte", () => ({
  authState: mocks.authState,
}));

vi.mock("$lib/shared/library/services/sequence-content-hasher", () => ({
  computeHash: mocks.computeHash,
}));

vi.mock("$lib/shared/auth/services/guest-identity", () => ({
  ensureGuestIdentity: mocks.ensureGuestIdentity,
}));

vi.mock("$lib/shared/toast/state/toast-state.svelte", () => ({
  showToast: mocks.showToast,
  removeToast: mocks.removeToast,
}));

vi.mock("$lib/shared/pictograph/prop/domain/enums/prop-type", () => ({
  PropType: { STAFF: "staff", FAN: "fan" },
}));

vi.mock(
  "$lib/shared/onboarding/state/post-save-activation-state.svelte",
  () => ({
    postSaveActivation: {
      onGuestSaveSucceeded: mocks.onGuestSaveSucceeded,
    },
  })
);

import { createLibraryActionHandler } from "$lib/shared/sequence-viewer/state/library-action-handler.svelte";
import { LibraryError } from "$lib/shared/library/domain/library-error";
import { registerVisualSequenceSaveCoordinatorFactory } from "$lib/shared/library/get-visual-sequence-save-coordinator";
import { VisualSequenceSaveCoordinator } from "$lib/features/library/services/implementations/VisualSequenceSaveCoordinator";

const sequence = {
  id: "sequence-1",
  word: "AB",
  steps: [{ letter: "A" }, { letter: "B" }],
  metadata: {},
};

function makeHandler(isOwned = true) {
  const handler = createLibraryActionHandler({
    getSequence: () => sequence as never,
    getIsOwned: () => isOwned,
    getLeftPropType: () => undefined,
    getRightPropType: () => undefined,
    getCatDogModeEnabled: () => false,
    getHapticService: () => ({ trigger: vi.fn() }) as never,
    onDeleteSuccess: vi.fn(),
  });
  handler.syncSavedState(sequence as never);
  return handler;
}

describe("sequence viewer library action feedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.saveSequence.mockReset();
    mocks.ensureGuestIdentity.mockReset().mockResolvedValue(undefined);
    mocks.showToast.mockReset().mockReturnValue("pending-toast");
    mocks.hasMatchingContent.mockReset().mockResolvedValue(false);
    mocks.getSequence.mockReset().mockResolvedValue(null);
    mocks.updateSequence.mockReset().mockResolvedValue(undefined);
    mocks.computeHash.mockReset().mockResolvedValue("content-hash-1");

    // 8f74d8edd9 moved the pending toast, duplicate handling and in-flight
    // dedupe out of this handler and into VisualSequenceSaveCoordinator, which
    // the handler now reaches through a registered async factory. The
    // guarantees below are still the viewer's guarantees, so they are proven
    // through the real coordinator over the mocked persistence boundary rather
    // than against a stub that could drift from it. Re-registering also drops
    // the memoized instance, so each test gets a fresh in-flight map.
    registerVisualSequenceSaveCoordinatorFactory(
      async () =>
        new VisualSequenceSaveCoordinator({ saveSequence: mocks.saveSequence })
    );
  });

  it("saves path data only to an owned existing record", async () => {
    mocks.getSequence.mockResolvedValue(sequence);
    const handler = makeHandler();
    await vi.waitFor(() => expect(handler.isOwnedLibraryRecord).toBe(true));
    expect(await handler.savePaths()).toBe(true);
    expect(mocks.updateSequence).toHaveBeenCalledWith(sequence.id, {
      steps: sequence.steps,
      metadata: sequence.metadata,
    });
    mocks.updateSequence.mockClear();
    expect(await makeHandler(false).savePaths()).toBe(false);
    expect(mocks.updateSequence).not.toHaveBeenCalled();
  });

  it("keeps a failed path save retryable", async () => {
    mocks.getSequence.mockResolvedValue(sequence);
    mocks.updateSequence.mockRejectedValueOnce(new Error("offline"));
    const handler = makeHandler();
    await vi.waitFor(() => expect(handler.isOwnedLibraryRecord).toBe(true));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await handler.savePaths()).toBe(false);
    expect(handler.isSaving).toBe(false);
    expect(mocks.showToast).toHaveBeenCalledWith(
      "Couldn't save motion paths",
      "error"
    );
    error.mockRestore();
    expect(await handler.savePaths()).toBe(true);
  });

  it("persists the chosen pair while leaving the source unchanged", async () => {
    mocks.saveSequence.mockResolvedValue({
      persisted: true,
      sequenceId: "copy",
    });
    const handler = makeHandler(false);
    const pending = handler.handleSave();
    handler.saveProps = {
      leftPropType: "fan",
      rightPropType: "staff",
      catDogMode: true,
    } as never;
    handler.finishPropChoice(true);
    await pending;
    const stored = mocks.saveSequence.mock.calls[0]?.[0];
    expect(stored.creatorIntent.propConfig).toEqual({
      leftPropType: "fan",
      rightPropType: "staff",
      catDogMode: true,
    });
    expect(sequence).not.toHaveProperty("creatorIntent");
  });

  it("cancelling the prop choice never writes a library record", async () => {
    const handler = makeHandler();
    const pending = handler.handleSave();
    expect(handler.saveProps).not.toBeNull();
    handler.finishPropChoice(false);
    await pending;
    expect(mocks.saveSequence).not.toHaveBeenCalled();
    expect(handler.saveProps).toBeNull();
    expect(handler.isSaving).toBe(false);
  });

  it("shows pending feedback immediately and settles as saved once persistence resolves", async () => {
    let resolveSave!: (result: {
      persisted: boolean;
      sequenceId: string;
    }) => void;
    mocks.saveSequence.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve;
        })
    );
    const handler = makeHandler();

    const save = handler.handleSave();
    expect(mocks.saveSequence).not.toHaveBeenCalled();
    handler.finishPropChoice(true);
    await vi.waitFor(() => expect(handler.isSaving).toBe(true));
    expect(handler.isSaved).toBe(false);

    await vi.waitFor(() => expect(mocks.saveSequence).toHaveBeenCalledOnce());

    // Pending feedback is on screen BEFORE persistence resolves - the save
    // promise below is still unsettled at this point.
    expect(mocks.showToast).toHaveBeenCalledWith({
      message: "Saving to library…",
      type: "info",
      duration: 0,
      announcement: "polite",
    });
    expect(handler.isSaving).toBe(true);
    expect(mocks.removeToast).not.toHaveBeenCalled();

    await handler.handleSave();
    expect(mocks.saveSequence).toHaveBeenCalledOnce();

    resolveSave({ persisted: true, sequenceId: "saved-sequence-1" });
    await save;

    expect(handler.isSaving).toBe(false);
    expect(handler.isSaved).toBe(true);
    expect(mocks.removeToast).toHaveBeenCalledWith(
      "pending-toast",
      "programmatic"
    );
    expect(mocks.showToast).toHaveBeenCalledWith("Saved to library", "success");
    expect(mocks.onGuestSaveSucceeded).toHaveBeenCalledWith("saved-sequence-1");
  });

  it("restores Save and replaces the pending toast when persistence fails", async () => {
    const error = new Error("Library is unavailable");
    mocks.saveSequence.mockRejectedValue(error);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const handler = makeHandler();

    const pending = handler.handleSave();
    handler.finishPropChoice(true);
    await pending;

    expect(handler.isSaving).toBe(false);
    expect(handler.isSaved).toBe(false);
    expect(mocks.removeToast).toHaveBeenCalledWith(
      "pending-toast",
      "programmatic"
    );
    expect(mocks.showToast).toHaveBeenCalledWith(
      "Library is unavailable",
      "error"
    );
    consoleError.mockRestore();
  });

  it("settles as Saved when duplicate detection confirms the sequence is already present", async () => {
    mocks.saveSequence.mockRejectedValue(
      new LibraryError(
        "This exact sequence is already in your library",
        "ALREADY_EXISTS"
      )
    );
    const handler = makeHandler();

    const pending = handler.handleSave();
    handler.finishPropChoice(true);
    await pending;

    expect(handler.isSaving).toBe(false);
    expect(handler.isSaved).toBe(true);
    expect(mocks.showToast).toHaveBeenCalledWith("Already in library", "info");
  });

  it("detects a saved generated sequence even when its live model has no content hash", async () => {
    mocks.hasMatchingContent.mockResolvedValue(true);
    const handler = makeHandler();

    await vi.waitFor(() => expect(handler.isSaved).toBe(true));

    expect(mocks.computeHash).toHaveBeenCalledWith(sequence);
    expect(mocks.hasMatchingContent).toHaveBeenCalledWith("content-hash-1");
    expect(handler.isOwnedLibraryRecord).toBe(false);
  });

  it("confirms management ownership only when the current ID is an owned library record", async () => {
    mocks.hasMatchingContent.mockResolvedValue(true);
    mocks.getSequence.mockResolvedValue({
      ...sequence,
      ownerId: "viewer-test-user",
      contentHash: "content-hash-1",
    });
    const handler = makeHandler();

    await vi.waitFor(() => expect(handler.isOwnedLibraryRecord).toBe(true));

    expect(mocks.getSequence).toHaveBeenCalledWith("sequence-1");
    expect(handler.isSaved).toBe(true);
  });

  it("patches only cardPresentation on an owned saved record", async () => {
    mocks.getSequence.mockResolvedValue({
      ...sequence,
      ownerId: "viewer-test-user",
      contentHash: "content-hash-1",
    });
    const handler = makeHandler();
    await vi.waitFor(() => expect(handler.isOwnedLibraryRecord).toBe(true));

    await expect(
      handler.saveCardPresentation({
        schemaVersion: 1,
        footer: { mode: "custom", text: "Shared from First Fire" },
      })
    ).resolves.toBe(true);

    expect(mocks.updateSequence).toHaveBeenCalledWith("sequence-1", {
      cardPresentation: {
        schemaVersion: 1,
        footer: { mode: "custom", text: "Shared from First Fire" },
      },
    });
  });

  it("refuses card presentation writes for records the viewer does not own", async () => {
    const handler = makeHandler(false);

    await expect(
      handler.saveCardPresentation({
        schemaVersion: 1,
        footer: { mode: "credit" },
      })
    ).resolves.toBe(false);
    expect(mocks.updateSequence).not.toHaveBeenCalled();
  });
});
