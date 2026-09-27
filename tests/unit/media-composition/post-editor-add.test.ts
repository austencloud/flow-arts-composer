import { beforeEach, describe, expect, it } from "vitest";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { createPostEditorState } from "$lib/shared/media-composition/state/post-editor-state.svelte";
import {
  newItemStart,
  overlayAt,
} from "$lib/shared/share/components/post-studio/editor/post-editor-add";

function editorWithClip() {
  const editor = createPostEditorState({
    getSequence: () =>
      ({
        id: "seq-add",
        displayName: "DCK",
        steps: Array.from({ length: 8 }, () => ({ duration: 1 })),
      }) as unknown as SequenceData,
  });
  editor.addCatalogVideo({
    videoId: "take-1",
    label: "Take",
    url: "https://example.test/take.mp4",
    durationSeconds: 12,
  });
  return editor;
}

describe("newItemStart", () => {
  it("starts at the playhead inside the post", () => {
    expect(newItemStart(12, 4)).toBe(4);
    expect(newItemStart(0, 0)).toBe(0);
  });

  it("backs off from the very end so the new item can be seen", () => {
    expect(newItemStart(12, 12)).toBe(9);
    expect(newItemStart(2, 2)).toBe(0);
  });
});

describe("overlayAt", () => {
  beforeEach(() => localStorage.clear());

  it("makes a sequence view over a clip follow that clip", () => {
    const { project } = editorWithClip();
    expect(
      overlayAt(project, { kind: "animation", overlay: true }, 4).fill
    ).toBe(true);
    expect(overlayAt(project, { kind: "moves", mode: "arrows" }, 4).fill).toBe(
      true
    );
  });

  it("gives text its own time, and anything past the clips its own time", () => {
    const { project } = editorWithClip();
    expect(overlayAt(project, { kind: "text", text: "Hi" }, 4).fill).toBe(
      false
    );
    expect(overlayAt(project, { kind: "carousel" }, 30).fill).toBe(false);
  });
});
