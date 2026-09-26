import { beforeEach, describe, expect, it } from "vitest";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { createPostEditorState } from "$lib/shared/media-composition/state/post-editor-state.svelte";

const LABELS = { runThrough: "Run through", slowMo: "Slow mo", card: "Card" };

function sequence(): SequenceData {
  return {
    id: "seq-history",
    displayName: "DCK",
    steps: Array.from({ length: 8 }, () => ({ duration: 1 })),
  } as unknown as SequenceData;
}

function createEditor() {
  let clock = 1_000;
  return createPostEditorState({
    getSequence: sequence,
    now: () => (clock += 1),
  });
}

describe("post editor history", () => {
  beforeEach(() => localStorage.clear());

  it("undoes and redoes the Tutorial's timing split along with the post", () => {
    const editor = createEditor();
    editor.addCatalogVideo({
      videoId: "take-1",
      label: "Take",
      url: "https://example.test/take.mp4",
      durationSeconds: 40,
    });
    const takeId = editor.takes[0]!.id;
    // The run through and the slow part, cut from one recording by hand.
    editor.seek(18);
    expect(editor.splitAtPlayhead()).toBe(true);
    const parts = editor.timing(takeId)!.sections.length;

    expect(editor.applyTutorial(LABELS)).toBe(true);
    expect(editor.timing(takeId)!.sections).toHaveLength(parts + 1);

    editor.undo();
    expect(editor.timing(takeId)!.sections).toHaveLength(parts);

    editor.redo();
    expect(editor.timing(takeId)!.sections).toHaveLength(parts + 1);
  });

  it("opens with the sound from a link without an undo step", () => {
    const editor = createEditor();
    expect(editor.canUndo).toBe(false);

    editor.seedAudio("silent");

    expect(editor.project.audio).toBe("silent");
    expect(editor.canUndo).toBe(false);
  });
});
