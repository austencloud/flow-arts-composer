import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyPostProject } from "$lib/shared/media-composition/domain/post-project";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import {
  loadAccountPostProject,
  resolveSyncedPostSequence,
  saveAccountPostProject,
} from "$lib/features/post/services/post-account-projects";

const mocks = vi.hoisted(() => ({
  auth: { currentUser: { uid: "owner", isAnonymous: false } },
  read: vi.fn(),
  transaction: vi.fn(),
  set: vi.fn(),
  revision: 0,
  cachedSource: null as SequenceData | null,
}));
vi.mock("$lib/features/post/services/post-workspace-projects", () => ({
  listPostProjects: vi.fn().mockResolvedValue({ projects: [], error: null }),
  cachePostSequence: vi.fn((sequence: SequenceData) => { mocks.cachedSource = sequence; }),
  resolvePostSequence: vi.fn().mockImplementation(async () => mocks.cachedSource),
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
  mocks.cachedSource = null;
  mocks.read.mockReset().mockResolvedValue({ status: "absent" });
  mocks.set.mockReset();
  mocks.transaction.mockReset().mockImplementation(async (_db, callback) =>
    callback({
      get: async () => mocks.revision
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

  it("rejects an unseen newer revision instead of overwriting it", async () => {
    const project = createEmptyPostProject({ sequenceId: "post-2", now: 20 });
    await loadAccountPostProject("owner", project.sequenceId);
    mocks.revision = 2;
    await expect(saveAccountPostProject("owner", project, source(project.sequenceId))).rejects.toThrow("changed on another device");
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("does not save when the account changes after the read", async () => {
    const project = createEmptyPostProject({ sequenceId: "post-3", now: 30 });
    await loadAccountPostProject("owner", project.sequenceId);
    mocks.auth.currentUser.uid = "someone-else";
    await expect(saveAccountPostProject("owner", project, source(project.sequenceId))).rejects.toThrow("account changed");
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("opens a cloud-only source sequence on a second device", async () => {
    const project = createEmptyPostProject({ sequenceId: "cloud-post", now: 40 });
    mocks.read.mockResolvedValue({ status: "found", data: {
      id: "cloud-post",
      sequenceId: "cloud-post",
      project: JSON.stringify(project),
      source: JSON.stringify(source(project.sequenceId)),
      projectUpdatedAt: 40,
      revision: 1,
    } });
    await expect(resolveSyncedPostSequence(project.sequenceId)).resolves.toEqual(source(project.sequenceId));
  });
});
