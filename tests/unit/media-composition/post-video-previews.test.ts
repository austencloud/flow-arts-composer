import { flushSync } from "svelte";
import { describe, expect, it, vi } from "vitest";
import type { PreviewVideoState } from "#lib/shared/media-composition/domain/preview-video.js";
import type {
  IPreviewVideoCache,
  PreviewVideoHandle,
} from "#lib/shared/media-composition/services/contracts/IPreviewVideoCache.js";
import {
  createPostVideoPreviewsHarness,
  type HarnessVideoSource,
} from "./post-video-previews-harness.svelte";

const source: HarnessVideoSource = {
  id: "take",
  url: "https://video/original",
  assetKey: "take-v1",
};

function ready(sourceUrl = source.url!): PreviewVideoState {
  return {
    status: "ready",
    sourceUrl,
    url: `blob:proxy-${sourceUrl}`,
    progress: 1,
    width: 1280,
    height: 720,
    sourceWidth: 3840,
    sourceHeight: 2160,
    durationSeconds: 24,
  };
}

function mockHandle(sourceUrl: string, initial?: PreviewVideoState) {
  let state: PreviewVideoState = initial ?? {
    status: "preparing",
    sourceUrl,
    url: sourceUrl,
    progress: 0,
  };
  const callbacks: Array<(state: PreviewVideoState) => void> = [];
  const listeners = new Set<(state: PreviewVideoState) => void>();
  let settle!: (state: PreviewVideoState) => void;
  const settled = new Promise<PreviewVideoState>((resolve) => {
    settle = resolve;
  });
  if (state.status !== "preparing") settle(state);
  const unsubscribe = vi.fn((listener: (state: PreviewVideoState) => void) => {
    listeners.delete(listener);
  });
  function emit(next: PreviewVideoState) {
    state = next;
    if (state.status !== "preparing") settle(state);
    for (const listener of listeners) listener(state);
  }
  const handle: PreviewVideoHandle = {
    getState: () => state,
    ready: settled,
    subscribe: vi.fn((listener) => {
      callbacks.push(listener);
      listeners.add(listener);
      listener(state);
      return () => unsubscribe(listener);
    }),
    reportPlaybackError: vi.fn(() =>
      emit({
        status: "fallback",
        sourceUrl,
        url: sourceUrl,
        progress: 0,
        reason: "Proxy decode failed",
      })
    ),
    release: vi.fn(),
  };
  return { handle, emit, callbacks, unsubscribe };
}

function fixture(
  initialState?: PreviewVideoState,
  initialSources: readonly HarnessVideoSource[] = [source],
  playing = false
) {
  const handles: ReturnType<typeof mockHandle>[] = [];
  const acquire = vi.fn((url: string) => {
    const value = mockHandle(url, initialState);
    handles.push(value);
    return value.handle;
  });
  const cache: IPreviewVideoCache = { acquire };
  const harness = createPostVideoPreviewsHarness(
    initialSources,
    cache,
    playing
  );
  flushSync();
  return { ...harness, handles, acquire };
}

describe("Post Studio video preview bindings", () => {
  it("defers a completed proxy during playback and selects it on pause", () => {
    const harness = fixture(undefined, [source], true);
    try {
      harness.handles[0]!.emit(ready());
      flushSync();
      expect(harness.previews.resolve(source.id, source.url).url).toBe(
        source.url
      );
      harness.setPlaying(false);
      flushSync();
      expect(harness.previews.resolve(source.id, source.url).url).toBe(
        ready().url
      );
      expect(harness.acquire).toHaveBeenCalledTimes(1);
    } finally {
      harness.dispose();
    }
  });

  it("preserves an already selected proxy when playback begins", () => {
    const harness = fixture(ready());
    try {
      expect(harness.previews.resolve(source.id, source.url).url).toBe(
        ready().url
      );
      harness.setPlaying(true);
      flushSync();
      expect(harness.previews.resolve(source.id, source.url).url).toBe(
        ready().url
      );
    } finally {
      harness.dispose();
    }
  });

  it("keeps a cached proxy deferred when the editor opens while playing", () => {
    const harness = fixture(ready(), [source], true);
    try {
      expect(harness.previews.resolve(source.id, source.url).url).toBe(
        source.url
      );
      harness.setPlaying(false);
      flushSync();
      expect(harness.previews.resolve(source.id, source.url).url).toBe(
        ready().url
      );
    } finally {
      harness.dispose();
    }
  });

  it("uses source dimensions for authored geometry and retains them after proxy failure", () => {
    const harness = fixture(ready());
    try {
      expect(harness.previews.resolve(source.id, source.url)).toMatchObject({
        sourceWidth: 3840,
        sourceHeight: 2160,
      });
      harness.setPlaying(true);
      flushSync();
      harness.previews.reportPlaybackError(source.id);
      flushSync();
      expect(
        harness.handles[0]!.handle.reportPlaybackError
      ).toHaveBeenCalledTimes(1);
      expect(harness.previews.resolve(source.id, source.url)).toMatchObject({
        url: source.url,
        sourceWidth: 3840,
        sourceHeight: 2160,
      });
      harness.previews.reportPlaybackError(source.id);
      expect(
        harness.handles[0]!.handle.reportPlaybackError
      ).toHaveBeenCalledTimes(1);
    } finally {
      harness.dispose();
    }
  });

  it("leaves encoding active when an original video reports an error", () => {
    const harness = fixture();
    try {
      harness.previews.reportPlaybackError(source.id);
      expect(
        harness.handles[0]!.handle.reportPlaybackError
      ).not.toHaveBeenCalled();
      expect(harness.handles[0]!.handle.release).not.toHaveBeenCalled();
      harness.handles[0]!.emit(ready());
      flushSync();
      expect(harness.previews.resolve(source.id, source.url).url).toBe(
        ready().url
      );
    } finally {
      harness.dispose();
    }
  });

  it("ignores errors from the original while a ready copy waits for playback to pause", () => {
    const harness = fixture(undefined, [source], true);
    try {
      harness.handles[0]!.emit(ready());
      harness.previews.reportPlaybackError(source.id);
      expect(
        harness.handles[0]!.handle.reportPlaybackError
      ).not.toHaveBeenCalled();
      harness.setPlaying(false);
      flushSync();
      expect(harness.previews.resolve(source.id, source.url).url).toBe(
        ready().url
      );
    } finally {
      harness.dispose();
    }
  });

  it("releases a replaced source and ignores its late ready callback", () => {
    const harness = fixture();
    try {
      const old = harness.handles[0]!;
      const replacement = {
        ...source,
        url: "https://video/replacement",
        assetKey: "take-v2",
      };
      harness.setSources([replacement]);
      flushSync();
      expect(old.handle.release).toHaveBeenCalledTimes(1);
      expect(old.unsubscribe).toHaveBeenCalledTimes(1);
      expect(harness.acquire).toHaveBeenLastCalledWith(
        replacement.url,
        replacement.assetKey
      );
      old.callbacks[0]!(ready());
      flushSync();
      expect(harness.previews.resolve(source.id, replacement.url).url).toBe(
        replacement.url
      );
      expect(harness.previews.resolve(source.id, source.url).url).toBe(
        source.url
      );
      harness.handles[1]!.emit(ready(replacement.url));
      expect(harness.previews.resolve(source.id, replacement.url).url).toBe(
        ready(replacement.url).url
      );
    } finally {
      harness.dispose();
    }
  });

  it("reacquires an in-place source revision and clears old geometry", () => {
    const harness = fixture();
    try {
      harness.handles[0]!.emit(ready());
      harness.replaceSource(source.id, source.url, "take-v2");
      flushSync();
      expect(harness.handles[0]!.handle.release).toHaveBeenCalledTimes(1);
      expect(harness.acquire).toHaveBeenLastCalledWith(source.url, "take-v2");
      expect(harness.previews.resolve(source.id, source.url)).toMatchObject({
        url: source.url,
        sourceWidth: undefined,
        sourceHeight: undefined,
      });
    } finally {
      harness.dispose();
    }
  });

  it("reacquires an in-place source URL change", () => {
    const harness = fixture();
    try {
      harness.replaceSource(
        source.id,
        "https://video/replacement",
        source.assetKey
      );
      flushSync();
      expect(harness.handles[0]!.handle.release).toHaveBeenCalledTimes(1);
      expect(harness.acquire).toHaveBeenLastCalledWith(
        "https://video/replacement",
        source.assetKey
      );
    } finally {
      harness.dispose();
    }
  });

  it("releases removed sources and does not reacquire null media URLs", () => {
    const harness = fixture(undefined, [
      source,
      { id: "empty", url: null, assetKey: "empty" },
    ]);
    try {
      expect(harness.acquire).toHaveBeenCalledTimes(1);
      harness.setSources([{ ...source, url: null }]);
      flushSync();
      expect(harness.handles[0]!.handle.release).toHaveBeenCalledTimes(1);
      expect(harness.previews.resolve(source.id, null).url).toBeNull();
      harness.handles[0]!.callbacks[0]!(ready());
      expect(harness.previews.resolve(source.id, null).url).toBeNull();
      expect(harness.acquire).toHaveBeenCalledTimes(1);
    } finally {
      harness.dispose();
    }
  });

  it("cleans up every lease on root disposal and ignores later notifications", () => {
    const other = {
      id: "other",
      url: "https://video/other",
      assetKey: "other-v1",
    };
    const harness = fixture(undefined, [source, other]);
    harness.dispose();
    for (const value of harness.handles) {
      expect(value.handle.release).toHaveBeenCalledTimes(1);
      expect(value.unsubscribe).toHaveBeenCalledTimes(1);
      value.callbacks[0]!(ready());
    }
    expect(harness.previews.resolve(source.id, source.url)).toEqual({
      url: source.url,
    });
    harness.setSources([source]);
    harness.setPlaying(true);
    flushSync();
    expect(harness.acquire).toHaveBeenCalledTimes(2);
  });
});
