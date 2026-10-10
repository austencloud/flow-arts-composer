import { beforeEach, describe, expect, it } from "vitest";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { ArrangementSnapshot } from "$lib/shared/media-composition/domain/arrangement";
import { PostProjectSchema } from "$lib/shared/media-composition/domain/post-project";
import {
  setArrangementSnapshot,
  splitItemAt,
  trimItem,
} from "$lib/shared/media-composition/domain/post-project-edits";
import { createPostEditorState } from "$lib/shared/media-composition/state/post-editor-state.svelte";
import { createBlankArrangementSnapshot } from "$lib/shared/share/components/post-studio/editor/post-editor-arrangement";

const sequence = {
  id: "seq-arrangement",
  displayName: "Arrangement",
  steps: Array.from({ length: 8 }, () => ({ duration: 1 })),
} as unknown as SequenceData;

const blank: ArrangementSnapshot = {
  schemaVersion: 1,
  cells: [],
  gridRows: 1,
  gridCols: 1,
  bpm: 120,
  skipStartPlacement: false,
};

describe("arrangements in the Post editor", () => {
  beforeEach(() => localStorage.clear());

  it("starts with editable backing cells for the full Arrange grid", () => {
    const snapshot = createBlankArrangementSnapshot();
    expect(snapshot.cells).toHaveLength(64);
    expect(snapshot.cells[0]).toMatchObject({ id: "cell-0-0", row: 0, col: 0 });
    expect(snapshot.cells[63]).toMatchObject({
      id: "cell-7-7",
      row: 7,
      col: 7,
    });
    expect(snapshot.gridRows).toBe(2);
    expect(snapshot.gridCols).toBe(2);
  });

  it("places the first arrangement on main and the next above it", () => {
    const editor = createPostEditorState({ getSequence: () => sequence });
    const first = editor.addArrangement(blank, 0);
    expect(first).toBeTruthy();
    expect(editor.project.tracks[0]?.items[0]?.id).toBe(first);

    const second = editor.addArrangement(blank, 0);
    expect(second).toBeTruthy();
    expect(editor.project.tracks[0]?.items).toHaveLength(1);
    expect(
      editor.project.tracks
        .slice(1)
        .flatMap((track) => track.items)
        .map((item) => item.id)
    ).toContain(second);
    expect(PostProjectSchema.parse(editor.project).tracks).toHaveLength(2);
  });

  it("applies the whole snapshot as one undoable project change and survives schema reload", () => {
    const editor = createPostEditorState({ getSequence: () => sequence });
    const id = editor.addArrangement(blank, 0)!;
    const changed: ArrangementSnapshot = { ...blank, bpm: 90, gridCols: 2 };
    expect(
      editor.edit((project, ctx) =>
        setArrangementSnapshot(project, id, changed, ctx)
      )
    ).toBe(true);
    const saved = PostProjectSchema.parse(
      JSON.parse(JSON.stringify(editor.project))
    );
    expect(saved.tracks[0]?.items[0]).toMatchObject({
      kind: "arrangement",
      snapshot: changed,
    });
    expect(editor.canUndo).toBe(true);
    editor.undo();
    expect(editor.project.tracks[0]?.items[0]).toMatchObject({
      kind: "arrangement",
      snapshot: blank,
    });
    expect(editor.canRedo).toBe(true);
    editor.redo();
    expect(editor.project.tracks[0]?.items[0]).toMatchObject({
      kind: "arrangement",
      snapshot: changed,
    });
  });

  it("trims and splits arrangement source time without replaying the start in the second piece", () => {
    const editor = createPostEditorState({ getSequence: () => sequence });
    const id = editor.addArrangement(blank, 0)!;
    const original = editor.project.tracks[0]!.items[0]!;
    const half = original.duration / 2;
    const split = splitItemAt(editor.project, id, half, { now: Date.now() });
    expect(split).not.toBeNull();
    const [first, second] = split!.project.tracks[0]!.items;
    expect(first).toMatchObject({
      kind: "arrangement",
      sourceIn: 0,
      sourceOut: half,
    });
    expect(second).toMatchObject({
      kind: "arrangement",
      sourceIn: half,
      sourceOut: original.duration,
    });

    const trimmed = trimItem(editor.project, id, "end", half, {
      now: Date.now(),
    });
    expect(trimmed.tracks[0]?.items[0]).toMatchObject({
      kind: "arrangement",
      sourceIn: 0,
      sourceOut: half,
      duration: half,
    });
    expect(PostProjectSchema.parse(trimmed).tracks[0]?.items[0]?.kind).toBe(
      "arrangement"
    );
  });
});
