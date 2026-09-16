import "fake-indexeddb/auto";
import { Blob as NodeBlob } from "node:buffer";
import { describe, it, expect } from "vitest";
import {
  selectRenderedFilmsToPrune,
  putRenderedFilm,
  getRenderedFilm,
  listRenderedFilms,
  getRenderedFilmsForEntry,
  deleteRenderedFilm,
  pruneRenderedFilms,
  type RenderedFilmRecord,
  type RenderedFilmSummary,
} from "../rendered-film-store";

const render = {
  fps: 60,
  resolution: 1080,
  quality: "standard",
  includeStartPlacement: true,
  includeEndHold: true,
} as const;

function summary(
  id: string,
  createdAt: number,
  byteSize: number
): RenderedFilmSummary {
  return {
    id,
    filmEntryId: null,
    sequenceId: null,
    word: "EHWE",
    mimeType: "video/webm",
    byteSize,
    render: { ...render },
    durationSeconds: 8,
    createdAt,
  };
}

function record(
  id: string,
  createdAt: number,
  filmEntryId: string | null = null,
  byteSize = 1024
): RenderedFilmRecord {
  return {
    ...summary(id, createdAt, byteSize),
    filmEntryId,
    // jsdom's Blob polyfill is invisible to Node's structuredClone (which
    // fake-indexeddb uses to emulate IndexedDB's storage semantics), so a
    // round trip through the fake store silently drops it to `{}`. Node's own
    // Blob survives the clone; see print-pdf-cache.test.ts for the same fix.
    blob: new NodeBlob([new Uint8Array(byteSize)], {
      type: "video/webm",
    }) as unknown as Blob,
  };
}

describe("selectRenderedFilmsToPrune", () => {
  it("keeps the newest maxCount and drops the rest", () => {
    const films = [
      summary("a", 5, 10),
      summary("b", 3, 10),
      summary("c", 4, 10),
      summary("d", 1, 10),
    ];
    const doomed = selectRenderedFilmsToPrune(films, { maxCount: 2 });
    expect(doomed.map((f) => f.id).sort()).toEqual(["b", "d"]);
  });

  it("drops nothing when under both caps", () => {
    const films = [summary("a", 2, 10), summary("b", 1, 10)];
    expect(selectRenderedFilmsToPrune(films, { maxCount: 8, maxBytes: 100 })).toEqual([]);
  });

  it("drops the oldest once the byte budget is exceeded", () => {
    const films = [summary("new", 3, 60), summary("mid", 2, 30), summary("old", 1, 30)];
    const doomed = selectRenderedFilmsToPrune(films, { maxCount: 8, maxBytes: 100 });
    expect(doomed.map((f) => f.id)).toEqual(["old"]);
  });

  it("keeps the newest film even when it alone blows the byte budget", () => {
    const films = [summary("huge", 2, 500), summary("old", 1, 10)];
    const doomed = selectRenderedFilmsToPrune(films, { maxCount: 8, maxBytes: 100 });
    expect(doomed.map((f) => f.id)).toEqual(["old"]);
  });

  it("handles an empty store", () => {
    expect(selectRenderedFilmsToPrune([], { maxCount: 1 })).toEqual([]);
  });
});

describe("rendered film store round trip", () => {
  it("stores, reads, lists newest first, queries by entry, deletes and prunes", async () => {
    await putRenderedFilm(record("r1", 100, "entry-a"));
    await putRenderedFilm(record("r2", 300, "entry-b"));
    await putRenderedFilm(record("r3", 200, "entry-a"));

    const read = await getRenderedFilm("r2");
    expect(read?.word).toBe("EHWE");
    expect(read?.blob.size).toBe(1024);

    const listed = await listRenderedFilms();
    expect(listed.map((f) => f.id)).toEqual(["r2", "r3", "r1"]);
    expect(listed[0]).not.toHaveProperty("blob");

    const forEntry = await getRenderedFilmsForEntry("entry-a");
    expect(forEntry.map((f) => f.id)).toEqual(["r3", "r1"]);

    await deleteRenderedFilm("r3");
    expect(await getRenderedFilm("r3")).toBeNull();

    const pruned = await pruneRenderedFilms({ maxCount: 1 });
    expect(pruned).toBe(1);
    expect((await listRenderedFilms()).map((f) => f.id)).toEqual(["r2"]);
  });
});
