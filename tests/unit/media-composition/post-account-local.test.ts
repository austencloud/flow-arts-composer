import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyPostProject } from "#lib/shared/media-composition/domain/post-project.js";
import {
  accountPostProjectKeys,
  claimLegacyPosts,
  legacyPostOwner,
  loadPostProject,
  savePostProject,
} from "#lib/shared/media-composition/services/post-project-store.js";
import { readPostDraftRecords } from "#lib/shared/media-composition/services/post-draft-storage.js";
import { listPostProjects } from "#lib/features/post/services/post-workspace-projects.js";

const authMock = vi.hoisted(() => ({ currentUser: null as { uid: string; isAnonymous: boolean } | null }));
vi.mock("#lib/shared/auth/firebase.js", () => ({ auth: authMock }));

beforeEach(() => {
  authMock.currentUser = null;
  localStorage.clear();
});

describe("Post project account isolation", () => {
  it("keeps signed-in local saves separate by account", () => {
    const first = createEmptyPostProject({ sequenceId: "same-post", now: 1 });
    const second = { ...first, updatedAt: 2 };
    authMock.currentUser = { uid: "one", isAnonymous: false };
    expect(savePostProject(first).ok).toBe(true);
    authMock.currentUser = { uid: "two", isAnonymous: false };
    expect(loadPostProject("same-post")).toBeNull();
    expect(savePostProject(second).ok).toBe(true);
    expect(accountPostProjectKeys("one")).toHaveLength(1);
    expect(accountPostProjectKeys("two")).toHaveLength(1);
    authMock.currentUser = { uid: "one", isAnonymous: false };
    expect(loadPostProject("same-post")?.updatedAt).toBe(1);
    authMock.currentUser = null;
    expect(loadPostProject("same-post")).toBeNull();
  });

  it("claims legacy device projects once and hides them from another account", () => {
    const project = createEmptyPostProject({ sequenceId: "old-post", now: 1 });
    expect(savePostProject(project).ok).toBe(true);
    authMock.currentUser = { uid: "one", isAnonymous: false };
    expect(readPostDraftRecords()).toHaveLength(1);
    claimLegacyPosts("one");
    expect(legacyPostOwner()).toBe("one");
    authMock.currentUser = { uid: "two", isAnonymous: false };
    expect(readPostDraftRecords()).toEqual([]);
    expect(() => claimLegacyPosts("two")).toThrow();
    authMock.currentUser = { uid: "one", isAnonymous: false };
    expect(readPostDraftRecords()).toHaveLength(1);
  });

  it("lets a guest save a new post after a prior account claimed old drafts", async () => {
    authMock.currentUser = { uid: "one", isAnonymous: false };
    claimLegacyPosts("one");
    authMock.currentUser = null;
    const guest = createEmptyPostProject({ sequenceId: "guest-post", now: 3 });
    expect(savePostProject(guest).ok).toBe(true);
    expect(loadPostProject("guest-post")).toEqual(guest);
    const catalog = await listPostProjects();
    expect(catalog.projects.map((item) => item.sequenceId)).toEqual(["guest-post"]);
    authMock.currentUser = { uid: "one", isAnonymous: false };
    expect(loadPostProject("guest-post")).toBeNull();
  });
});
