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
  vi.useRealTimers();
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
    expect(fetch.mock.calls[0]?.[0]).toBe(
      "/_local/post-studio-drafts?sequenceId=draft"
    );
    expect(fetch.mock.calls[0]?.[1]).toEqual({
      cache: "no-store",
      signal: expect.any(AbortSignal),
    });
  });

  it("times out a request that ignores abort and keeps the latest browser edit", async () => {
    vi.useFakeTimers();
    localStorage.setItem(
      "tka:post-studio:project:v2:draft",
      JSON.stringify(draft(8))
    );
    const fetch = vi.fn().mockImplementation(() => new Promise(() => {}));
    vi.stubGlobal("fetch", fetch);
    const loading = loadPostDraft("draft");
    localStorage.setItem(
      "tka:post-studio:project:v2:draft",
      JSON.stringify(draft(20))
    );
    await vi.advanceTimersByTimeAsync(10_000);
    const result = await loading;
    expect(result.project?.updatedAt).toBe(20);
    expect(result.error).toMatch(/timed out/);
    expect(fetch.mock.calls[0]?.[1].signal.aborted).toBe(true);
  });

  it("times out a body parse that never settles, without applying its late result", async () => {
    vi.useFakeTimers();
    let finishJson!: (value: unknown) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => new Promise((resolve) => (finishJson = resolve)),
      })
    );
    localStorage.setItem(
      "tka:post-studio:project:v2:draft",
      JSON.stringify(draft(20))
    );
    const loading = loadPostDraft("draft");
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(10_000);
    const result = await loading;
    finishJson({
      records: [
        {
          key: "tka:post-studio:project:v2:draft",
          value: JSON.stringify(draft(30)),
        },
      ],
    });
    await Promise.resolve();
    expect(result.project?.updatedAt).toBe(20);
    expect(result.error).toMatch(/timed out/);
    expect(localStorage.getItem("tka:post-studio:project:v2:draft")).toBe(
      JSON.stringify(draft(20))
    );
  });

  it("filters an older unscoped server response by Unicode sequence key", async () => {
    const sequenceId = "ΩΛ-XJ";
    const selected = createEmptyPostProject({ sequenceId, now: 9 });
    const misleading = createEmptyPostProject({ sequenceId, now: 99 });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            records: [
              {
                key: "tka:post-studio:project:v2:ΩΛ-XJ-other",
                value: JSON.stringify(misleading),
              },
              {
                key: "tka:post-studio:project:v2:ΩΛ-XJ",
                value: JSON.stringify(selected),
              },
              {
                key: "tka:post-studio:take-timing:v1:ΩΛ-XJ-other:take",
                value: "{}",
              },
            ],
          })
        )
      )
    );
    const result = await loadPostDraft(sequenceId);
    expect(result.project?.updatedAt).toBe(9);
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(
      "/_local/post-studio-drafts?sequenceId=%CE%A9%CE%9B-XJ"
    );
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
