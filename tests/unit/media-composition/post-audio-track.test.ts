import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUDIO_DOWNLOAD_STALL_MS,
  AudioDownloadStalledError,
  buildMixedAudioTrack,
} from "#lib/shared/media-composition/services/post-audio-track.js";

const SAMPLE_RATE = 8_000;
const FILE_BYTES = 1_000;

/** The rate of every decoding context made, in order. */
let contextRates: number[] = [];
/** Whether decodeAudioData refuses the next files, as it does a broken one. */
let unreadable = false;

// decodeAudioData is the browser's job. Every file decodes to three seconds
// of a steady 0.5, so a segment that received its take's sound is never
// silent. Like the browser's, it hands back samples at its context's rate.
class FakeOfflineAudioContext {
  constructor(
    _channels: number,
    _length: number,
    readonly sampleRate: number
  ) {
    contextRates.push(sampleRate);
  }

  async decodeAudioData(_buffer: ArrayBuffer) {
    if (unreadable) throw new DOMException("Unable to decode", "EncodingError");
    const samples = new Float32Array(this.sampleRate * 3).fill(0.5);
    return {
      sampleRate: this.sampleRate,
      numberOfChannels: 1,
      getChannelData: () => samples,
    };
  }
}

function abortError(): DOMException {
  return new DOMException("The operation was aborted.", "AbortError");
}

/** A body that sends its first chunk and then nothing, like a stream whose
 *  HTTP/2 connection has no receive window left. Aborting ends it the way a
 *  real fetch does. */
function stalledResponse(signal: AbortSignal): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(100));
      signal.addEventListener("abort", () => controller.error(abortError()));
    },
  });
  return new Response(body, {
    headers: { "content-length": String(FILE_BYTES) },
  });
}

function fullResponse(): Response {
  return new Response(new Uint8Array(FILE_BYTES), {
    headers: { "content-length": String(FILE_BYTES) },
  });
}

async function wavSampleAt(blob: Blob, seconds: number): Promise<number> {
  const view = new DataView(await blob.arrayBuffer());
  return view.getInt16(44 + Math.round(seconds * SAMPLE_RATE) * 4, true);
}

describe("buildMixedAudioTrack", () => {
  beforeEach(() => {
    contextRates = [];
    unreadable = false;
    vi.stubGlobal("OfflineAudioContext", FakeOfflineAudioContext);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("downloads a recording once when two takes cut from it", async () => {
    const fetchMock = vi.fn(async () => fullResponse());
    vi.stubGlobal("fetch", fetchMock);
    const progress: number[] = [];

    const blob = await buildMixedAudioTrack({
      segments: [
        {
          takeId: "demo",
          postStartSeconds: 0,
          sourceInSeconds: 0,
          durationSeconds: 1,
        },
        {
          takeId: "breakdown",
          postStartSeconds: 1,
          sourceInSeconds: 1,
          durationSeconds: 1,
        },
      ],
      durationSeconds: 2,
      takeUrls: new Map([
        ["demo", "/word-videos/woods-full.mp4"],
        ["breakdown", "/word-videos/woods-full.mp4"],
      ]),
      sampleRate: SAMPLE_RATE,
      onProgress: (fraction) => progress.push(fraction),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(blob).not.toBeNull();
    expect(await wavSampleAt(blob!, 0.5)).toBeGreaterThan(16_000);
    expect(await wavSampleAt(blob!, 1.5)).toBeGreaterThan(16_000);
    expect(progress.at(-1)).toBe(1);
  });

  it("fails with a stall error when a take's file stops arriving", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const signals: AbortSignal[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        signals.push(init.signal!);
        return stalledResponse(init.signal!);
      })
    );

    const result = buildMixedAudioTrack({
      segments: [
        {
          takeId: "demo",
          postStartSeconds: 0,
          sourceInSeconds: 0,
          durationSeconds: 1,
        },
      ],
      durationSeconds: 1,
      takeUrls: new Map([["demo", "/word-videos/woods-full.mp4"]]),
      sampleRate: SAMPLE_RATE,
    });
    const settled = result.catch((error: unknown) => error);

    await vi.advanceTimersByTimeAsync(AUDIO_DOWNLOAD_STALL_MS - 1);
    expect(signals[0]?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    expect(await settled).toBeInstanceOf(AudioDownloadStalledError);
    expect(signals[0]?.aborted).toBe(true);
  });

  it("decodes each file at the mix's own rate, so nothing is resampled twice", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => fullResponse())
    );
    await buildMixedAudioTrack({
      segments: [
        {
          takeId: "demo",
          postStartSeconds: 0,
          sourceInSeconds: 0,
          durationSeconds: 1,
        },
      ],
      durationSeconds: 1,
      takeUrls: new Map([["demo", "/word-videos/woods-full.mp4"]]),
      sampleRate: SAMPLE_RATE,
    });
    expect(contextRates).toEqual([SAMPLE_RATE]);
  });

  it("fails the render when the music cannot be read, where a take's sound goes quiet", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => fullResponse())
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});
    unreadable = true;
    const take = await buildMixedAudioTrack({
      segments: [
        {
          takeId: "demo",
          postStartSeconds: 0,
          sourceInSeconds: 0,
          durationSeconds: 1,
        },
      ],
      durationSeconds: 1,
      takeUrls: new Map([["demo", "/word-videos/woods-full.mp4"]]),
      sampleRate: SAMPLE_RATE,
    });
    expect(await wavSampleAt(take!, 0.5)).toBe(0);

    const music = "/api/dev/feature-videos/promo/media/music/derail.wav";
    await expect(
      buildMixedAudioTrack({
        segments: [
          {
            takeId: "music:music-1",
            postStartSeconds: 0,
            sourceInSeconds: 0,
            durationSeconds: 1,
          },
        ],
        durationSeconds: 1,
        takeUrls: new Map([["music:music-1", music]]),
        required: new Set(["music:music-1"]),
        sampleRate: SAMPLE_RATE,
      })
    ).rejects.toThrow(`Could not read the sound in ${music}`);
  });
});
