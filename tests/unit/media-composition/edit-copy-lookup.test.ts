import { describe, expect, it, vi } from "vitest";
import { findEditCopy } from "../../../src/lib/shared/media-composition/services/edit-copy-lookup";
import {
  PREVIEW_VIDEO_POLICY,
  editCopyPaths,
} from "../../../src/lib/shared/media-composition/domain/preview-video";

const manifest = {
  policy: PREVIEW_VIDEO_POLICY,
  source: { bytes: 1000, width: 2160, height: 3840, durationSeconds: 204.3 },
  copy: { width: 720, height: 1280, durationSeconds: 204.3 },
};

/** A site holding a recording of `bytes` and the given description. */
function site(bytes: number, description: Response) {
  return vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    if (String(url).endsWith(".edit.json")) return description;
    if (init?.method === "HEAD")
      return new Response(null, {
        headers: { "content-length": String(bytes) },
      });
    throw new Error(`unexpected ${String(url)}`);
  }) as unknown as typeof fetch;
}

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
  });

describe("editing copies made ahead of time", () => {
  it("finds the copy beside its recording", async () => {
    const copy = await findEditCopy(
      "/word-videos/omega-full.mp4",
      new AbortController().signal,
      site(1000, json(manifest))
    );
    expect(copy).toEqual({
      url: "/word-videos/omega-full.edit.mp4",
      width: 720,
      height: 1280,
      sourceWidth: 2160,
      sourceHeight: 3840,
      durationSeconds: 204.3,
    });
  });

  it("ignores a copy of a recording that has since been replaced", async () => {
    expect(
      await findEditCopy(
        "/word-videos/omega-full.mp4",
        new AbortController().signal,
        site(999, json(manifest))
      )
    ).toBeNull();
  });

  it("ignores a site that answers with its page, and an older policy", async () => {
    const page = new Response("<!doctype html>", {
      headers: { "content-type": "text/html" },
    });
    for (const description of [
      page,
      json({ ...manifest, policy: "avc-720p-v1" }),
    ])
      expect(
        await findEditCopy(
          "/word-videos/omega-full.mp4",
          new AbortController().signal,
          site(1000, description)
        )
      ).toBeNull();
  });

  it("only looks beside same-site recordings", () => {
    expect(editCopyPaths("/a/b.MOV?x=1")).toEqual({
      video: "/a/b.edit.mp4",
      manifest: "/a/b.edit.json",
    });
    for (const url of [
      "blob:https://localhost/1",
      "https://cdn.example/a.mp4",
      "//cdn/a.mp4",
      "/a/b.edit.mp4",
      "/a/noextension",
    ])
      expect(editCopyPaths(url)).toBeNull();
  });

  it("does not look beside a feature video's media", async () => {
    const request = vi.fn() as unknown as typeof fetch;
    expect(
      await findEditCopy(
        "/api/dev/feature-videos/promo/media/footage/take.mp4",
        new AbortController().signal,
        request
      )
    ).toBeNull();
    expect(request).not.toHaveBeenCalled();
  });
});
