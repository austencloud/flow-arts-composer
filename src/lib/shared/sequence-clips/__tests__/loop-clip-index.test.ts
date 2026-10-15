import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadLoopClipIndex,
  loopClipUrlFor,
  resetLoopClipIndexForTests,
} from "../loop-clip-index";
import { LOOP_CLIP_RENDERER_VERSION } from "../loop-clip-spec";

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

describe("loadLoopClipIndex", () => {
  beforeEach(() => resetLoopClipIndexForTests());

  it("fetches the versioned index once and shares it", async () => {
    const fetchImpl = vi.fn((_url: string) =>
      Promise.resolve(
        jsonResponse({
          rendererVersion: LOOP_CLIP_RENDERER_VERSION,
          clips: { seq_a: { key: "clips/r1/seq_a.mp4" } },
        })
      )
    );
    const first = await loadLoopClipIndex(fetchImpl as unknown as typeof fetch);
    const second = await loadLoopClipIndex(
      fetchImpl as unknown as typeof fetch
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      `https://assets.tkaflowarts.com/clips/r${LOOP_CLIP_RENDERER_VERSION}/index.json`
    );
    expect(second).toBe(first);
    expect(loopClipUrlFor(first, "seq_a")).toBe(
      "https://assets.tkaflowarts.com/clips/r1/seq_a.mp4"
    );
    expect(loopClipUrlFor(first, "seq_b")).toBeNull();
  });

  it("reads a missing or malformed document as no clips, without retrying", async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(jsonResponse("nope", false)));
    expect(
      await loadLoopClipIndex(fetchImpl as unknown as typeof fetch)
    ).toBeNull();
    expect(
      await loadLoopClipIndex(fetchImpl as unknown as typeof fetch)
    ).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("ignores an index baked by another renderer version", async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(
        jsonResponse({
          rendererVersion: LOOP_CLIP_RENDERER_VERSION + 1,
          clips: {},
        })
      )
    );
    expect(
      await loadLoopClipIndex(fetchImpl as unknown as typeof fetch)
    ).toBeNull();
  });

  it("swallows a network failure", async () => {
    const fetchImpl = vi.fn(() => Promise.reject(new Error("offline")));
    expect(
      await loadLoopClipIndex(fetchImpl as unknown as typeof fetch)
    ).toBeNull();
    expect(loopClipUrlFor(null, "seq_a")).toBeNull();
  });
});
