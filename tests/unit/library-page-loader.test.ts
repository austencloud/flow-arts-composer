import { describe, expect, it, vi } from "vitest";
import { LibraryPageLoader } from "#lib/shared/browse/services/library-page-loader.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

const mocks = vi.hoisted(() => ({ page: vi.fn() }));
vi.mock("#lib/shared/library/get-library-repository.js", () => ({
  getLibraryRepository: () => ({ getSequencePage: mocks.page }),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function row(id: string): SequenceData {
  return { id } as SequenceData;
}

function page(ids: string[], exhausted: boolean) {
  return {
    sequences: ids.map(row),
    nextCursor: { sortValue: ids.at(-1), documentId: ids.at(-1) ?? "" },
    exhausted,
  };
}

describe("account library paging", () => {
  it("publishes the first page while the next request waits and shares it across consumers", async () => {
    const next = deferred<ReturnType<typeof page>>();
    mocks.page
      .mockReset()
      .mockResolvedValueOnce(page(["a"], false))
      .mockReturnValueOnce(next.promise);
    const loader = new LibraryPageLoader(() => "owner");
    const snapshots: string[][] = [];
    loader.subscribe("owner", (snapshot) =>
      snapshots.push(snapshot.rows.map((item) => item.id))
    );
    await Promise.all([loader.load("owner"), loader.load("owner")]);
    expect(loader.snapshot.rows.map((item) => item.id)).toEqual(["a"]);
    expect(loader.snapshot.loading).toBe(true);
    expect(mocks.page).toHaveBeenCalledTimes(2);
    await loader.load("owner");
    expect(mocks.page).toHaveBeenCalledTimes(2);
    next.resolve(page(["b"], true));
    await vi.waitFor(() => expect(loader.snapshot.complete).toBe(true));
    expect(snapshots.at(-1)).toEqual(["a", "b"]);
    await loader.load("owner");
    expect(mocks.page).toHaveBeenCalledTimes(2);
  });

  it("discards an old account response after an identity switch", async () => {
    const old = deferred<ReturnType<typeof page>>();
    mocks.page
      .mockReset()
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce(page(["new"], true));
    let currentUserId = "old";
    const loader = new LibraryPageLoader(() => currentUserId);
    const oldSnapshots: string[][] = [];
    loader.subscribe("old", (snapshot) =>
      oldSnapshots.push(snapshot.rows.map((item) => item.id))
    );
    const oldLoad = loader.load("old");
    const newSnapshots: string[][] = [];
    currentUserId = "new";
    loader.subscribe("new", (snapshot) =>
      newSnapshots.push(snapshot.rows.map((item) => item.id))
    );
    await loader.load("new");
    old.resolve(page(["old"], true));
    await oldLoad;
    expect(loader.snapshot.rows.map((item) => item.id)).toEqual(["new"]);
    expect(oldSnapshots.flat()).not.toContain("new");
    expect(newSnapshots.flat()).not.toContain("old");
  });

  it("drops a background page after sign-out without any mounted subscriber", async () => {
    const pending = deferred<ReturnType<typeof page>>();
    mocks.page
      .mockReset()
      .mockResolvedValueOnce(page(["old"], false))
      .mockReturnValueOnce(pending.promise);
    let currentUserId: string | null = "owner";
    const loader = new LibraryPageLoader(() => currentUserId);
    await loader.load("owner");
    expect(loader.snapshot.rows.map((item) => item.id)).toEqual(["old"]);
    currentUserId = null;
    pending.resolve(page(["foreign"], true));
    await vi.waitFor(() => expect(loader.snapshot.rows).toEqual([]));
    expect(loader.snapshot.complete).toBe(false);
  });

  it("keeps loaded rows on a later page failure and resumes from the cursor", async () => {
    const failure = deferred<ReturnType<typeof page>>();
    mocks.page
      .mockReset()
      .mockResolvedValueOnce(page(["a"], false))
      .mockReturnValueOnce(failure.promise)
      .mockResolvedValueOnce(page(["b"], true));
    const loader = new LibraryPageLoader(() => "owner");
    await loader.load("owner");
    failure.reject(new Error("offline"));
    await vi.waitFor(() => expect(loader.snapshot.error).toBe("offline"));
    expect(loader.snapshot.rows.map((item) => item.id)).toEqual(["a"]);
    await loader.load("owner");
    expect(loader.snapshot.rows.map((item) => item.id)).toEqual(["a", "b"]);
    expect(mocks.page.mock.calls[2]?.[1]).toEqual({
      sortValue: "a",
      documentId: "a",
    });
  });

  it("protects local mutations from a pending page and refreshes on request", async () => {
    const next = deferred<ReturnType<typeof page>>();
    mocks.page
      .mockReset()
      .mockResolvedValueOnce(page(["a"], false))
      .mockReturnValueOnce(next.promise)
      .mockResolvedValueOnce(page(["fresh"], true));
    const loader = new LibraryPageLoader(() => "owner");
    await loader.load("owner");
    loader.remove("owner", "a");
    loader.add("owner", row("added"));
    loader.patch("owner", "b", { name: "renamed" });
    next.resolve(page(["a", "added", "b"], true));
    await vi.waitFor(() => expect(loader.snapshot.complete).toBe(true));
    expect(loader.snapshot.rows.map((item) => item.id)).toEqual(["added", "b"]);
    expect(
      (loader.snapshot.rows[1] as SequenceData & { name?: string }).name
    ).toBe("renamed");
    await loader.load("owner", true);
    expect(loader.snapshot.rows.map((item) => item.id)).toEqual(["fresh"]);
  });

  it("shows cached rows during a stale revalidation and replaces deleted rows", async () => {
    vi.useFakeTimers();
    try {
      mocks.page.mockReset().mockResolvedValueOnce(page(["old"], true));
      const pending = deferred<ReturnType<typeof page>>();
      mocks.page.mockReturnValueOnce(pending.promise);
      const loader = new LibraryPageLoader(() => "owner");
      await loader.load("owner");
      vi.setSystemTime(Date.now() + 61_000);
      const refresh = loader.load("owner");
      expect(loader.snapshot.rows.map((item) => item.id)).toEqual(["old"]);
      pending.resolve(page(["new"], true));
      await refresh;
      expect(loader.snapshot.rows.map((item) => item.id)).toEqual(["new"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the full cached set visible until all refresh pages complete", async () => {
    mocks.page.mockReset().mockResolvedValueOnce(page(["old", "keep"], true));
    const pending = deferred<ReturnType<typeof page>>();
    mocks.page
      .mockResolvedValueOnce(page(["keep"], false))
      .mockReturnValueOnce(pending.promise);
    const loader = new LibraryPageLoader(() => "owner");
    await loader.load("owner");
    await loader.load("owner", true);
    expect(loader.snapshot.rows.map((item) => item.id)).toEqual([
      "old",
      "keep",
    ]);
    pending.resolve(page(["new"], true));
    await vi.waitFor(() => expect(loader.snapshot.complete).toBe(true));
    expect(loader.snapshot.rows.map((item) => item.id)).toEqual([
      "keep",
      "new",
    ]);
  });
});
