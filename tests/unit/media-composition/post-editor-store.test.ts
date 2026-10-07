import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import {
  createEmptyPostProject,
  type PostProject,
} from "$lib/shared/media-composition/domain/post-project";
import {
  addTakeTap,
  createTakeTiming,
  type TakeTiming,
} from "$lib/shared/media-composition/domain/take-timing";
import {
  createPostEditorHistoryStorage,
  loadPostEditorHistory,
  savePostEditorHistory,
} from "$lib/shared/media-composition/services/post-editor-history-store";
import type { PostEditorStore } from "$lib/shared/media-composition/services/post-editor-store";
import { createPostEditorState } from "$lib/shared/media-composition/state/post-editor-state.svelte";

const NOW = 1_780_000_000_000;
const FEATURE_PREFIX = "tka:feature-video:v1:promo:history:";

const sequence = () =>
  ({
    id: "seq",
    steps: Array.from({ length: 8 }, () => ({ duration: 1 })),
  }) as unknown as SequenceData;

/** Every Post Studio key in this browser's storage. */
function postStudioKeys(): string[] {
  const keys: string[] = [];
  for (const storage of [localStorage, sessionStorage])
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith("tka:post-studio:")) keys.push(key);
    }
  return keys;
}

/** A store that keeps everything in memory and notes each call. */
function memoryStore() {
  const calls: string[] = [];
  const timings = new Map<string, TakeTiming>();
  const history = createPostEditorHistoryStorage("test:memory:history:");
  let saved: PostProject | null = null;
  const store: PostEditorStore = {
    openProject(sequenceId, now) {
      calls.push("openProject");
      return saved ?? createEmptyPostProject({ sequenceId, now });
    },
    saveProject(project) {
      calls.push("saveProject");
      saved = project;
      return { ok: true };
    },
    backupBeforeImport() {
      calls.push("backupBeforeImport");
    },
    loadTiming(sequenceId, takeKey) {
      calls.push("loadTiming");
      return timings.get(`${sequenceId}\n${takeKey}`) ?? null;
    },
    saveTiming(timing) {
      calls.push("saveTiming");
      timings.set(`${timing.sequenceId}\n${timing.takeKey}`, timing);
      return { ok: true };
    },
    openTiming(input) {
      calls.push("openTiming");
      return (
        timings.get(`${input.sequenceId}\n${input.takeKey}`) ??
        createTakeTiming({
          sequenceId: input.sequenceId,
          takeKey: input.takeKey,
          durationSeconds: input.durationSeconds,
          now: input.now,
        })
      );
    },
    loadHistory(head) {
      calls.push("loadHistory");
      return history.load(head);
    },
    saveHistory(entry) {
      calls.push("saveHistory");
      history.save(entry);
    },
  };
  return { store, calls, saved: () => saved };
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("the editor's storage port", () => {
  it("sends every save and load to the store it is given", () => {
    vi.useFakeTimers();
    const memory = memoryStore();
    const editor = createPostEditorState({
      getSequence: sequence,
      now: () => Date.now(),
      store: memory.store,
    });
    editor.addCatalogVideo({
      videoId: "v1",
      label: "v1",
      url: "https://example.test/v1.mp4",
      durationSeconds: 20,
    });
    const takeId = editor.takes[0]?.id ?? "";
    editor.editTiming(takeId, (timing) =>
      addTakeTap(timing, 2, editor.moveBeats)
    );
    editor.undo();
    editor.redo();
    vi.advanceTimersByTime(1_000);
    editor.dispose();
    expect(memory.calls).toEqual(
      expect.arrayContaining([
        "openProject",
        "loadHistory",
        "saveProject",
        "loadTiming",
        "openTiming",
        "saveTiming",
        "saveHistory",
      ])
    );
    expect(memory.saved()?.takes).toHaveLength(1);
    expect(postStudioKeys()).toEqual([]);
  });

  it("backs up through the store before an import", () => {
    const memory = memoryStore();
    const editor = createPostEditorState({
      getSequence: sequence,
      now: () => Date.now(),
      store: memory.store,
    });
    editor.importProject({
      ...createEmptyPostProject({ sequenceId: "seq", now: NOW }),
      audio: "silent",
    });
    expect(memory.calls).toContain("backupBeforeImport");
    expect(postStudioKeys()).toEqual([]);
    editor.dispose();
  });
});

describe("undo history under its own prefix", () => {
  const head = {
    ...createEmptyPostProject({ sequenceId: "seq", now: NOW }),
    updatedAt: NOW + 2,
  };
  const past = [
    { project: createEmptyPostProject({ sequenceId: "seq", now: NOW }) },
  ];

  it("keeps a feature video's history apart from the ordinary post's", () => {
    const feature = createPostEditorHistoryStorage(FEATURE_PREFIX);
    feature.save({ head, past, future: [] });
    expect(sessionStorage.getItem(`${FEATURE_PREFIX}seq`)).not.toBeNull();
    expect(feature.load(head)?.past).toHaveLength(1);
    expect(loadPostEditorHistory(head)).toBeNull();
    expect(postStudioKeys()).toEqual([]);
  });

  it("makes room only among its own histories when the tab is full", () => {
    savePostEditorHistory({ head, past, future: [] });
    const ordinary = sessionStorage.getItem("tka:post-studio:history:v1:seq");
    expect(ordinary).not.toBeNull();
    const realSetItem = Storage.prototype.setItem;
    let failures = 1;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key: string,
      value: string
    ) {
      if (key.startsWith(FEATURE_PREFIX) && failures > 0) {
        failures -= 1;
        throw new DOMException("The tab is full.", "QuotaExceededError");
      }
      return realSetItem.call(this, key, value);
    });
    createPostEditorHistoryStorage(FEATURE_PREFIX).save({
      head,
      past,
      future: [],
    });
    expect(sessionStorage.getItem("tka:post-studio:history:v1:seq")).toBe(
      ordinary
    );
    expect(sessionStorage.getItem(`${FEATURE_PREFIX}seq`)).not.toBeNull();
  });
});
