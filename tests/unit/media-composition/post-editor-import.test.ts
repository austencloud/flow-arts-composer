import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { createPostEditorState } from "$lib/shared/media-composition/state/post-editor-state.svelte";

function editor() {
  return createPostEditorState({
    getSequence: () =>
      ({ id: "import-history", steps: [] }) as unknown as SequenceData,
    now: () => 1234,
  });
}

describe("importing into an existing post", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("backs up the prior post and restores its media with a single undo", () => {
    const state = editor();
    state.addCatalogVideo({
      videoId: "before",
      label: "Before",
      url: "/before.mp4",
      durationSeconds: 10,
    });
    const previous = JSON.parse(JSON.stringify(state.project));
    const imported = {
      ...previous,
      takes: [
        {
          ...previous.takes[0],
          id: "imported",
          takeKey: "imported",
          ref: { kind: "linked", url: "/after.mp4" },
        },
      ],
      tracks: previous.tracks.map(
        (track: { items: Array<Record<string, unknown>> }) => ({
          ...track,
          items: track.items.map((item) => ({
            ...item,
            id: "imported-clip",
            takeId: "imported",
          })),
        })
      ),
    };
    state.importProject(imported);
    expect(state.mediaUrl("imported")).toBe("/after.mp4");
    expect(
      JSON.parse(
        localStorage.getItem(
          "tka:post-studio:project:v2:before-import:import-history"
        )!
      )
    ).toEqual(previous);
    state.undo();
    expect(state.project).toEqual(previous);
    expect(state.mediaUrl(previous.takes[0].id)).toBe("/before.mp4");
    state.redo();
    expect(state.project.takes[0]?.id).toBe("imported");
    expect(state.mediaUrl("imported")).toBe("/after.mp4");
    state.dispose();
  });

  it("leaves the current post intact when the backup cannot be saved", () => {
    const state = editor();
    const previous = state.project;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });
    expect(() =>
      state.importProject({ ...previous, updatedAt: previous.updatedAt + 1 })
    ).toThrow();
    expect(state.project).toBe(previous);
    expect(state.canUndo).toBe(false);
    state.dispose();
  });
});
