import { beforeEach, describe, expect, it } from "vitest";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { updateItem } from "$lib/shared/media-composition/domain/post-project-edits";
import { createPostEditorState } from "$lib/shared/media-composition/state/post-editor-state.svelte";
import { addTakeTap } from "$lib/shared/media-composition/domain/take-timing";
import { loadTakeTiming } from "$lib/shared/media-composition/services/take-timing-store";

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

  it("undoes, redoes, and persists take timing without reviving stale redo", () => {
    const editor = createEditor();
    editor.addCatalogVideo({
      videoId: "timed-take",
      label: "Take",
      url: "https://example.test/take.mp4",
      durationSeconds: 40,
    });
    const takeId = editor.takes[0]!.id;
    const takeKey = editor.timing(takeId)!.takeKey;
    const taps = () => editor.timing(takeId)!.sections[0]!.taps;
    const savedTaps = () =>
      loadTakeTiming(sequence().id, takeKey)!.sections[0]!.taps;

    editor.editTiming(takeId, (current) =>
      addTakeTap(current, 2, editor.moveBeats)
    );
    editor.editTiming(takeId, (current) =>
      addTakeTap(current, 3, editor.moveBeats)
    );
    expect(taps()).toEqual([2, 3]);
    editor.undoTiming(takeId);
    expect(taps()).toEqual([2]);
    expect(savedTaps()).toEqual([2]);
    expect(editor.canRedoTiming(takeId)).toBe(true);
    editor.redoTiming(takeId);
    expect(taps()).toEqual([2, 3]);
    expect(savedTaps()).toEqual([2, 3]);

    editor.undoTiming(takeId);
    editor.editTiming(takeId, (current) =>
      addTakeTap(current, 4, editor.moveBeats)
    );
    expect(taps()).toEqual([2, 4]);
    expect(savedTaps()).toEqual([2, 4]);
    expect(editor.canRedoTiming(takeId)).toBe(false);
  });

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

describe("post editor sessions", () => {
  beforeEach(() => localStorage.clear());

  function editorWithClip() {
    const editor = createEditor();
    editor.addCatalogVideo({
      videoId: "take-1",
      label: "Take",
      url: "https://example.test/take.mp4",
      durationSeconds: 40,
    });
    const clip = editor.project.tracks
      .flatMap((track) => track.items)
      .find((item) => item.kind === "video")!;
    const zoom = () => {
      const item = editor.project.tracks
        .flatMap((track) => track.items)
        .find((candidate) => candidate.id === clip.id);
      return item?.kind === "video" ? item.zoom : Number.NaN;
    };
    const setZoom = (value: number) =>
      editor.edit((project, context) =>
        updateItem(project, clip.id, { zoom: value }, context)
      );
    return { editor, clip, zoom, setZoom };
  }

  it("lands a kept session as one undo step, with undo inside it meanwhile", () => {
    const { editor, zoom, setZoom } = editorWithClip();
    expect(editor.canUndo).toBe(true);

    expect(editor.beginSession()).toBe(true);
    expect(editor.beginSession()).toBe(false);
    expect(editor.inSession).toBe(true);
    // The clip's arrival is outside the session, so Undo cannot reach it.
    expect(editor.canUndo).toBe(false);
    setZoom(1.5);
    setZoom(2);
    editor.undo();
    editor.undo();
    expect(zoom()).toBe(1);
    expect(editor.canUndo).toBe(false);
    editor.undo();
    expect(zoom()).toBe(1);
    editor.redo();
    expect(zoom()).toBe(1.5);

    editor.endSession(true);
    expect(editor.inSession).toBe(false);
    expect(zoom()).toBe(1.5);
    expect(editor.canRedo).toBe(false);
    editor.undo();
    expect(zoom()).toBe(1);
    editor.undo();
    expect(editor.project.tracks.flatMap((track) => track.items)).toHaveLength(
      0
    );
  });

  it("puts the project and both undo lists back when cancelled", () => {
    const { editor, zoom, setZoom } = editorWithClip();
    setZoom(1.2);
    editor.undo();
    expect(editor.canRedo).toBe(true);

    editor.beginSession();
    expect(editor.canRedo).toBe(false);
    setZoom(3);
    editor.endSession(false);

    expect(zoom()).toBe(1);
    expect(editor.canRedo).toBe(true);
    editor.redo();
    expect(zoom()).toBe(1.2);
  });

  it("adds no undo step when a kept session changed nothing", () => {
    const { editor, zoom, setZoom } = editorWithClip();
    const before = editor.project;
    editor.beginSession();
    setZoom(2);
    setZoom(1);
    editor.endSession(true);

    expect(editor.project).toBe(before);
    editor.undo();
    expect(editor.project.tracks.flatMap((track) => track.items)).toHaveLength(
      0
    );
    expect(zoom()).toBeNaN();
  });

  it("ends a running drag with the session, kept or dropped", () => {
    const { editor, clip, zoom } = editorWithClip();
    const drag = (value: number) => {
      editor.beginGesture();
      editor.gestureStep((project, context) =>
        updateItem(project, clip.id, { zoom: value }, context)
      );
    };

    editor.beginSession();
    drag(2);
    editor.endSession(true);
    expect(editor.inGesture).toBe(false);
    expect(zoom()).toBe(2);
    editor.undo();
    expect(zoom()).toBe(1);

    editor.beginSession();
    drag(3);
    editor.endSession(false);
    expect(editor.inGesture).toBe(false);
    expect(zoom()).toBe(1);
  });

  it("keeps a slider change in the session from joining one made before it", () => {
    const { editor, clip, zoom } = editorWithClip();
    const slide = (value: number) =>
      editor.editSetting("zoom", (project, context) =>
        updateItem(project, clip.id, { zoom: value }, context)
      );
    slide(1.2);
    editor.beginSession();
    slide(1.4);
    expect(editor.canUndo).toBe(true);
    editor.undo();
    expect(zoom()).toBe(1.2);
    expect(editor.canUndo).toBe(false);
    editor.endSession(true);
  });
});
