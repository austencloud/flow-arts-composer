import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { addTakeTap } from "$lib/shared/media-composition/domain/take-timing";
import { createPostEditorState } from "$lib/shared/media-composition/state/post-editor-state.svelte";
import { loadPostProject } from "$lib/shared/media-composition/services/post-project-store";

const sequence = () =>
  ({
    id: "mapped-post",
    steps: Array.from({ length: 8 }, () => ({ duration: 1 })),
  }) as unknown as SequenceData;

function editor(initialProject?: ReturnType<typeof loadPostProject>) {
  return createPostEditorState({
    getSequence: sequence,
    getCatalogVideo: (videoId) => ({
      videoId,
      label: videoId,
      url: `https://example.test/${videoId}.mp4`,
      durationSeconds: 20,
    }),
    now: () => Date.now(),
    ...(initialProject ? { initialProject } : {}),
  });
}

function addTake(state: ReturnType<typeof editor>, videoId: string) {
  state.addCatalogVideo({
    videoId,
    label: videoId,
    url: `https://example.test/${videoId}.mp4`,
    durationSeconds: 20,
  });
  return state.takes.at(-1)!.id;
}

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("post timing persistence", () => {
  it("reopens all maps from the project alone, including an older project without maps", () => {
    const state = editor();
    const first = addTake(state, "first");
    const second = addTake(state, "second");
    for (const id of [first, second]) {
      state.editTiming(id, (timing) => addTakeTap(timing, 2, state.moveBeats));
    }
    const snapshot = state.snapshot;
    expect(Object.keys(snapshot.timings ?? {})).toEqual([first, second]);
    localStorage.clear();
    const reopened = editor(snapshot);
    expect(reopened.timing(first)?.sections[0]?.taps).toEqual([2]);
    expect(reopened.timing(second)?.sections[0]?.taps).toEqual([2]);

    const old = { ...snapshot, timings: undefined };
    const compatible = editor(old);
    expect(compatible.takes).toHaveLength(2);
    expect(compatible.timing(first)?.sections[0]?.taps).toEqual([]);
  });

  it("keeps a newer timing when an older project edit is undone", () => {
    const state = editor();
    const id = addTake(state, "take");
    state.edit((project) => ({
      ...project,
      audio: "silent",
      updatedAt: Date.now(),
    }));
    state.editTiming(id, (timing) => addTakeTap(timing, 3, state.moveBeats));
    state.undo();
    expect(state.timing(id)?.sections[0]?.taps).toEqual([3]);
    expect(
      loadPostProject(sequence().id)?.timings?.[id]?.sections[0]?.taps
    ).toEqual([3]);
  });

  it("reports quota failure while preserving the live map for recovery", () => {
    const state = editor();
    const id = addTake(state, "take");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });
    const before = state.saveRevision;
    state.editTiming(id, (timing) => addTakeTap(timing, 4, state.moveBeats));
    expect(state.saveRevision).toBeGreaterThan(before);
    expect(state.saveError).toMatch(/Quota exceeded/);
    expect(state.snapshot.timings?.[id]?.sections[0]?.taps).toEqual([4]);
  });

  it("saves a cleared map and restores taps when timing undo is chosen", () => {
    const state = editor();
    const id = addTake(state, "take");
    state.editTiming(id, (timing) => addTakeTap(timing, 4, state.moveBeats));
    state.editTiming(id, (timing) => ({
      ...timing,
      sections: [{ ...timing.sections[0]!, taps: [] }],
    }));
    expect(
      loadPostProject(sequence().id)?.timings?.[id]?.sections[0]?.taps
    ).toEqual([]);
    state.undoTiming(id);
    expect(
      loadPostProject(sequence().id)?.timings?.[id]?.sections[0]?.taps
    ).toEqual([4]);
  });

  it("does not reuse a map when an import reuses a take id for different media", () => {
    const state = editor();
    const id = addTake(state, "first");
    state.editTiming(id, (timing) => addTakeTap(timing, 5, state.moveBeats));
    const imported = {
      ...state.snapshot,
      takes: state.takes.map((take) => ({
        ...take,
        takeKey: "catalog:second",
        ref: { kind: "linked" as const, url: "/second.mp4" },
      })),
      timings: undefined,
    };
    state.importProject(imported);
    expect(state.timing(id)?.takeKey).toBe("catalog:second");
    expect(state.timing(id)?.sections[0]?.taps).toEqual([]);
    expect(state.snapshot.timings?.[id]?.takeKey).toBe("catalog:second");
  });
});

describe("saving now", () => {
  it("stamps the post newer, saves it and adds no undo step", () => {
    let clock = 1_000;
    const state = createPostEditorState({
      getSequence: sequence,
      now: () => clock,
    });
    const before = state.project.updatedAt;
    const revision = state.saveRevision;
    clock = 5_000;
    state.saveNow();
    expect(state.project.updatedAt).toBe(5_000);
    expect(state.saveRevision).toBe(revision + 1);
    expect(loadPostProject(sequence().id)?.updatedAt).toBe(5_000);
    expect(state.canUndo).toBe(false);

    clock = before;
    state.saveNow();
    expect(state.project.updatedAt).toBe(5_001);
  });
});
