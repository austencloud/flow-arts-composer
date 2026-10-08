import { describe, expect, it } from "vitest";
import {
  FEATURE_VIDEO_FILE_FORMAT,
  type FeatureVideoFile,
} from "$lib/shared/media-composition/domain/feature-video";
import { createEmptyPostProject } from "$lib/shared/media-composition/domain/post-project";
import {
  createFeatureVideoSync,
  saveFeatureVideoExport,
} from "$lib/shared/media-composition/services/feature-video-client";

const SAVED = {
  file: "exports/cut 1.mp4",
  path: "E:/videos/promo/exports/cut 1.mp4",
  bytes: 3,
};

const video = () =>
  new Blob([new Uint8Array([0, 0, 0])], { type: "video/mp4" });

/** A fetch stand-in that answers every request the same way. */
function answering(respond: () => Response) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return respond();
  }) as typeof fetch;
  return { fetcher, calls };
}

describe("saveFeatureVideoExport", () => {
  it("posts the render to the project's exports route", async () => {
    const { fetcher, calls } = answering(() =>
      Response.json(SAVED, { status: 201 })
    );
    await expect(
      saveFeatureVideoExport("promo", video(), { name: "cut 1.mp4", fetcher })
    ).resolves.toEqual(SAVED);
    expect(calls[0]?.url).toBe(
      "/api/dev/feature-videos/promo/exports?name=cut%201.mp4"
    );
    expect(calls[0]?.init).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "video/mp4" },
    });
    expect(calls[0]?.init?.body).toBeInstanceOf(Blob);
  });

  it("passes the dev server's reason on", async () => {
    const { fetcher } = answering(() =>
      Response.json({ message: "That is not an MP4 file." }, { status: 415 })
    );
    await expect(
      saveFeatureVideoExport("promo", video(), { fetcher })
    ).rejects.toThrow("That is not an MP4 file.");
  });

  it("refuses an answer that names no file in exports/", async () => {
    const { fetcher } = answering(() =>
      Response.json({ ...SAVED, file: "promo.mp4" }, { status: 201 })
    );
    await expect(
      saveFeatureVideoExport("promo", video(), { fetcher })
    ).rejects.toThrow(
      "The dev server sent an unreadable answer about the export."
    );
  });

  it("says when the dev server cannot be reached", async () => {
    const { fetcher } = answering(() => {
      throw new TypeError("Failed to fetch");
    });
    await expect(
      saveFeatureVideoExport("promo", video(), { fetcher })
    ).rejects.toThrow("The dev server could not be reached.");
  });

  it("stops the upload when its signal aborts, and says it was cancelled", async () => {
    const cancel = new AbortController();
    const { fetcher, calls } = answering(() => {
      // As fetch does: the abort rejects the request in flight.
      cancel.abort();
      throw new DOMException("The operation was aborted.", "AbortError");
    });
    await expect(
      saveFeatureVideoExport("promo", video(), {
        fetcher,
        signal: cancel.signal,
      })
    ).rejects.toThrow("The save was cancelled.");
    expect(calls[0]?.init?.signal).toBe(cancel.signal);
  });
});

describe("the sync's saveExport", () => {
  const file: FeatureVideoFile = {
    format: FEATURE_VIDEO_FILE_FORMAT,
    slug: "promo",
    title: "Promo",
    revision: 1,
    savedAt: 1,
    project: createEmptyPostProject({ sequenceId: "seq", now: 1 }),
  };

  it("passes the render's signal on, so Cancel can stop the upload", async () => {
    const { fetcher, calls } = answering(() =>
      Response.json(SAVED, { status: 201 })
    );
    const cancel = new AbortController();
    const sync = createFeatureVideoSync(file, { fetcher });
    await expect(
      sync.saveExport(video(), undefined, cancel.signal)
    ).resolves.toEqual(SAVED);
    expect(calls[0]?.init?.signal).toBe(cancel.signal);
  });

  it("sends through the sync's own fetcher and lets the server pick the name", async () => {
    const { fetcher, calls } = answering(() =>
      Response.json(SAVED, { status: 201 })
    );
    const sync = createFeatureVideoSync(file, { fetcher });
    await expect(sync.saveExport(video())).resolves.toEqual(SAVED);
    expect(calls[0]?.url).toBe("/api/dev/feature-videos/promo/exports");
  });
});
