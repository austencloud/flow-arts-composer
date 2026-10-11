import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyPostProject } from "#lib/shared/media-composition/domain/post-project.js";
import { createPostEditorState } from "#lib/shared/media-composition/state/post-editor-state.svelte.js";
import { loadPostProject } from "#lib/shared/media-composition/services/post-project-store.js";

const identity = "studio-project:showcase:source-free-test";
const newProject = () =>
  createEmptyPostProject({
    sequenceId: identity,
    sourceKind: "none",
    title: "Fire showcase",
    now: Date.now(),
  });
const open = (initialProject = newProject()) =>
  createPostEditorState({
    getSequence: () => null,
    initialProject,
  });

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: vi.fn(() => "blob:source-free-test"),
    revokeObjectURL: vi.fn(),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("source-free Post Studio state", () => {
  it("places footage, compiles it, and reloads under the stable project identity", () => {
    const editor = open();
    const file = new File(["footage"], "fire.mp4", { type: "video/mp4" });
    expect(editor.addLocalVideo(file, 8)).toBeTruthy();
    expect(editor.project.sequenceId).toBe(identity);
    expect(editor.project.sourceKind).toBe("none");
    expect(editor.project.title).toBe("Fire showcase");
    expect(editor.compiled?.durationSeconds).toBe(8);
    expect(editor.compiled?.preset).toBeTruthy();

    const saved = loadPostProject(identity);
    expect(saved?.tracks[0].items).toHaveLength(1);
    const reopened = open(saved!);
    expect(reopened.project.sequenceId).toBe(identity);
    expect(reopened.project.tracks[0].items).toHaveLength(1);
    expect(reopened.compiled?.durationSeconds).toBe(8);
    editor.dispose();
    reopened.dispose();
  });

  it("compiles a text-only showcase without footage or a sequence", () => {
    const editor = open();
    expect(
      editor.addOverlay({
        kind: "text",
        text: "Tonight",
        at: 0,
        fill: false,
      })
    ).toBeTruthy();
    expect(editor.compiled?.durationSeconds).toBeGreaterThan(0);
    expect(editor.compiled?.texts).toHaveLength(1);
    editor.dispose();
  });

  it("keeps the destination source and identity when importing another project's content", () => {
    const sourceFree = open();
    const legacyBackup = createEmptyPostProject({
      sequenceId: "legacy-sequence",
      now: Date.now(),
    });
    sourceFree.importProject(legacyBackup);
    expect(sourceFree.project.sequenceId).toBe(identity);
    expect(sourceFree.project.sourceKind).toBe("none");
    expect(sourceFree.project.title).toBe("Fire showcase");
    expect(loadPostProject(identity)?.sourceKind).toBe("none");

    const sequenceEditor = createPostEditorState({
      getSequence: () => ({ id: "sequence-destination", steps: [] }),
      initialProject: createEmptyPostProject({
        sequenceId: "sequence-destination",
        now: Date.now(),
      }),
    });
    sequenceEditor.importProject(newProject());
    expect(sequenceEditor.project.sequenceId).toBe("sequence-destination");
    expect(sequenceEditor.project.sourceKind).toBeUndefined();
    sourceFree.dispose();
    sequenceEditor.dispose();
  });
});
