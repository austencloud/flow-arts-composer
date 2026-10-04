// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PostStudioExportVideoFrames } from "$lib/shared/media-composition/services/post-studio-export-video-frames";

const fake = vi.hoisted(() => ({
  drawn: [] as number[],
  starts: [] as number[],
  closed: [] as ReturnType<typeof vi.fn>[],
  returns: 0,
  disposed: 0,
  pending: false,
  waiting: false,
}));

vi.mock("mediabunny", () => ({
  ALL_FORMATS: [],
  UrlSource: class {
    constructor(public url: string) {}
  },
  Input: class {
    async getPrimaryVideoTrack() {
      return { canDecode: async () => true };
    }
    dispose() {
      fake.disposed++;
    }
  },
  VideoSampleSink: class {
    samples(start: number) {
      fake.starts.push(start);
      const times = [0, 0.04, 0.09, 0.13, 0.2];
      let index = Math.max(
        0,
        times.findLastIndex((time) => time <= start)
      );
      let release: ((value: IteratorResult<unknown>) => void) | undefined;
      return {
        next() {
          if (fake.pending) {
            fake.waiting = true;
            return new Promise((resolve) => {
              release = resolve;
            });
          }
          const timestamp = times[index++];
          if (timestamp === undefined) return Promise.resolve({ done: true });
          const close = vi.fn();
          fake.closed.push(close);
          return Promise.resolve({
            done: false,
            value: {
              timestamp,
              displayWidth: 1920,
              displayHeight: 1080,
              close,
              draw: () => fake.drawn.push(timestamp),
            },
          });
        },
        async return() {
          fake.returns++;
          release?.({ value: undefined, done: true });
          return { done: true };
        },
      };
    }
  },
}));

describe("export source video frames", () => {
  const providers: PostStudioExportVideoFrames[] = [];
  const create = (signal?: AbortSignal) => {
    const frames = new PostStudioExportVideoFrames(
      new Map([["take", "blob:original"]]),
      signal
    );
    providers.push(frames);
    return frames;
  };

  beforeEach(() => {
    fake.drawn = [];
    fake.starts = [];
    fake.closed = [];
    fake.returns = 0;
    fake.disposed = 0;
    fake.pending = false;
    fake.waiting = false;
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      {} as CanvasRenderingContext2D
    );
  });
  afterEach(async () => {
    providers.splice(0).forEach((provider) => provider.dispose());
    await Promise.resolve();
    vi.restoreAllMocks();
  });

  it("selects the frame covering each exact source time across slow playback and skipped frames", async () => {
    const frames = create();
    for (const time of [0.03, 0.04, 0.07, 0.131, 0.24])
      await frames.frameFor("take", time);
    expect(fake.drawn).toEqual([0, 0.04, 0.04, 0.13, 0.2]);
    expect(fake.starts).toEqual([0.03]);
    expect(
      fake.closed.slice(0, -1).every((close) => close.mock.calls.length === 1)
    ).toBe(true);
    frames.dispose();
    await Promise.resolve();
    expect(fake.closed.every((close) => close.mock.calls.length === 1)).toBe(
      true
    );
    expect(fake.disposed).toBe(1);
  });

  it("reuses the canvas for repeated backdrop and layer requests without decoding again", async () => {
    const frames = create();
    const first = await frames.frameFor("take", 0.09);
    const count = fake.closed.length;
    expect(await frames.frameFor("take", 0.09)).toBe(first);
    expect(fake.closed).toHaveLength(count);
    expect(fake.drawn).toEqual([0.09]);
    expect([first.width, first.height]).toEqual([1920, 1080]);
  });

  it("restarts at a backward trim jump and releases the previous decoder samples", async () => {
    const frames = create();
    await frames.frameFor("take", 0.13);
    const oldSamples = [...fake.closed];
    await frames.frameFor("take", 0.04);
    expect(fake.starts).toEqual([0.13, 0.04]);
    expect(fake.drawn).toEqual([0.13, 0.04]);
    expect(fake.returns).toBe(1);
    expect(oldSamples.every((close) => close.mock.calls.length === 1)).toBe(
      true
    );
  });

  it("cancels while a decoder is waiting and releases its source", async () => {
    const controller = new AbortController();
    const frames = create(controller.signal);
    fake.pending = true;
    const pending = frames.frameFor("take", 0.04);
    const assertion = expect(pending).rejects.toThrow("Export cancelled");
    await vi.waitFor(() => expect(fake.waiting).toBe(true));
    controller.abort();
    await assertion;
    expect(fake.returns).toBe(1);
    expect(fake.disposed).toBe(1);
  });
});
