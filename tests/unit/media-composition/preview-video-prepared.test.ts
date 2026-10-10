import { afterEach, describe, expect, it, vi } from "vitest";
import { findPreparedPreview } from "../../../src/lib/shared/media-composition/get-preview-video-cache";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the editing copy beside a take's video", () => {
  it("does not look beside a feature video's media", async () => {
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    expect(
      await findPreparedPreview(
        "/api/dev/feature-videos/promo/media/footage/take.mp4",
        new AbortController().signal
      )
    ).toBeNull();
    expect(request).not.toHaveBeenCalled();
  });

  it("still looks beside any other same-site recording", async () => {
    const request = vi.fn(async () => new Response("", { status: 404 }));
    vi.stubGlobal("fetch", request);
    expect(
      await findPreparedPreview(
        "/word-videos/omega-full.mp4",
        new AbortController().signal
      )
    ).toBeNull();
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(
      "/word-videos/omega-full.edit.json",
      expect.anything()
    );
  });
});
