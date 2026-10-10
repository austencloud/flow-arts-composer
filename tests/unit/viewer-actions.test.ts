import { describe, it, expect, vi } from "vitest";

const { openCollectionPicker } = vi.hoisted(() => ({
  openCollectionPicker: vi.fn(),
}));
vi.mock(
  "#lib/features/library/state/collection-picker-state.svelte.js",
  () => ({
    openCollectionPicker,
  })
);

import { buildHeaderActions } from "#lib/shared/sequence-viewer/services/viewer-actions.js";
import { VIDEO_UPLOAD_ENABLED } from "#lib/shared/sequence-viewer/config/viewer-feature-flags.js";

function makeCtx(over: Partial<Record<string, unknown>> = {}) {
  return {
    isFavorite: false,
    isSaved: true,
    isSaving: false,
    isPublished: false,
    isOwned: false,
    isOwnedLibraryRecord: false,
    isLoggedIn: false,
    sequence: { id: "seq-1", name: "Alpha Loop", word: "ALPHA" },
    practiceActive: false,
    invokeGatedAction: vi.fn((_id: string, run: () => void) => run()),
    handleFavoriteToggle: vi.fn(),
    handleSave: vi.fn(),
    handleEdit: vi.fn(),
    handlePublishAction: vi.fn(),
    handleUnpublishAction: vi.fn(),
    handleVideoUpload: vi.fn(),
    enterPracticeMode: vi.fn(),
    exitPracticeMode: vi.fn(),
    ...over,
  } as never;
}

const wiring = {
  onDeleteRequest: () => {},
};

describe("buildHeaderActions", () => {
  it("guest: engagement offered (login-prompt via gated actions), no owner management", () => {
    const a = buildHeaderActions(makeCtx(), "full", wiring);
    expect(a.onFavoriteToggle).toBeTypeOf("function");
    expect(a.onSave).toBeTypeOf("function");
    expect(a.isSaving).toBe(false);
    expect(a.onRemix).toBeTypeOf("function");
    expect(a.showPractice).toBe(true);
    expect(a.onPracticeToggle).toBeTypeOf("function");
    expect(a.onPublish).toBeUndefined();
    expect(a.onUnpublish).toBeUndefined();
    expect(a.onDeleteRequest).toBeUndefined();
    expect(a.onVideoUpload).toBeUndefined();
    expect(a.onAddToCollection).toBeUndefined();
  });

  it("exact owned library record: management actions light up", () => {
    const a = buildHeaderActions(
      makeCtx({
        isOwned: true,
        isOwnedLibraryRecord: true,
        isSaved: true,
        isLoggedIn: true,
      }),
      "full",
      wiring
    );
    expect(a.onPublish).toBeTypeOf("function");
    expect(a.onUnpublish).toBeTypeOf("function");
    expect(a.onDeleteRequest).toBeTypeOf("function");
    expect(VIDEO_UPLOAD_ENABLED).toBe(true);
    expect(a.onVideoUpload).toBeTypeOf("function");
  });

  it("matching content without the exact owned record has no management actions", () => {
    const a = buildHeaderActions(
      makeCtx({
        isOwned: true,
        isOwnedLibraryRecord: false,
        isSaved: true,
        isLoggedIn: true,
      }),
      "full",
      wiring
    );
    expect(a.onPublish).toBeUndefined();
    expect(a.onUnpublish).toBeUndefined();
    expect(a.onDeleteRequest).toBeUndefined();
  });

  it("owner not yet saved: no publish/delete", () => {
    const a = buildHeaderActions(
      makeCtx({
        isOwned: true,
        isOwnedLibraryRecord: false,
        isSaved: false,
        isLoggedIn: true,
      }),
      "full",
      wiring
    );
    expect(a.onPublish).toBeUndefined();
    expect(a.onDeleteRequest).toBeUndefined();
    expect(a.onSave).toBeTypeOf("function");
  });

  it("exact owned library record: add-to-collection opens the picker for that record", () => {
    openCollectionPicker.mockClear();
    const a = buildHeaderActions(
      makeCtx({ isOwned: true, isOwnedLibraryRecord: true, isLoggedIn: true }),
      "full",
      wiring
    );
    expect(a.onAddToCollection).toBeTypeOf("function");

    a.onAddToCollection?.();

    expect(openCollectionPicker).toHaveBeenCalledWith({
      sequenceId: "seq-1",
      sequenceLabel: "Alpha Loop",
    });
  });

  it("keeps collections available for an owned record while the content save state updates", () => {
    const a = buildHeaderActions(
      makeCtx({
        isOwned: true,
        isOwnedLibraryRecord: true,
        isSaved: false,
        isLoggedIn: true,
      }),
      "full",
      wiring
    );
    expect(a.onAddToCollection).toBeTypeOf("function");
    expect(a.onPublish).toBeUndefined();
  });

  it("add-to-collection needs a library record to file, not just matching content", () => {
    const matchingContent = buildHeaderActions(
      makeCtx({ isOwned: true, isOwnedLibraryRecord: false, isSaved: true }),
      "full",
      wiring
    );
    const unsavedOwner = buildHeaderActions(
      makeCtx({ isOwned: true, isOwnedLibraryRecord: false, isSaved: false }),
      "full",
      wiring
    );
    expect(matchingContent.onAddToCollection).toBeUndefined();
    expect(unsavedOwner.onAddToCollection).toBeUndefined();
  });
});
