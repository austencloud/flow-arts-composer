import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyPostProject } from "#lib/shared/media-composition/domain/post-project.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";
import {
  DEFAULT_TRAIL_SETTINGS,
  TrailMode,
} from "#lib/shared/animation-engine/domain/types/trail-types.js";
import { overlay, project as buildProject } from "./post-project-fixtures";
import {
  loadAccountPostProject,
  readAccountPostProjectPreview,
  listSyncedPostProjects,
  loadSyncedPostDraft,
  resolveSyncedPostSequence,
  saveAccountPostProject,
  saveSyncedPostDraft,
  cancelPostCloudRetries,
} from "#lib/features/post/services/post-account-projects.js";
import {
  loadPostProject,
  savePostProject,
} from "#lib/shared/media-composition/services/post-project-store.js";

const mocks = vi.hoisted(() => ({
  auth: { currentUser: { uid: "owner", isAnonymous: false } },
  read: vi.fn(),
  transaction: vi.fn(),
  set: vi.fn(),
  revision: 0,
  /** The whole cloud document, when a test needs more than its revision. */
  remote: null as Record<string, unknown> | null,
  cachedSource: null as SequenceData | null,
  legacyChoices: [] as {
    sequenceId: string;
    title: string;
    word: string;
    updatedAt: number;
    hasDraft: boolean;
  }[],
}));
vi.mock("#lib/features/post/services/post-workspace-projects.js", () => ({
  listPostProjects: vi.fn(async () => ({
    projects: mocks.legacyChoices,
    error: null,
  })),
  cachePostSequence: vi.fn((sequence: SequenceData) => {
    mocks.cachedSource = sequence;
  }),
  resolvePostSequence: vi
    .fn()
    .mockImplementation(async () => mocks.cachedSource),
}));
vi.mock("#lib/shared/auth/firebase.js", () => ({
  auth: mocks.auth,
  getFirestoreInstance: vi.fn().mockResolvedValue({}),
}));
vi.mock("#lib/shared/auth/state/auth-state.svelte.js", () => ({
  awaitAuthSettled: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("#lib/shared/firestore/index.js", () => ({
  firestoreGetDetailed: mocks.read,
  firestoreList: vi.fn().mockResolvedValue([]),
}));
vi.mock("firebase/firestore", () => ({
  doc: vi.fn((_db, path: string, id: string) => `${path}/${id}`),
  runTransaction: mocks.transaction,
}));

beforeEach(() => {
  mocks.auth.currentUser.uid = "owner";
  mocks.revision = 0;
  mocks.remote = null;
  mocks.cachedSource = null;
  mocks.legacyChoices = [];
  localStorage.clear();
  vi.useRealTimers();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}")));
  mocks.read.mockReset().mockResolvedValue({ status: "absent" });
  mocks.set.mockReset();
  mocks.transaction.mockReset().mockImplementation(async (_db, callback) =>
    callback({
      get: async () =>
        mocks.remote
          ? { exists: () => true, data: () => mocks.remote }
          : mocks.revision
            ? { exists: () => true, data: () => ({ revision: mocks.revision }) }
            : { exists: () => false },
      set: mocks.set,
    })
  );
});

describe("account Post writes", () => {
  const source = (id: string) => ({ id, steps: [{}] }) as SequenceData;
  it("saves and reopens a source-free title with the required empty cloud source", async () => {
    const project = createEmptyPostProject({
      sequenceId: "studio-project:showcase:blank",
      now: 42,
      sourceKind: "none",
      title: "Software tour",
    });
    await loadAccountPostProject("owner", project.sequenceId);
    await saveAccountPostProject("owner", project, null);
    const record = mocks.set.mock.calls.at(-1)![1];
    expect(record.source).toBe("");
    mocks.read.mockResolvedValue({
      status: "found",
      data: { ...record, id: encodeURIComponent(project.sequenceId) },
    });
    expect(await loadAccountPostProject("owner", project.sequenceId)).toEqual(
      project
    );
    expect(
      await readAccountPostProjectPreview("owner", project.sequenceId)
    ).toEqual({ project, source: null });
    expect(mocks.cachedSource).toBeNull();
  });

  it("requires the explicit source-free marker for nullable cloud saves", async () => {
    const project = createEmptyPostProject({ sequenceId: "legacy", now: 1 });
    await expect(
      saveAccountPostProject("owner", project, null)
    ).rejects.toThrow("source sequence is missing");
  });

  it("syncs a local source-free project and keeps it isolated by account", async () => {
    const project = createEmptyPostProject({
      sequenceId: "studio-project:showcase:local",
      now: 42,
      sourceKind: "none",
      title: "Local tour",
    });
    expect(savePostProject(project).ok).toBe(true);
    const owner = await listSyncedPostProjects();
    expect(owner.projects).toEqual([
      expect.objectContaining({
        sequenceId: project.sequenceId,
        title: "Local tour",
      }),
    ]);
    expect(mocks.set.mock.calls.at(-1)?.[1]?.source).toBe("");
    mocks.auth.currentUser.uid = "other";
    const other = await listSyncedPostProjects();
    expect(other.projects).toEqual([]);
  });
  it("claims an unscoped guest Studio draft and its source into the account", async () => {
    const sequenceId = "studio-arrangement:guest-scene";
    const project = createEmptyPostProject({ sequenceId, now: 42 });
    localStorage.setItem(
      `tka:post-studio:project:v2:${sequenceId}`,
      JSON.stringify(project)
    );
    mocks.cachedSource = source(sequenceId);
    mocks.legacyChoices = [
      {
        sequenceId,
        title: "Guest scene",
        word: "",
        updatedAt: 42,
        hasDraft: true,
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ records: [] })))
    );

    await listSyncedPostProjects();

    expect(loadPostProject(sequenceId)?.updatedAt).toBe(42);
    expect(localStorage.getItem("tka:post-studio:legacy-owner:v1")).toBe(
      "owner"
    );
    expect(mocks.set).toHaveBeenCalledWith(
      `users/owner/postProjects/${encodeURIComponent(sequenceId)}`,
      expect.objectContaining({ source: JSON.stringify(source(sequenceId)) })
    );
  });
  it("opens an unclaimed guest Studio draft directly before the project list is visited", async () => {
    const sequenceId = "studio-arrangement:direct-open";
    const project = createEmptyPostProject({ sequenceId, now: 43 });
    localStorage.setItem(
      `tka:post-studio:project:v2:${sequenceId}`,
      JSON.stringify(project)
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 404 }))
    );

    const opened = await loadSyncedPostDraft(sequenceId);

    expect(opened.project?.updatedAt).toBe(43);
    expect(loadPostProject(sequenceId)?.updatedAt).toBe(43);
  });
  it("creates a post only after checking the remote document", async () => {
    const project = createEmptyPostProject({ sequenceId: "post-1", now: 10 });
    await loadAccountPostProject("owner", project.sequenceId);
    await saveAccountPostProject("owner", project, source(project.sequenceId));
    expect(mocks.set).toHaveBeenCalledWith(
      "users/owner/postProjects/post-1",
      expect.objectContaining({ revision: 1, projectUpdatedAt: 10 })
    );
  });

  /** A cloud copy of the post saved somewhere else at `updatedAt`. */
  function savedElsewhere(sequenceId: string, updatedAt: number, revision = 2) {
    const project = createEmptyPostProject({ sequenceId, now: updatedAt });
    mocks.remote = {
      sequenceId,
      project: JSON.stringify(project),
      projectUpdatedAt: updatedAt,
      revision,
    };
    return project;
  }

  it("keeps a later edit saved elsewhere and hands it back", async () => {
    const project = createEmptyPostProject({ sequenceId: "post-2", now: 20 });
    await loadAccountPostProject("owner", project.sequenceId);
    const later = savedElsewhere(project.sequenceId, 50);
    await expect(
      saveAccountPostProject("owner", project, source(project.sequenceId))
    ).resolves.toEqual(later);
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("replaces an older copy saved elsewhere", async () => {
    const project = createEmptyPostProject({ sequenceId: "post-2b", now: 20 });
    savedElsewhere(project.sequenceId, 5);
    await expect(
      saveAccountPostProject("owner", project, source(project.sequenceId))
    ).resolves.toBeNull();
    expect(mocks.set).toHaveBeenCalledWith(
      "users/owner/postProjects/post-2b",
      expect.objectContaining({ revision: 3, projectUpdatedAt: 20 })
    );
  });

  it("never fails a save when the cloud write does not go through, and tries again", async () => {
    vi.useFakeTimers();
    const project = createEmptyPostProject({ sequenceId: "post-4", now: 60 });
    mocks.transaction.mockRejectedValueOnce(new Error("offline"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(
      saveSyncedPostDraft(project, source(project.sequenceId), "owner")
    ).resolves.toBeNull();
    expect(mocks.set).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(mocks.set).toHaveBeenCalledWith(
      "users/owner/postProjects/post-4",
      expect.objectContaining({ projectUpdatedAt: 60 })
    );
  });

  it("drops a waiting retry when another account signs in", async () => {
    vi.useFakeTimers();
    const project = createEmptyPostProject({ sequenceId: "post-4b", now: 60 });
    mocks.transaction.mockRejectedValueOnce(new Error("offline"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await saveSyncedPostDraft(project, source(project.sequenceId), "owner");
    mocks.auth.currentUser.uid = "someone-else";
    await vi.advanceTimersByTimeAsync(16_000);
    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });

  it("cancels every waiting retry on an account change", async () => {
    vi.useFakeTimers();
    const project = createEmptyPostProject({ sequenceId: "post-4c", now: 60 });
    mocks.transaction.mockRejectedValueOnce(new Error("offline"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await saveSyncedPostDraft(project, source(project.sequenceId), "owner");
    cancelPostCloudRetries();
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });

  it("refuses a save bound to an account that is no longer signed in", async () => {
    const project = createEmptyPostProject({ sequenceId: "post-4d", now: 60 });
    mocks.auth.currentUser.uid = "someone-else";
    await expect(
      saveSyncedPostDraft(project, source(project.sequenceId), "owner")
    ).rejects.toThrow("The account changed");
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("puts a later edit from elsewhere on this device when saving", async () => {
    const project = createEmptyPostProject({ sequenceId: "post-5", now: 20 });
    await loadAccountPostProject("owner", project.sequenceId);
    const later = savedElsewhere(project.sequenceId, 70);
    await expect(
      saveSyncedPostDraft(project, source(project.sequenceId), "owner")
    ).resolves.toEqual(later);
    expect(loadPostProject(project.sequenceId)?.updatedAt).toBe(70);
  });

  it("opens a newer save from another site of this computer out of the disk folder", async () => {
    const local = createEmptyPostProject({ sequenceId: "post-7", now: 30 });
    expect(savePostProject(local).ok).toBe(true);
    const onDisk = createEmptyPostProject({ sequenceId: "post-7", now: 80 });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              records: [
                {
                  key: "tka:post-studio:project:v2:post-7",
                  value: JSON.stringify(onDisk),
                },
              ],
            })
          )
      )
    );
    await expect(loadSyncedPostDraft("post-7")).resolves.toMatchObject({
      project: { updatedAt: 80 },
      error: null,
    });
    mocks.read.mockResolvedValue({ status: "unknown" });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(loadSyncedPostDraft("post-7")).resolves.toMatchObject({
      project: { updatedAt: 80 },
      error: null,
    });
  });

  it("opens this device's newer copy, or its copy when the cloud is unreachable, without an error", async () => {
    const local = createEmptyPostProject({ sequenceId: "post-6", now: 90 });
    expect(savePostProject(local).ok).toBe(true);
    const older = createEmptyPostProject({ sequenceId: "post-6", now: 10 });
    mocks.read.mockResolvedValue({
      status: "found",
      data: {
        id: "post-6",
        sequenceId: "post-6",
        project: JSON.stringify(older),
        projectUpdatedAt: 10,
        revision: 1,
      },
    });
    await expect(loadSyncedPostDraft("post-6")).resolves.toMatchObject({
      project: { updatedAt: 90 },
      error: null,
    });
    mocks.read.mockResolvedValue({ status: "unknown" });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(loadSyncedPostDraft("post-6")).resolves.toMatchObject({
      project: { updatedAt: 90 },
      error: null,
    });
  });

  it("does not save when the account changes after the read", async () => {
    const project = createEmptyPostProject({ sequenceId: "post-3", now: 30 });
    await loadAccountPostProject("owner", project.sequenceId);
    mocks.auth.currentUser.uid = "someone-else";
    await expect(
      saveAccountPostProject("owner", project, source(project.sequenceId))
    ).rejects.toThrow("account changed");
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("opens a cloud-only source sequence on a second device", async () => {
    const project = createEmptyPostProject({
      sequenceId: "cloud-post",
      now: 40,
    });
    mocks.read.mockResolvedValue({
      status: "found",
      data: {
        id: "cloud-post",
        sequenceId: "cloud-post",
        project: JSON.stringify(project),
        source: JSON.stringify(source(project.sequenceId)),
        projectUpdatedAt: 40,
        revision: 1,
      },
    });
    await expect(
      resolveSyncedPostSequence(project.sequenceId)
    ).resolves.toEqual(source(project.sequenceId));
  });

  it("restores project effect tuning and complete trails from an account save on another device", async () => {
    const effects = structuredClone(DEFAULT_EFFECTS_CONFIG);
    effects.activeEffect = "trails";
    effects.tipEffectMap = { "*": { effect: "trails" } };
    effects.trails.rainbow = true;
    effects.led.look.shutter.timeConstantSeconds = 0.85;
    const settings = {
      ...structuredClone(DEFAULT_TRAIL_SETTINGS),
      mode: TrailMode.PERSISTENT,
      tailLength: 280,
      fadeDurationMs: 7000,
      previewMode: true,
      glowBlur: 9,
    };
    const appearance = {
      effects,
      trail: {
        enabled: true,
        trackingMode: settings.trackingMode,
        thickness: effects.trails.thickness,
        brightness: effects.trails.brightness,
        tailLength: settings.tailLength,
        leftColor: effects.trails.leftColor,
        rightColor: effects.trails.rightColor,
        settings,
      },
    };
    const project = buildProject([
      overlay("animation", "animation", { animationAppearance: appearance }),
    ]);
    project.sequenceId = "effect-transfer";
    await loadAccountPostProject("owner", project.sequenceId);
    await saveAccountPostProject("owner", project, source(project.sequenceId));
    const record = mocks.set.mock.calls.at(-1)![1];
    mocks.read.mockResolvedValue({
      status: "found",
      data: {
        ...record,
        id: project.sequenceId,
      },
    });
    const restored = await loadAccountPostProject("owner", project.sequenceId);
    expect(restored?.tracks[0]?.items[0]).toMatchObject({
      animationAppearance: appearance,
    });
  });
});
