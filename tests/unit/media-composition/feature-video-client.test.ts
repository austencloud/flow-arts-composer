import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import {
  FEATURE_VIDEO_API,
  FEATURE_VIDEO_FILE_FORMAT,
  type FeatureVideoFile,
} from "$lib/shared/media-composition/domain/feature-video";
import {
  createEmptyPostProject,
  type PostProject,
} from "$lib/shared/media-composition/domain/post-project";
import { applyPostProjectOps } from "$lib/shared/media-composition/domain/post-project-ops";
import { addTakeTap } from "$lib/shared/media-composition/domain/take-timing";
import {
  createFeatureVideoSync,
  listFeatureVideos,
  loadFeatureVideo,
  type FeatureVideoSync,
} from "$lib/shared/media-composition/services/feature-video-client";
import { createPostDraftAutosave } from "$lib/shared/media-composition/services/post-draft-storage";
import { createPostEditorState } from "$lib/shared/media-composition/state/post-editor-state.svelte";

const NOW = 1_780_000_000_000;
const SEQUENCE = "seq";
const VIDEO = {
  videoId: "v1",
  label: "Take one",
  url: "https://example.test/v1.mp4",
  durationSeconds: 20,
};

const sequence = () =>
  ({
    id: SEQUENCE,
    steps: Array.from({ length: 8 }, () => ({ duration: 1 })),
  }) as unknown as SequenceData;

let clock = NOW;
const tick = () => (clock += 1_000);

function featureFile(): FeatureVideoFile {
  return {
    format: FEATURE_VIDEO_FILE_FORMAT,
    slug: "promo",
    title: "Promo",
    revision: 1,
    savedAt: NOW,
    project: createEmptyPostProject({ sequenceId: SEQUENCE, now: NOW }),
  };
}

/** A dev server stand-in that keeps one project.json in memory. */
function fakeServer(initial: FeatureVideoFile) {
  let file = initial;
  const requests: {
    method: string;
    body?: { baseRevision: number; project: PostProject };
  }[] = [];
  const fetcher = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    requests.push({ method, body });
    if (method === "GET") return Response.json({ file });
    if (body.baseRevision !== file.revision)
      return Response.json(
        { message: "promo changed on disk.", revision: file.revision },
        { status: 409 }
      );
    file = {
      ...file,
      revision: file.revision + 1,
      savedAt: tick(),
      project: body.project,
    };
    return Response.json({
      revision: file.revision,
      savedAt: file.savedAt,
      fingerprint: "f",
    });
  }) as typeof fetch;
  return {
    fetcher,
    requests,
    get file() {
      return file;
    },
    /** A save from somewhere else: another editor, the CLI or a hand edit. */
    writeElsewhere(change: Partial<PostProject>) {
      file = {
        ...file,
        revision: file.revision + 1,
        project: { ...file.project, ...change },
      };
    },
  };
}

function openEditor(sync: FeatureVideoSync) {
  return createPostEditorState({
    initialProject: sync.initialProject,
    getSequence: sequence,
    now: tick,
    store: sync.store,
  });
}

/** Every Post Studio key and value in this browser's storage. */
function postStudioEntries(): Record<string, string | null> {
  const entries: Record<string, string | null> = {};
  for (const [name, storage] of [
    ["local", localStorage],
    ["session", sessionStorage],
  ] as const)
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith("tka:post-studio:"))
        entries[`${name}:${key}`] = storage.getItem(key);
    }
  return entries;
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  clock = NOW;
});

describe("a feature video in the Post editor", () => {
  it("never reads or writes the ordinary post for the same sequence", async () => {
    const ordinary = createPostEditorState({
      getSequence: sequence,
      now: tick,
    });
    ordinary.addCatalogVideo(VIDEO);
    ordinary.editTiming(ordinary.takes[0]?.id ?? "", (timing) =>
      addTakeTap(timing, 2, ordinary.moveBeats)
    );
    ordinary.dispose();
    const before = postStudioEntries();
    expect(Object.keys(before).length).toBeGreaterThanOrEqual(3);

    const server = fakeServer(featureFile());
    const sync = createFeatureVideoSync(server.file, {
      fetcher: server.fetcher,
      settleMs: 0,
    });
    const editor = openEditor(sync);
    const disconnect = sync.connect(editor, () => {});
    expect(editor.takes).toEqual([]);
    editor.addCatalogVideo(VIDEO);
    const takeId = editor.takes[0]?.id ?? "";
    editor.editTiming(takeId, (timing) =>
      addTakeTap(timing, 3, editor.moveBeats)
    );
    editor.undoTiming(takeId);
    editor.redoTiming(takeId);
    editor.setAudio("silent");
    editor.undo();
    editor.redo();
    await sync.save(editor.snapshot);
    disconnect();
    editor.dispose();

    expect(server.file.revision).toBe(2);
    expect(server.file.project.takes).toHaveLength(1);
    expect(server.file.project.audio).toBe("silent");
    expect(Object.keys(server.file.project.timings ?? {})).toEqual([takeId]);
    expect(
      sessionStorage.getItem(`tka:feature-video:v1:promo:history:${SEQUENCE}`)
    ).not.toBeNull();
    expect(postStudioEntries()).toEqual(before);
  });

  it("saves from the revision it started at and skips copies disk already has", async () => {
    const server = fakeServer(featureFile());
    const sync = createFeatureVideoSync(server.file, {
      fetcher: server.fetcher,
      settleMs: 0,
    });
    // As the editor does: keep each copy in the tab, then save it.
    const keepAndSave = (project: PostProject) => {
      sync.store.saveProject(project);
      return sync.save(project);
    };
    await keepAndSave({ ...server.file.project, updatedAt: NOW + 7 });
    expect(server.requests).toEqual([]);
    const silent = { ...server.file.project, audio: "silent" as const };
    await keepAndSave(silent);
    await keepAndSave({ ...silent, audio: "takes" as const });
    expect(
      server.requests.map((request) => [
        request.method,
        request.body?.baseRevision,
      ])
    ).toEqual([
      ["PUT", 1],
      ["PUT", 2],
    ]);
    expect(sync.revision).toBe(3);
    expect(server.file.project.audio).toBe("takes");
    // With the saves landed, a reload opens disk's copy.
    expect(createFeatureVideoSync(server.file).initialProject).toEqual(
      server.file.project
    );
  });

  it("loads disk's newer copy on a conflict, and Undo brings back the editor's", async () => {
    const server = fakeServer(featureFile());
    const sync = createFeatureVideoSync(server.file, {
      fetcher: server.fetcher,
      settleMs: 0,
    });
    const editor = openEditor(sync);
    const loaded = vi.fn();
    sync.connect(editor, loaded);
    editor.addCatalogVideo(VIDEO);
    server.writeElsewhere({ audio: "silent" });
    // Saved before the editor's edit, so another tab's copy would be refused.
    expect(editor.adoptSaved(server.file.project)).toBe(false);

    await expect(sync.save(editor.snapshot)).rejects.toThrow("changed on disk");
    await vi.waitFor(() => expect(loaded).toHaveBeenCalledTimes(1));
    expect(editor.takes).toEqual([]);
    expect(editor.project.audio).toBe("silent");
    expect(sync.revision).toBe(2);
    editor.undo();
    expect(editor.takes).toHaveLength(1);
    expect(editor.project.audio).toBe("takes");
    editor.dispose();
  });

  it("takes a newer revision the heartbeat reports, once the editor is free", async () => {
    const server = fakeServer(featureFile());
    const sync = createFeatureVideoSync(server.file, {
      fetcher: server.fetcher,
      settleMs: 0,
    });
    const editor = openEditor(sync);
    const loaded = vi.fn();
    sync.connect(editor, loaded);
    editor.setAudio("silent");
    await sync.save(editor.snapshot);
    await sync.checkRevision(2);
    expect(server.requests.map((request) => request.method)).toEqual(["PUT"]);

    server.writeElsewhere({ audio: "takes" });
    editor.beginGesture();
    await sync.checkRevision(3);
    expect(loaded).not.toHaveBeenCalled();
    expect(sync.revision).toBe(2);
    editor.endGesture();
    await sync.checkRevision(3);
    expect(loaded).toHaveBeenCalledTimes(1);
    expect(editor.project.audio).toBe("takes");
    expect(sync.revision).toBe(3);
    editor.dispose();
  });

  it("drops a save that waited while disk's newer copy loaded", async () => {
    const server = fakeServer(featureFile());
    const sync = createFeatureVideoSync(server.file, {
      fetcher: server.fetcher,
      settleMs: 0,
    });
    const editor = openEditor(sync);
    sync.connect(editor, () => {});
    editor.setAudio("silent");
    server.writeElsewhere({});
    const check = sync.checkRevision(2);
    const waiting = sync.save(editor.snapshot);
    await check;
    await expect(waiting).resolves.toBeNull();
    expect(server.requests.map((request) => request.method)).toEqual(["GET"]);
    expect(server.file.revision).toBe(2);
    expect(editor.project.audio).toBe("takes");
    editor.undo();
    expect(editor.project.audio).toBe("silent");
    editor.dispose();
  });

  it("drops a copy the autosave still held when disk's newer copy loaded", async () => {
    const server = fakeServer(featureFile());
    const sync = createFeatureVideoSync(server.file, {
      fetcher: server.fetcher,
      settleMs: 0,
    });
    const editor = openEditor(sync);
    const loaded = vi.fn();
    sync.connect(editor, loaded);
    const saving: boolean[] = [];
    // The workspace's wiring: its autosave hands each copy to sync.save.
    const autosave = createPostDraftAutosave(
      async (project) => {
        await sync.save(project);
      },
      (busy) => saving.push(busy)
    );
    server.writeElsewhere({ background: "blur" });
    const check = sync.checkRevision(2);
    // Two edits land while the check loads disk's copy. The second copy
    // waits in the autosave, so the sync has not seen it yet.
    editor.setAudio("silent");
    autosave.submit(editor.snapshot);
    editor.edit((project, ctx) => ({
      ...project,
      canvas: "1:1",
      updatedAt: ctx.now,
    }));
    autosave.submit(editor.snapshot);
    await check;
    await vi.waitFor(() => expect(saving.at(-1)).toBe(false));
    expect(loaded).toHaveBeenCalledTimes(1);
    expect(server.requests.map((request) => request.method)).toEqual(["GET"]);
    expect(server.file.revision).toBe(2);
    expect(server.file.project.background).toBe("blur");
    // An edit made after disk's copy loaded saves on top of it.
    editor.setAudio("silent");
    autosave.submit(editor.snapshot);
    await vi.waitFor(() => expect(server.file.revision).toBe(3));
    expect(server.file.project).toMatchObject({
      background: "blur",
      audio: "silent",
    });
    autosave.dispose();
    editor.dispose();
  });

  it("writes nothing when a post with a take added on disk opens", async () => {
    const file = featureFile();
    const server = fakeServer({
      ...file,
      project: applyPostProjectOps(
        file.project,
        [
          {
            op: "add-take",
            url: "/api/dev/feature-videos/promo/media/footage/clip.mp4",
            durationSeconds: 10,
          },
        ],
        { now: NOW + 1 }
      ),
    });
    const sync = createFeatureVideoSync(server.file, {
      fetcher: server.fetcher,
      settleMs: 0,
    });
    const editor = openEditor(sync);
    sync.connect(editor, () => {});
    // The workspace hands the opened post to the autosave once. Opening
    // fills in the new take's timing, which no edit asked to keep.
    await expect(sync.save(editor.snapshot)).resolves.toBeNull();
    expect(server.requests).toEqual([]);
    expect(server.file.revision).toBe(1);
    editor.dispose();
  });

  it("brings back this tab's unsaved copy after a reload, under disk's newer one", async () => {
    const server = fakeServer(featureFile());
    const before = createFeatureVideoSync(server.file, {
      fetcher: server.fetcher,
      settleMs: 0,
    });
    // Kept in the tab; the disk save never ran.
    before.store.saveProject({
      ...server.file.project,
      audio: "silent",
      updatedAt: NOW + 5,
    });
    const reloaded = createFeatureVideoSync(server.file, {
      fetcher: server.fetcher,
      settleMs: 0,
    });
    expect(reloaded.initialProject.audio).toBe("silent");

    server.writeElsewhere({});
    const later = createFeatureVideoSync(server.file, {
      fetcher: server.fetcher,
      settleMs: 0,
    });
    const editor = openEditor(later);
    const loaded = vi.fn();
    later.connect(editor, loaded);
    expect(editor.project.audio).toBe("silent");
    await expect(later.save(editor.snapshot)).rejects.toThrow(
      "changed on disk"
    );
    await vi.waitFor(() => expect(loaded).toHaveBeenCalledTimes(1));
    expect(editor.project.audio).toBe("takes");
    editor.undo();
    expect(editor.project.audio).toBe("silent");
    editor.dispose();
  });

  it("keeps this tab's copy when the disk save fails", async () => {
    const file = featureFile();
    const mine = { ...file.project, audio: "silent" as const };
    const full = createFeatureVideoSync(file, {
      fetcher: (async () =>
        Response.json(
          { message: "The disk is full." },
          { status: 500 }
        )) as typeof fetch,
      settleMs: 0,
    });
    full.store.saveProject(mine);
    await expect(full.save(mine)).rejects.toThrow("The disk is full.");
    const offline = createFeatureVideoSync(file, {
      fetcher: (async () => {
        throw new TypeError("Failed to fetch");
      }) as typeof fetch,
      settleMs: 0,
    });
    await expect(offline.save(mine)).rejects.toThrow("could not be reached");
    expect(createFeatureVideoSync(file).initialProject.audio).toBe("silent");
  });
});

describe("listing and loading", () => {
  it("lists and loads feature videos and passes on the server's message", async () => {
    const file = featureFile();
    const summary = {
      slug: "promo",
      title: "Promo",
      revision: 1,
      savedAt: NOW,
      sequenceId: SEQUENCE,
    };
    const fetcher = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === FEATURE_VIDEO_API)
        return Response.json({ projects: [summary], unreadable: ["broken"] });
      if (url === `${FEATURE_VIDEO_API}/promo`)
        return Response.json({ file, fingerprint: "f", folder: "x" });
      if (url === `${FEATURE_VIDEO_API}/odd`)
        return Response.json({ file: { slug: "odd" } });
      return Response.json(
        { message: "No feature video named missing." },
        { status: 404 }
      );
    }) as typeof fetch;
    expect(await listFeatureVideos(fetcher)).toEqual({
      projects: [summary],
      unreadable: ["broken"],
    });
    expect(await loadFeatureVideo("promo", fetcher)).toEqual(file);
    await expect(loadFeatureVideo("odd", fetcher)).rejects.toThrow(
      "unreadable copy of odd"
    );
    await expect(loadFeatureVideo("missing", fetcher)).rejects.toThrow(
      "No feature video named missing."
    );
  });
});
