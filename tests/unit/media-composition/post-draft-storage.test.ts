import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmptyPostProject } from "$lib/shared/media-composition/domain/post-project";
import {
  createPostDraftAutosave,
  loadPostDraft,
  readPostDraftRecords,
  savePostDraft,
} from "$lib/shared/media-composition/services/post-draft-storage";

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

function draft(now: number) {
  return createEmptyPostProject({ sequenceId: "draft", now });
}

describe("draft autosave", () => {
  it("serializes edits and never reports saved while a newer edit is waiting", async () => {
    const releases: Array<() => void> = [];
    const save = vi.fn(
      (_project: ReturnType<typeof draft>) =>
        new Promise<void>((resolve) => releases.push(resolve))
    );
    const status = vi.fn();
    const autosave = createPostDraftAutosave(save, status);
    autosave.submit(draft(1));
    autosave.submit(draft(2));
    autosave.submit(draft(3));
    expect(save).toHaveBeenCalledTimes(1);
    releases[0]!();
    await Promise.resolve();
    expect(save.mock.calls[1]?.[0]).toEqual(draft(3));
    expect(status).not.toHaveBeenCalledWith(false, null);
    releases[1]!();
    await Promise.resolve();
    expect(status).toHaveBeenLastCalledWith(false, null);
  });

  it("reports a failed write and retries the intact latest draft", async () => {
    const save = vi
      .fn<(project: ReturnType<typeof draft>) => Promise<void>>()
      .mockRejectedValueOnce(new Error("Disk full"))
      .mockResolvedValueOnce(undefined);
    const status = vi.fn();
    const autosave = createPostDraftAutosave(save, status);
    autosave.submit(draft(2));
    await Promise.resolve();
    expect(status).toHaveBeenLastCalledWith(false, "Disk full");
    autosave.retry();
    await Promise.resolve();
    expect(save).toHaveBeenLastCalledWith(draft(2));
    expect(status).toHaveBeenLastCalledWith(false, null);
  });

  it("restores a disk draft even when browser storage is empty", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            records: [
              {
                key: "tka:post-studio:project:v2:draft",
                value: JSON.stringify(draft(5)),
              },
            ],
          })
        )
      )
    );
    const result = await loadPostDraft("draft");
    expect(result.project?.updatedAt).toBe(5);
    expect(result.diskAvailable).toBe(true);
    expect(result.error).toBeNull();
  });

  it("keeps the browser draft and reports an unavailable disk archive", async () => {
    localStorage.setItem(
      "tka:post-studio:project:v2:draft",
      JSON.stringify(draft(8))
    );
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Offline")));
    const result = await loadPostDraft("draft");
    expect(result.project?.updatedAt).toBe(8);
    expect(result.error).toBe("Offline");
  });

  it("opens the newer browser draft instead of replacing it with an older disk copy", async () => {
    localStorage.setItem(
      "tka:post-studio:project:v2:draft",
      JSON.stringify(draft(20))
    );
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          records: [
            {
              key: "tka:post-studio:project:v2:draft",
              value: JSON.stringify(draft(10)),
            },
          ],
        })
      )
    );
    vi.stubGlobal("fetch", fetch);

    const result = await loadPostDraft("draft");

    expect(result.project?.updatedAt).toBe(20);
    expect(localStorage.getItem("tka:post-studio:project:v2:draft")).toBe(
      JSON.stringify(draft(20))
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[1]).toEqual({ cache: "no-store" });
  });

  it("backs up only Post Studio records and rejects a failed disk save", async () => {
    localStorage.setItem("unrelated", "private data");
    localStorage.setItem(
      "tka:post-studio:project:v2:draft",
      JSON.stringify(draft(9))
    );
    expect(readPostDraftRecords()).toHaveLength(1);
    const fetch = vi.fn().mockResolvedValue(new Response("", { status: 500 }));
    vi.stubGlobal("fetch", fetch);
    await expect(savePostDraft(draft(9))).rejects.toThrow("disk backup failed");
    expect(JSON.parse(fetch.mock.calls[0]?.[1].body).records[0].key).toBe(
      "tka:post-studio:project:v2:draft"
    );
  });
});
