import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyPostProject } from "$lib/shared/media-composition/domain/post-project";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { DEFAULT_EFFECTS_CONFIG } from "$lib/shared/effects/domain/defaults";
import {
  DEFAULT_TRAIL_SETTINGS,
  TrailMode,
} from "$lib/shared/animation-engine/domain/types/trail-types";
import { overlay, project as buildProject } from "./post-project-fixtures";
import {
  loadAccountPostProject,
  loadSyncedPostDraft,
  resolveSyncedPostSequence,
  saveAccountPostProject,
  saveSyncedPostDraft,
} from "$lib/features/post/services/post-account-projects";
import {
  loadPostProject,
  savePostProject,
} from "$lib/shared/media-composition/services/post-project-store";

const mocks = vi.hoisted(() => ({
  auth: { currentUser: { uid: "owner", isAnonymous: false } },
  read: vi.fn(),
  transaction: vi.fn(),
  set: vi.fn(),
  revision: 0,
  /** The whole cloud document, when a test needs more than its revision. */
  remote: null as Record<string, unknown> | null,
  cachedSource: null as SequenceData | null,
}));
vi.mock("$lib/features/post/services/post-workspace-projects", () => ({
  listPostProjects: vi.fn().mockResolvedValue({ projects: [], error: null }),
  cachePostSequence: vi.fn((sequence: SequenceData) => {
    mocks.cachedSource = sequence;
  }),
  resolvePostSequence: vi
    .fn()
    .mockImplementation(async () => mocks.cachedSource),
}));
vi.mock("$lib/shared/auth/firebase", () => ({
  auth: mocks.auth,
  getFirestoreInstance: vi.fn().mockResolvedValue({}),
}));
vi.mock("$lib/shared/auth/state/auth-state.svelte", () => ({
  awaitAuthSettled: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("$lib/shared/firestore", () => ({
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
      saveSyncedPostDraft(project, source(project.sequenceId))
    ).resolves.toBeNull();
    expect(mocks.set).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(mocks.set).toHaveBeenCalledWith(
      "users/owner/postProjects/post-4",
      expect.objectContaining({ projectUpdatedAt: 60 })
    );
  });

  it("puts a later edit from elsewhere on this device when saving", async () => {
    const project = createEmptyPostProject({ sequenceId: "post-5", now: 20 });
    await loadAccountPostProject("owner", project.sequenceId);
    const later = savedElsewhere(project.sequenceId, 70);
    await expect(
      saveSyncedPostDraft(project, source(project.sequenceId))
    ).resolves.toEqual(later);
    expect(loadPostProject(project.sequenceId)?.updatedAt).toBe(70);
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
