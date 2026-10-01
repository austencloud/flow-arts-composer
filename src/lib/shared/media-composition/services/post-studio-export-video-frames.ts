import { ALL_FORMATS, Input, UrlSource, VideoSampleSink } from "mediabunny";
import type { VideoSample } from "mediabunny";

interface SourceState {
  input: Input;
  sink: VideoSampleSink;
  canvas: HTMLCanvasElement;
  samples: AsyncGenerator<VideoSample, void, unknown> | null;
  current: VideoSample | null;
  next: VideoSample | null;
  ended: boolean;
  lastTime: number;
}

/** Decode sequentially, retaining only the current frame and its successor. */
export class PostStudioExportVideoFrames {
  private readonly sources = new Map<string, Promise<SourceState>>();
  private disposed = false;
  private readonly onAbort = () => this.dispose();

  constructor(
    private readonly urls: ReadonlyMap<string, string>,
    private readonly signal?: AbortSignal
  ) {
    signal?.addEventListener("abort", this.onAbort, { once: true });
    if (signal?.aborted) this.dispose();
  }

  has(role: string): boolean {
    return this.urls.has(role);
  }

  async frameFor(
    role: string,
    timeSeconds: number
  ): Promise<HTMLCanvasElement> {
    this.checkActive();
    let source = this.sources.get(role);
    if (!source) {
      const url = this.urls.get(role);
      if (!url) throw new Error(`Missing export video source: ${role}`);
      source = this.open(url);
      this.sources.set(role, source);
    }
    const state = await this.wait(source);
    this.checkActive();
    if (state.current && state.lastTime === timeSeconds) return state.canvas;
    if (!state.samples || timeSeconds < state.lastTime) {
      this.closeSamples(state);
      // samples(start) includes the frame covering start, then decodes forward
      // with bounded read-ahead. A one-at-a-time timestamps iterable would stall
      // while the timestamp sink waits for the next keyframe's requests.
      state.samples = state.sink.samples(Math.max(0, timeSeconds));
    }
    if (!state.current) state.current = await this.readNext(state);
    if (!state.next && !state.ended) state.next = await this.readNext(state);
    while (state.next && state.next.timestamp <= timeSeconds + 1e-10) {
      state.current?.close();
      state.current = state.next;
      state.next = null;
      state.next = await this.readNext(state);
    }
    this.checkActive();
    const sample = state.current;
    if (!sample)
      throw new Error(
        `No video frame at ${timeSeconds.toFixed(3)}s for ${role}`
      );
    if (
      state.canvas.width !== sample.displayWidth ||
      state.canvas.height !== sample.displayHeight
    ) {
      state.canvas.width = sample.displayWidth;
      state.canvas.height = sample.displayHeight;
    }
    const context = state.canvas.getContext("2d");
    if (!context) throw new Error("Could not create a video frame canvas");
    sample.draw(context, 0, 0, state.canvas.width, state.canvas.height);
    state.lastTime = timeSeconds;
    return state.canvas;
  }

  private async readNext(state: SourceState): Promise<VideoSample | null> {
    if (state.ended || !state.samples) return null;
    const result = await this.wait(
      state.samples.next().then((result) => {
        if (this.disposed) {
          result.value?.close();
          this.checkActive();
        }
        return result;
      })
    );
    state.ended = Boolean(result.done);
    return result.value ?? null;
  }

  private async open(url: string): Promise<SourceState> {
    const input = new Input({
      formats: ALL_FORMATS,
      source: new UrlSource(url),
    });
    try {
      const track = await input.getPrimaryVideoTrack();
      if (!track || !(await track.canDecode()))
        throw new Error("The source video cannot be decoded for export");
      this.checkActive();
      return {
        input,
        sink: new VideoSampleSink(track),
        canvas: document.createElement("canvas"),
        samples: null,
        current: null,
        next: null,
        ended: false,
        lastTime: -Infinity,
      };
    } catch (error) {
      input.dispose();
      throw error;
    }
  }

  private checkActive(): void {
    if (this.signal?.aborted) throw new Error("Export cancelled");
    if (this.disposed) throw new Error("Video frame decoder is closed");
  }

  private async wait<T>(operation: Promise<T>): Promise<T> {
    const signal = this.signal;
    if (!signal) return operation;
    this.checkActive();
    let abort: () => void = () => undefined;
    const cancelled = new Promise<never>((_, reject) => {
      abort = () => reject(new Error("Export cancelled"));
      signal.addEventListener("abort", abort, { once: true });
    });
    try {
      return await Promise.race([operation, cancelled]);
    } finally {
      signal.removeEventListener("abort", abort);
    }
  }

  private closeSamples(state: SourceState): void {
    void state.samples?.return();
    state.samples = null;
    state.current?.close();
    state.next?.close();
    state.current = null;
    state.next = null;
    state.ended = false;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.signal?.removeEventListener("abort", this.onAbort);
    for (const source of this.sources.values()) {
      void source.then(
        (state) => {
          this.closeSamples(state);
          state.input.dispose();
          state.canvas.width = 0;
          state.canvas.height = 0;
        },
        () => undefined
      );
    }
    this.sources.clear();
  }
}
