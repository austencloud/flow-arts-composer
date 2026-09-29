import { beforeEach, describe, expect, it } from "vitest";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { PostSourceGeometry } from "$lib/shared/media-composition/domain/post-project";
import {
  updateItemAt,
  updateItem,
} from "$lib/shared/media-composition/domain/post-project-edits";
import { createPostEditorState } from "$lib/shared/media-composition/state/post-editor-state.svelte";
import { dragSourceCrop } from "$lib/shared/share/components/post-studio/editor/post-source-crop";

const geometry: PostSourceGeometry = {
  x: -0.2,
  y: 0.1,
  width: 1.3,
  height: 0.8,
  rotation: 17,
  crop: { left: 0.2, top: 0.1, right: 0.9, bottom: 0.8 },
};

describe("source crop editing history", () => {
  beforeEach(() => localStorage.clear());

  it("keeps and cancels source crop sessions without changing placement", () => {
    let clock = 1000;
    const editor = createPostEditorState({
      getSequence: () =>
        ({
          id: "source-crop-history",
          displayName: "DCK",
          steps: [{ duration: 1 }],
        }) as SequenceData,
      now: () => ++clock,
    });
    editor.addCatalogVideo({
      videoId: "take",
      label: "Take",
      url: "https://example.test/take.mp4",
      durationSeconds: 10,
    });
    const id = editor.project.tracks
      .flatMap((track) => track.items)
      .find((item) => item.kind === "video")!.id;
    editor.edit((project, context) =>
      updateItem(project, id, { sourceGeometry: geometry }, context)
    );
    const current = () =>
      editor.project.tracks
        .flatMap((track) => track.items)
        .find((item) => item.id === id)!.sourceGeometry!;
    const edit = (dx: number) =>
      editor.edit((project, context) =>
        updateItemAt(
          project,
          id,
          { sourceGeometry: dragSourceCrop(current(), "move", dx, 0) },
          0,
          context
        )
      );

    editor.beginSession();
    edit(0.05);
    edit(0.05);
    editor.endSession(false);
    expect(current()).toEqual(geometry);

    editor.beginSession();
    edit(0.05);
    editor.endSession(true);
    expect(current().crop.left).toBeCloseTo(0.25);
    expect(current().rotation).toBe(17);
    editor.undo();
    expect(current()).toEqual(geometry);
    editor.redo();
    expect(current().crop.left).toBeCloseTo(0.25);
  });

  it("uses Undo or Redo during a drag to cancel only that drag", () => {
    let clock = 2000;
    const editor = createPostEditorState({
      getSequence: () =>
        ({
          id: "source-crop-drag-history",
          displayName: "DCK",
          steps: [{ duration: 1 }],
        }) as SequenceData,
      now: () => ++clock,
    });
    editor.addCatalogVideo({
      videoId: "take",
      label: "Take",
      url: "https://example.test/take.mp4",
      durationSeconds: 10,
    });
    const id = editor.project.tracks
      .flatMap((track) => track.items)
      .find((item) => item.kind === "video")!.id;
    editor.edit((project, context) =>
      updateItem(project, id, { sourceGeometry: geometry }, context)
    );
    const current = () =>
      editor.project.tracks
        .flatMap((track) => track.items)
        .find((item) => item.id === id)!.sourceGeometry!;

    editor.beginSession();
    for (const historyKey of ["undo", "redo"] as const) {
      const before = current();
      editor.beginGesture();
      editor.gestureStep((project, context) =>
        updateItemAt(
          project,
          id,
          { sourceGeometry: dragSourceCrop(before, "move", 0.05, 0) },
          0,
          context
        )
      );
      expect(editor.inGesture).toBe(true);
      expect(editor.canUndo).toBe(true);
      expect(editor.canRedo).toBe(true);
      editor[historyKey]();
      expect(editor.inGesture).toBe(false);
      expect(current()).toEqual(before);
      editor.endGesture(); // A delayed pointer release must not commit.
      expect(current()).toEqual(before);
    }
    editor.endSession(true);
    expect(current()).toEqual(geometry);
  });
});
