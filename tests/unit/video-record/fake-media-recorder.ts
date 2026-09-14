/**
 * Controllable MediaRecorder fake.
 *
 * Models the parts of the spec that the recording lifecycle actually depends on:
 * `stop()` flips `state` to "inactive" synchronously, then *queues* the final
 * `dataavailable` followed by `stop`. Nothing is delivered until the test calls
 * `flush()`, so a test can observe the window in which the recorder is already
 * inactive but its last chunk has not arrived yet.
 */

export type FakeRecorderState = "inactive" | "recording" | "paused";

export class FakeMediaRecorder {
  /** MIME types the fake claims support for. Tests mutate this directly. */
  static supported = new Set<string>(["video/webm;codecs=vp9", "video/webm"]);

  /** Every recorder constructed since the last `reset()`, in creation order. */
  static instances: FakeMediaRecorder[] = [];

  static isTypeSupported(type: string): boolean {
    return FakeMediaRecorder.supported.has(type);
  }

  static reset(): void {
    FakeMediaRecorder.instances = [];
    FakeMediaRecorder.supported = new Set([
      "video/webm;codecs=vp9",
      "video/webm",
    ]);
  }

  state: FakeRecorderState = "inactive";
  mimeType: string;
  videoBitsPerSecond: number;
  timeslice: number | undefined;

  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;

  /** Chunk payloads handed to the consumer, in delivery order. */
  delivered: string[] = [];

  private pending: Array<() => void> = [];
  private chunkCounter = 0;

  constructor(
    public stream: MediaStream,
    options: { mimeType?: string; videoBitsPerSecond?: number } = {}
  ) {
    if (
      options.mimeType &&
      !FakeMediaRecorder.isTypeSupported(options.mimeType)
    ) {
      throw new DOMException(
        `${options.mimeType} is not supported`,
        "NotSupportedError"
      );
    }
    this.mimeType = options.mimeType ?? "video/webm";
    this.videoBitsPerSecond = options.videoBitsPerSecond ?? 0;
    FakeMediaRecorder.instances.push(this);
  }

  /** Label prefix so chunks from different sessions are distinguishable. */
  get sessionLabel(): string {
    return `s${FakeMediaRecorder.instances.indexOf(this) + 1}`;
  }

  start(timeslice?: number): void {
    this.state = "recording";
    this.timeslice = timeslice;
  }

  pause(): void {
    if (this.state === "recording") this.state = "paused";
  }

  resume(): void {
    if (this.state === "paused") this.state = "recording";
  }

  /** Spec behaviour: inactive immediately, final chunk + stop queued. */
  stop(): void {
    if (this.state === "inactive") return;
    this.state = "inactive";
    const payload = this.nextChunkPayload();
    this.pending.push(() => this.deliver(payload));
    this.pending.push(() => this.onstop?.());
  }

  /**
   * The recorder ending on its own (camera track ended, quota hit). Same
   * observable shape as `stop()` — this is what the browser does without the
   * application asking.
   */
  endOnItsOwn(): void {
    this.stop();
  }

  /** Deliver one timeslice chunk immediately, as happens mid-recording. */
  emitChunk(): string {
    const payload = this.nextChunkPayload();
    this.deliver(payload);
    return payload;
  }

  raiseError(message = "recorder failed"): void {
    this.onerror?.({ error: new DOMException(message, "UnknownError") });
  }

  /** Dispatch every queued event, in order. */
  flush(): void {
    const queued = this.pending;
    this.pending = [];
    for (const task of queued) task();
  }

  get hasPendingEvents(): boolean {
    return this.pending.length > 0;
  }

  private nextChunkPayload(): string {
    this.chunkCounter += 1;
    return `${this.sessionLabel}-chunk${this.chunkCounter}`;
  }

  private deliver(payload: string): void {
    this.delivered.push(payload);
    this.ondataavailable?.({
      data: new Blob([payload], { type: this.mimeType }),
    });
  }
}

/** A stream stub; the recorder never inspects it. */
export function fakeStream(): MediaStream {
  return { id: "fake-stream", getTracks: () => [] } as unknown as MediaStream;
}
