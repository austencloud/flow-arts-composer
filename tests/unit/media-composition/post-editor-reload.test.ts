import { beforeEach, describe, expect, it } from "vitest";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { createPostEditorState } from "$lib/shared/media-composition/state/post-editor-state.svelte";
import { loadPostProject } from "$lib/shared/media-composition/services/post-project-store";
import {
  projectDraftRecord,
  resolvePostStudioDraft,
} from "$lib/shared/media-composition/services/post-project-backup";

const sequenceId = "post-reload-regression";

function editor() {
  return createPostEditorState({
    getSequence: () => ({ id: sequenceId, steps: [] }) as unknown as SequenceData,
    // A restored draft can be newer than the local clock.
    now: () => 1_000,
  });
}

beforeEach(() => localStorage.clear());

describe("reopening a restored editor state", () => {
  it.each(["undo", "cancel session", "restore backup"] as const)(
    "%s wins over the archived edit without an explicit Save",
    (action) => {
      const state = editor();
      const original = state.project;
      if (action === "cancel session") state.beginSession();
      state.edit((project) => ({ ...project, audio: "silent", updatedAt: 5_000 }));
      const edited = projectDraftRecord(state.snapshot);

      if (action === "undo") state.undo();
      else if (action === "cancel session") state.endSession(false);
      else state.importProject(original);

      const restored = state.snapshot;
      const local = loadPostProject(sequenceId)!;
      expect(restored.updatedAt).toBeGreaterThan(5_000);
      expect(local.updatedAt).toBe(restored.updatedAt);
      const reopened = resolvePostStudioDraft(sequenceId, [
        projectDraftRecord(local),
        edited,
        projectDraftRecord(restored),
      ]);
      expect(reopened?.audio).toBe(original.audio);
      if (action !== "restore backup") expect(state.project).toBe(original);
    }
  );

  it("redo wins over the archived undo while retaining history identities", () => {
    const state = editor();
    const original = state.project;
    state.edit((project) => ({ ...project, audio: "silent", updatedAt: 5_000 }));
    const edited = state.project;
    const archive = [projectDraftRecord(state.snapshot)];
    state.undo();
    expect(state.project).toBe(original);
    const undone = state.snapshot;
    archive.push(projectDraftRecord(undone));
    state.redo();
    expect(state.project).toBe(edited);
    expect(state.snapshot.updatedAt).toBeGreaterThan(undone.updatedAt);
    archive.push(projectDraftRecord(state.snapshot));
    expect(resolvePostStudioDraft(sequenceId, archive)?.audio).toBe("silent");
    expect(loadPostProject(sequenceId)?.updatedAt).toBe(state.snapshot.updatedAt);
  });
});
