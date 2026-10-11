import { beforeEach, describe, expect, expectTypeOf, it } from "vitest";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import {
  createPostEditorState,
  type PostEditorState,
} from "#lib/shared/media-composition/state/post-editor-state.svelte.js";

function sequence(): SequenceData {
  return {
    id: "seq-history",
    displayName: "DCK",
    steps: Array.from({ length: 8 }, () => ({ duration: 1 })),
  } as unknown as SequenceData;
}

function editor() {
  let clock = 1_000;
  return createPostEditorState({
    getSequence: sequence,
    now: () => (clock += 1),
  });
}

const SURFACE = [
  // owned by the wrapper or the timing state
  "sequence",
  "moveBeats",
  "mode",
  "selectedPart",
  "selectTunnel",
  "selectPart",
  "tunnelHook",
  "selectedTakeId",
  "timing",
  "resolvedTiming",
  "timingStatus",
  "canUndoTiming",
  "canRedoTiming",
  "editTiming",
  "editMappingPreviewAppearance",
  "undoTiming",
  "redoTiming",
  "confirmTiming",
  "exitTiming",
  "replaceManifestFromDev",
  "addTitles",
  "addTunnelHook",
  "removeTunnelHook",
  "applyTutorial",
  "applyTemplate",
  "selectedItemId",
  "deleteSelected",
  "removeTake",
  "importProject",
  "addCatalogVideo",
  "attachCatalogTakes",
  "dispose",
  "host",
  // forwarded from the package state
  "subjectId",
  "project",
  "snapshot",
  "saveError",
  "saveRevision",
  "saveNow",
  "takes",
  "takeDisplayLabel",
  "images",
  "imageUrl",
  "compiled",
  "durationSeconds",
  "frameLayers",
  "presentLayers",
  "regionRects",
  "previewSeconds",
  "isPlaying",
  "selectedItem",
  "canUndo",
  "canRedo",
  "inGesture",
  "inSession",
  "splitTarget",
  "selectionEditable",
  "isLocked",
  "takesInUse",
  "mediaUrl",
  "persist",
  "commit",
  "amend",
  "editContext",
  "edit",
  "editSetting",
  "beginGesture",
  "gestureStep",
  "endGesture",
  "cancelGesture",
  "beginSession",
  "endSession",
  "undo",
  "redo",
  "trimLive",
  "splitAtPlayhead",
  "duplicateSelected",
  "addOverlay",
  "addCard",
  "setAudio",
  "seedAudio",
  "addLocalVideo",
  "addLibraryVideo",
  "appendTakeClip",
  "relinkLocalTake",
  "relinkProjectFiles",
  "attachLibraryTakes",
  "renameTake",
  "adoptSaved",
  "loadSaved",
  "loadSavedMedia",
  "seek",
  "advance",
  "togglePlayback",
  "pause",
] as const;

describe("post editor surface", () => {
  beforeEach(() => localStorage.clear());

  it("keeps every member the UI reads, and no other", () => {
    const state = editor();
    expect(Object.keys(state).sort()).toEqual([...SURFACE].sort());
    expectTypeOf<keyof PostEditorState>().toEqualTypeOf<
      (typeof SURFACE)[number]
    >();
    state.dispose();
  });
});
