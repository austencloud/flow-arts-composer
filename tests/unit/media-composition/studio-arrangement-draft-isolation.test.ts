import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmptyPostProject } from "$lib/shared/media-composition/domain/post-project";

const account = vi.hoisted(() => ({ uid: "account-a" }));
vi.mock("$lib/shared/auth/firebase", () => ({
  auth: { currentUser: { get uid() { return account.uid; }, isAnonymous: false } },
}));

import {
  loadPostDraft, postDraftArchiveRecord, savePostDraft,
} from "$lib/shared/media-composition/services/post-draft-storage";

const sourceId = "studio-arrangement:shared-id";
const project = (now: number) => createEmptyPostProject({ sequenceId: sourceId, now });

afterEach(() => {
  account.uid = "account-a";
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("Studio arrangement disk isolation", () => {
  it("reads only the captured account's archive, even when another account has a newer copy", async () => {
    const other = postDraftArchiveRecord(project(99));
    account.uid = "account-b";
    const selected = postDraftArchiveRecord(project(5));
    account.uid = "account-a";
    const fetch = vi.fn().mockImplementation(async () =>
      new Response(JSON.stringify({ records: [other, selected] })));
    vi.stubGlobal("fetch", fetch);

    const result = await loadPostDraft(sourceId);
    expect(result.project?.updatedAt).toBe(99);
    expect(fetch.mock.calls[0]?.[0]).toContain("sequenceId=account%3Aaccount-a%3Astudio-arrangement%3Ashared-id");

    account.uid = "account-b";
    const otherAccount = await loadPostDraft(sourceId);
    expect(otherAccount.project?.updatedAt).toBe(5);
  });

  it("writes the scoped key and rejects an identity change during archive loading", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetch);
    await savePostDraft(project(7));
    expect(JSON.parse(fetch.mock.calls[0]?.[1].body).records[0].key).toBe(
      "tka:post-studio:project:v2:account:account-a:studio-arrangement:shared-id"
    );

    fetch.mockImplementation(async () => {
      account.uid = "account-b";
      return new Response(JSON.stringify({ records: [postDraftArchiveRecord(project(7))] }));
    });
    account.uid = "account-a";
    const result = await loadPostDraft(sourceId);
    expect(result.project).toBeNull();
    expect(result.error).toMatch(/account changed/);
  });
});
