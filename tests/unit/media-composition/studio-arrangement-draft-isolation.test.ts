import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmptyPostProject } from "#lib/shared/media-composition/domain/post-project.js";

const account = vi.hoisted(() => ({ uid: "account-a" as string | null }));
vi.mock("#lib/shared/auth/firebase.js", () => ({
  auth: {
    get currentUser() {
      return account.uid ? { uid: account.uid, isAnonymous: false } : null;
    },
  },
}));

import {
  loadPostDraft,
  postDraftArchiveRecord,
  savePostDraft,
} from "#lib/shared/media-composition/services/post-draft-storage.js";

afterEach(() => {
  account.uid = "account-a";
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe.each([
  "studio-arrangement:shared-id",
  "studio-project:tutorial:shared-id",
  "studio-project:showcase:shared-id",
])("Studio project disk isolation: %s", (sourceId) => {
  const project = (now: number) =>
    createEmptyPostProject({ sequenceId: sourceId, now });
  it("reopens a guest draft from its exact browser key without a disk archive", async () => {
    account.uid = null;
    localStorage.setItem(
      `tka:post-studio:project:v2:${sourceId}`,
      JSON.stringify(project(8))
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 404 }))
    );

    const result = await loadPostDraft(sourceId);
    expect(result.project?.updatedAt).toBe(8);
    expect(result.error).toBeNull();
    expect(result.diskAvailable).toBe(false);
  });

  it("reads only the signed-in account's browser draft", async () => {
    localStorage.setItem(
      `tka:post-studio:project:v2:${sourceId}`,
      JSON.stringify(project(100))
    );
    localStorage.setItem(
      `tka:post-studio:project:v2:account:account-a:${sourceId}`,
      JSON.stringify(project(5))
    );
    localStorage.setItem(
      `tka:post-studio:project:v2:account:account-b:${sourceId}`,
      JSON.stringify(project(99))
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 404 }))
    );

    expect((await loadPostDraft(sourceId)).project?.updatedAt).toBe(5);
    account.uid = "account-b";
    expect((await loadPostDraft(sourceId)).project?.updatedAt).toBe(99);
  });

  it("reads only the captured account's archive, even when another account has a newer copy", async () => {
    const other = postDraftArchiveRecord(project(99));
    account.uid = "account-b";
    const selected = postDraftArchiveRecord(project(5));
    account.uid = "account-a";
    const fetch = vi
      .fn()
      .mockImplementation(
        async () => new Response(JSON.stringify({ records: [other, selected] }))
      );
    vi.stubGlobal("fetch", fetch);

    const result = await loadPostDraft(sourceId);
    expect(result.project?.updatedAt).toBe(99);
    expect(fetch.mock.calls[0]?.[0]).toContain(
      `sequenceId=${encodeURIComponent(`account:account-a:${sourceId}`)}`
    );

    account.uid = "account-b";
    const otherAccount = await loadPostDraft(sourceId);
    expect(otherAccount.project?.updatedAt).toBe(5);
  });

  it("writes the scoped key and rejects an identity change during archive loading", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetch);
    await savePostDraft(project(7));
    expect(JSON.parse(fetch.mock.calls[0]?.[1].body).records[0].key).toBe(
      `tka:post-studio:project:v2:account:account-a:${sourceId}`
    );

    fetch.mockImplementation(async () => {
      account.uid = "account-b";
      return new Response(
        JSON.stringify({ records: [postDraftArchiveRecord(project(7))] })
      );
    });
    account.uid = "account-a";
    const result = await loadPostDraft(sourceId);
    expect(result.project).toBeNull();
    expect(result.error).toMatch(/account changed/);
  });
});
