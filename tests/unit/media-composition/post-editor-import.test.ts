import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { createPostEditorState } from "#lib/shared/media-composition/state/post-editor-state.svelte.js";

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
    const previousSnapshot = JSON.parse(JSON.stringify(state.snapshot));
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
    ).toEqual(previousSnapshot);
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

  it("carries a map into a same-media reimport with a new take id and key", () => {
    const state = editor();
    state.addCatalogVideo({
      videoId: "same-media",
      label: "Old label",
      url: "/same.mp4",
      durationSeconds: 10,
    });
    const previous = state.takes[0]!;
    state.editTiming(previous.id, (timing) => ({
      ...timing,
      sections: [{ ...timing.sections[0]!, taps: [2, 4] }],
    }));
    const imported = {
      ...state.project,
      takes: [
        {
          ...previous,
          id: "new-id",
          takeKey: "new-stable-key",
          label: "New label",
        },
      ],
      tracks: state.project.tracks.map((track) => ({
        ...track,
        items: track.items.map((item) =>
          item.kind === "video" ? { ...item, takeId: "new-id" } : item
        ),
      })),
    };
    state.importProject(imported);
    expect(state.timing("new-id")?.takeKey).toBe("new-stable-key");
    expect(state.timing("new-id")?.sections[0]?.taps).toEqual([2, 4]);
    expect(state.snapshot.timings?.["new-id"]?.sections[0]?.taps).toEqual([
      2, 4,
    ]);
  });

  it("takes a newer embedded backup map over the same id's older local map", () => {
    const state = editor();
    state.addCatalogVideo({
      videoId: "same-id",
      label: "Take",
      url: "/same.mp4",
      durationSeconds: 10,
    });
    const take = state.takes[0]!;
    const local = state.timing(take.id)!;
    const backupTiming = {
      ...local,
      updatedAt: local.updatedAt + 100,
      sections: [{ ...local.sections[0]!, taps: [3, 6] }],
    };
    state.importProject({
      ...state.project,
      timings: { [take.id]: backupTiming },
      updatedAt: state.project.updatedAt + 100,
    });
    expect(state.timing(take.id)?.sections[0]?.taps).toEqual([3, 6]);
  });
});
