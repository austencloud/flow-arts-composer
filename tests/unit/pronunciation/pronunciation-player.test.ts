// @vitest-environment jsdom
//
// The player reads `window.AudioContext` and resolves clip URLs against
// `window.location.href`. Under the default node environment `window` does not
// exist at all, so `getAudioContext` returns null and every test silently
// observes the speech fallback no matter which resolver would have run.
import { afterEach, describe, expect, it, vi } from "vitest";

import { PronunciationPlayer } from "#lib/shared/pronunciation/services/pronunciation-player.js";

function manifestResponse(recordings: Record<string, Record<string, string>>) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ version: 1, recordings }),
  } as Response;
}

/**
 * jsdom has no Web Audio, so `getAudioContext` returns null and the player
 * bails out of `tryRecordedPlayback` before it ever resolves a path. Every
 * test that does not install this fake is therefore blind to which resolver
 * ran — it can only observe the speech fallback. These fakes are the minimum
 * surface `playBuffers` touches, with `onended` fired on the microtask queue
 * so the playback promise settles.
 */
class FakeBufferSource {
  buffer: unknown = null;
  onended: (() => void) | null = null;
  connect(): void {}
  start(): void {
    queueMicrotask(() => this.onended?.());
  }
  stop(): void {}
}

class FakeAudioContext {
  state = "running";
  currentTime = 0;
  destination = {};
  createBufferSource(): FakeBufferSource {
    return new FakeBufferSource();
  }
  async decodeAudioData(): Promise<unknown> {
    return { duration: 0.3 };
  }
  async resume(): Promise<void> {}
}

function installFakeAudio(): void {
  (window as unknown as Record<string, unknown>).AudioContext =
    FakeAudioContext;
}

/**
 * Serves the manifest for the manifest URL and empty audio bytes for anything
 * else, recording every clip URL the player asked for so a test can assert
 * which token was selected.
 */
function audioFetcher(manifest: unknown) {
  const requested: string[] = [];
  const fetcher = vi.fn(async (url: string) => {
    if (url.includes("manifest.json")) {
      return { ok: true, status: 200, json: async () => manifest } as Response;
    }
    requested.push(url);
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () => new ArrayBuffer(8),
    } as Response;
  });
  return { fetcher, requested };
}

function silentFallback() {
  return {
    isSupported: () => true,
    speak: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn(),
  };
}

const measurements = {
  durationMs: 300,
  rmsDb: -18,
  f0StartHz: 120,
  f0EndHz: 120,
};

function isolatedToken(path: string) {
  return {
    path,
    position: "isolated",
    previousLetter: null,
    nextLetter: null,
    sourceWord: "A",
    indexInWord: 0,
    groupLength: 1,
    ...measurements,
  };
}

function initialToken(path: string, nextLetter: string) {
  return {
    path,
    position: "initial",
    previousLetter: null,
    nextLetter,
    sourceWord: `A${nextLetter}`,
    indexInWord: 0,
    groupLength: 2,
    ...measurements,
  };
}

function finalToken(path: string, previousLetter: string) {
  return {
    path,
    position: "final",
    previousLetter,
    nextLetter: null,
    sourceWord: `${previousLetter}B`,
    indexInWord: 1,
    groupLength: 2,
    ...measurements,
  };
}

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).AudioContext;
  vi.restoreAllMocks();
});

describe("PronunciationPlayer speech fallback", () => {
  it("uses one natural-language utterance when recordings are incomplete", async () => {
    const speechFallback = {
      isSupported: () => true,
      speak: vi.fn().mockResolvedValue(undefined),
      cancel: vi.fn(),
    };
    const fetcher = vi.fn().mockResolvedValue(
      manifestResponse({
        a: { initial: "a/initial.wav" },
      })
    );
    const player = new PronunciationPlayer({ speechFallback, fetcher });

    await expect(player.speak("AΣ-")).resolves.toEqual({
      source: "synthetic",
    });
    expect(speechFallback.speak).toHaveBeenCalledWith("A, Sigma dash.");
    expect(speechFallback.speak).toHaveBeenCalledTimes(1);
  });

  it("caches the versioned manifest across words", async () => {
    const speechFallback = {
      isSupported: () => true,
      speak: vi.fn().mockResolvedValue(undefined),
      cancel: vi.fn(),
    };
    const fetcher = vi.fn().mockResolvedValue(manifestResponse({}));
    const player = new PronunciationPlayer({ speechFallback, fetcher });

    await player.speak("A");
    await player.speak("B");

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(speechFallback.speak).toHaveBeenNthCalledWith(1, "A.");
    expect(speechFallback.speak).toHaveBeenNthCalledWith(2, "B.");
  });

  it("rejects unknown notation before starting audio", async () => {
    const speechFallback = {
      isSupported: () => true,
      speak: vi.fn().mockResolvedValue(undefined),
      cancel: vi.fn(),
    };
    const fetcher = vi.fn().mockResolvedValue(manifestResponse({}));
    const player = new PronunciationPlayer({ speechFallback, fetcher });

    await expect(player.speak("A?B")).rejects.toThrow(
      "Cannot pronounce invalid TKA word"
    );
    expect(fetcher).not.toHaveBeenCalled();
    expect(speechFallback.speak).not.toHaveBeenCalled();
  });
});

describe("PronunciationPlayer manifest versions", () => {
  function tokenBankResponse(tokens: Record<string, unknown[]>) {
    return {
      ok: true,
      status: 200,
      json: async () => ({ version: 2, tokens }),
    } as Response;
  }

  it("accepts a version 2 bank and still caches it across words", async () => {
    const speechFallback = {
      isSupported: () => true,
      speak: vi.fn().mockResolvedValue(undefined),
      cancel: vi.fn(),
    };
    const fetcher = vi.fn().mockResolvedValue(
      tokenBankResponse({
        a: [
          {
            path: "a/1.wav",
            position: "isolated",
            previousLetter: null,
            nextLetter: null,
            sourceWord: "A",
            indexInWord: 0,
            groupLength: 1,
            durationMs: 300,
            rmsDb: -18,
            f0StartHz: 120,
            f0EndHz: 120,
          },
        ],
      })
    );
    const player = new PronunciationPlayer({ speechFallback, fetcher });

    await player.speak("A");
    await player.speak("B");

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("falls back to speech when a version 2 bank cannot cover the word", async () => {
    const speechFallback = {
      isSupported: () => true,
      speak: vi.fn().mockResolvedValue(undefined),
      cancel: vi.fn(),
    };
    const fetcher = vi.fn().mockResolvedValue(tokenBankResponse({}));
    const player = new PronunciationPlayer({ speechFallback, fetcher });

    await expect(player.speak("AB")).resolves.toEqual({ source: "synthetic" });
    expect(speechFallback.speak).toHaveBeenCalledWith("A, B.");
  });

  it("selects a version 2 token by cost rather than by order", async () => {
    // Without a fake AudioContext the player bails out before resolving any
    // path, so this is the only test that proves `selectTokenPath` is wired to
    // version 2 at all. The better token is deliberately second: an
    // implementation that took the first token of the letter, or that fell
    // through to the version 1 resolver, would request `a/wrong.wav`.
    //
    // The two candidates differ by recorded neighbour, which is a state a real
    // bank actually produces. An earlier version of this test discriminated on
    // an isolated token carrying `groupLength: 5` — impossible by construction,
    // so the proof rested on a fixture that could never exist.
    installFakeAudio();
    const speechFallback = silentFallback();
    const { fetcher, requested } = audioFetcher({
      version: 2,
      tokens: {
        a: [
          initialToken("a/wrong.wav", "C"),
          initialToken("a/right.wav", "B"),
        ],
        b: [finalToken("b/1.wav", "A")],
      },
    });
    const player = new PronunciationPlayer({ speechFallback, fetcher });

    await expect(player.speak("AB")).resolves.toEqual({ source: "recorded" });

    expect(requested).toHaveLength(2);
    expect(requested[0]).toContain("a/right.wav");
    expect(speechFallback.speak).not.toHaveBeenCalled();
  });

  it("still resolves version 1 recordings once audio is available", async () => {
    installFakeAudio();
    const speechFallback = silentFallback();
    const { fetcher, requested } = audioFetcher({
      version: 1,
      recordings: { a: { isolated: "a/isolated.wav" } },
    });
    const player = new PronunciationPlayer({ speechFallback, fetcher });

    await expect(player.speak("A")).resolves.toEqual({ source: "recorded" });

    expect(requested[0]).toContain("a/isolated.wav");
    expect(speechFallback.speak).not.toHaveBeenCalled();
  });

  it("falls back to speech when a version 2 bank cannot cover a longer word", async () => {
    // Same fixture as above, but "AB" needs a `b` the bank does not carry.
    // Proves the fallback is a real selection failure rather than the missing
    // AudioContext masking every path.
    installFakeAudio();
    const speechFallback = silentFallback();
    const { fetcher, requested } = audioFetcher({
      version: 2,
      tokens: { a: [isolatedToken("a/right.wav")] },
    });
    const player = new PronunciationPlayer({ speechFallback, fetcher });

    await expect(player.speak("AB")).resolves.toEqual({ source: "synthetic" });

    expect(requested).toHaveLength(0);
    expect(speechFallback.speak).toHaveBeenCalledWith("A, B.");
  });

  it("falls back to speech when the manifest shape is unrecognised", async () => {
    const speechFallback = {
      isSupported: () => true,
      speak: vi.fn().mockResolvedValue(undefined),
      cancel: vi.fn(),
    };
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ version: 9, whatever: true }),
    } as Response);
    const player = new PronunciationPlayer({ speechFallback, fetcher });

    await expect(player.speak("A")).resolves.toEqual({ source: "synthetic" });
  });
});
