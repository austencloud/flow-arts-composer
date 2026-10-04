import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { PostProject } from "$lib/shared/media-composition/domain/post-project";
import { addTakeTap } from "$lib/shared/media-composition/domain/take-timing";
import { resolvePostStudioDraft } from "$lib/shared/media-composition/services/post-project-backup";
import { readPostDraftRecords } from "$lib/shared/media-composition/services/post-draft-storage";
import { createPostEditorState } from "$lib/shared/media-composition/state/post-editor-state.svelte";

const LABELS = { runThrough: "Run through", slowMo: "Slow mo", card: "Card" };
const SEQUENCE_ID = "seq-reload-history";

function sequence(): SequenceData {
  return {
    id: SEQUENCE_ID,
    displayName: "ΩΛ-XJ",
    steps: Array.from({ length: 8 }, () => ({ duration: 1 })),
  } as unknown as SequenceData;
}

let clock = 1_000;

function openEditor(initialProject?: PostProject) {
  return createPostEditorState({
    getSequence: sequence,
    now: () => (clock += 1),
    ...(initialProject ? { initialProject } : {}),
  });
}

type Editor = ReturnType<typeof openEditor>;

/**
 * The page goes away as a refresh does: pagehide, then the editor closes.
 * The post then reopens the way the page loads its draft. This browser also
 * holds the save before the last one, much as the disk archive holds every
 * save, so the newest save wins here just as it does on the page.
 */
function reload(editor: Editor): PostProject {
  window.dispatchEvent(new Event("pagehide"));
  editor.dispose();
  return resolvePostStudioDraft(SEQUENCE_ID, readPostDraftRecords())!;
}

function addTake(editor: Editor): string {
  editor.addCatalogVideo({
    videoId: "take-1",
    label: "Take",
    url: "https://example.test/take.mp4",
    durationSeconds: 40,
  });
  return editor.takes[0]!.id;
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => vi.restoreAllMocks());

describe("post editor history across a reload", () => {
  it("undoes and redoes steps made before the page reloaded", () => {
    const before = openEditor();
    addTake(before);
    before.setAudio("silent");
    const saved = reload(before);

    const after = openEditor(saved);
    expect(after.project.audio).toBe("silent");
    expect(after.canUndo).toBe(true);
    after.undo();
    expect(after.project.audio).toBe("takes");
    expect(after.takes).toHaveLength(1);
    after.undo();
    expect(after.takes).toHaveLength(0);
    expect(after.canUndo).toBe(false);
    after.redo();
    after.redo();
    expect(after.takes).toHaveLength(1);
    expect(after.project.audio).toBe("silent");
  });

  it("keeps an Undo, and its Redo, when the page reloads right after it", () => {
    const before = openEditor();
    addTake(before);
    before.setAudio("silent");
    before.undo();
    const saved = reload(before);

    // The save from before the Undo is still on file and must not win.
    const after = openEditor(saved);
    expect(after.project.audio).toBe("takes");
    expect(after.canRedo).toBe(true);
    after.redo();
    expect(after.project.audio).toBe("silent");
  });

  it("drops the history when a different save of the post opens", () => {
    const before = openEditor();
    addTake(before);
    before.setAudio("silent");
    const saved = reload(before);

    // A newer draft, from the disk archive or another tab, wins the reload.
    const newer = {
      ...saved,
      audio: "takes" as const,
      updatedAt: saved.updatedAt + 5_000,
    };
    const after = openEditor(newer);
    expect(after.canUndo).toBe(false);
    expect(after.canRedo).toBe(false);
    expect(after.project.audio).toBe("takes");
    after.dispose();

    // The stale history is gone, not just skipped once.
    expect(openEditor(saved).canUndo).toBe(false);
  });

  it("drops the history when a post saved at the same moment differs", () => {
    const before = openEditor();
    addTake(before);
    before.setAudio("silent");
    const saved = reload(before);

    const after = openEditor({ ...saved, audio: "takes" });
    expect(after.canUndo).toBe(false);
  });

  it("puts the take's timing back when the Tutorial is undone after a reload", () => {
    const before = openEditor();
    const takeId = addTake(before);
    // The run through and the slow part, cut from one recording by hand.
    before.seek(18);
    expect(before.splitAtPlayhead()).toBe(true);
    const parts = before.timing(takeId)!.sections.length;
    expect(before.applyTutorial(LABELS)).toBe(true);
    const saved = reload(before);

    const after = openEditor(saved);
    expect(after.timing(takeId)!.sections).toHaveLength(parts + 1);
    after.undo();
    expect(after.timing(takeId)!.sections).toHaveLength(parts);
    after.redo();
    expect(after.timing(takeId)!.sections).toHaveLength(parts + 1);
  });

  it("loads the timing of a take that Undo brings back after a reload", () => {
    const before = openEditor();
    const takeId = addTake(before);
    before.editTiming(takeId, (timing) =>
      addTakeTap(timing, 2, before.moveBeats)
    );
    before.removeTake(takeId);
    const saved = reload(before);

    const after = openEditor(saved);
    expect(after.timing(takeId)).toBeNull();
    after.undo();
    expect(after.takes.map((take) => take.id)).toEqual([takeId]);
    expect(after.timing(takeId)?.sections[0]?.taps).toEqual([2]);
  });

  it("keeps the history through a save taken from another tab", () => {
    const before = openEditor();
    addTake(before);
    const other = openEditor(before.snapshot);
    other.setAudio("silent");
    other.dispose();
    expect(before.adoptSaved(other.snapshot)).toBe(true);
    const saved = reload(before);

    const after = openEditor(saved);
    expect(after.project.audio).toBe("silent");
    after.undo();
    expect(after.project.audio).toBe("takes");
    expect(after.takes).toHaveLength(1);
  });

  it("keeps editing when the tab cannot hold the history", () => {
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key: string,
      value: string
    ) {
      if (this === sessionStorage)
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      setItem.call(this, key, value);
    });
    const before = openEditor();
    addTake(before);
    before.setAudio("silent");
    expect(before.saveError).toBeNull();
    const saved = reload(before);

    const after = openEditor(saved);
    expect(after.project.audio).toBe("silent");
    expect(after.canUndo).toBe(false);
  });
});
