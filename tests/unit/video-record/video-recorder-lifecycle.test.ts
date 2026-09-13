/**
 * Recording lifecycle integrity.
 *
 * Drives the real VideoRecorder against a controllable MediaRecorder fake. The
 * silent failures here are the ones a user cannot see: a stop that resolves
 * before the last chunk arrives loses the tail of the performance, a second
 * stop press strands the first caller forever, and paused wall-clock time
 * inflates the duration that gets written to Firestore.
 */

import "fake-indexeddb/auto";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { VideoRecorder } from "$lib/shared/video-record/services/video-recorder";
import { FakeMediaRecorder, fakeStream } from "./fake-media-recorder";

const originalMediaRecorder = globalThis.MediaRecorder;
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

let clock = 0;
let objectUrlCounter = 0;
const revokedUrls: string[] = [];

function advanceClock(ms: number): void {
  clock += ms;
}

/** jsdom's Blob has no stable `text()` across versions; read it the long way. */
async function blobText(blob: Blob): Promise<string> {
  if (typeof blob.text === "function") return blob.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

/** Fail fast instead of letting a stranded promise eat the suite timeout. */
function withTimeout<T>(promise: Promise<T>, label: string, ms = 2000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} never settled within ${ms}ms`)), ms)
    ),
  ]);
}

function latestRecorder(): FakeMediaRecorder {
  const recorder = FakeMediaRecorder.instances.at(-1);
  if (!recorder) throw new Error("no MediaRecorder was constructed");
  return recorder;
}

/** Let queued microtasks (IndexedDB callbacks included) drain. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  clock = 1_000_000;
  objectUrlCounter = 0;
  revokedUrls.length = 0;
  FakeMediaRecorder.reset();
  vi.spyOn(Date, "now").mockImplementation(() => clock);
  globalThis.MediaRecorder = FakeMediaRecorder as unknown as typeof MediaRecorder;
  URL.createObjectURL = vi.fn(() => `blob:fake/${++objectUrlCounter}`);
  URL.revokeObjectURL = vi.fn((url: string) => {
    revokedUrls.push(url);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.MediaRecorder = originalMediaRecorder;
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
});

describe("VideoRecorder stop integrity", () => {
  it("keeps the final chunk when the recorder ended on its own before stop was requested", async () => {
    const recorder = new VideoRecorder();
    const id = await recorder.startRecording(fakeStream());
    const media = latestRecorder();

    const firstChunk = media.emitChunk();

    // The camera track ends: the browser flips the recorder to inactive now and
    // delivers the tail chunk a task later. The app has not asked to stop yet.
    media.endOnItsOwn();
    expect(media.state).toBe("inactive");
    expect(media.hasPendingEvents).toBe(true);

    const resultPromise = withTimeout(recorder.stopRecording(id), "stopRecording");
    await settle();
    media.flush();

    const result = await resultPromise;
    expect(result.success).toBe(true);
    const text = await blobText(result.videoBlob!);
    expect(text).toContain(firstChunk);
    expect(text).toContain(media.delivered.at(-1)!);
    expect(text).toBe(media.delivered.join(""));
  });

  it("resolves when the recorder already finished and delivered every chunk", async () => {
    const recorder = new VideoRecorder();
    const id = await recorder.startRecording(fakeStream());
    const media = latestRecorder();

    media.emitChunk();
    media.endOnItsOwn();
    media.flush();

    const result = await withTimeout(recorder.stopRecording(id), "late stopRecording");
    expect(result.success).toBe(true);
    expect(await blobText(result.videoBlob!)).toBe(media.delivered.join(""));
  });

  it("resolves every caller when stop is requested twice in a row", async () => {
    const recorder = new VideoRecorder();
    const id = await recorder.startRecording(fakeStream());
    const media = latestRecorder();
    media.emitChunk();

    const first = withTimeout(recorder.stopRecording(id), "first stopRecording");
    const second = withTimeout(recorder.stopRecording(id), "second stopRecording");
    await settle();
    media.flush();

    const [a, b] = await Promise.all([first, second]);
    expect(a.success).toBe(true);
    expect(b.success).toBe(true);
    expect(a.videoBlob!.size).toBe(b.videoBlob!.size);
    expect(await blobText(a.videoBlob!)).toBe(media.delivered.join(""));
  });

  it("never carries chunks from a finished session into the next one", async () => {
    const recorder = new VideoRecorder();

    const firstId = await recorder.startRecording(fakeStream());
    const firstMedia = latestRecorder();
    firstMedia.emitChunk();
    const firstStop = withTimeout(recorder.stopRecording(firstId), "first session stop");
    await settle();
    firstMedia.flush();
    const firstResult = await firstStop;

    const secondId = await recorder.startRecording(fakeStream());
    const secondMedia = latestRecorder();
    expect(secondMedia).not.toBe(firstMedia);
    secondMedia.emitChunk();
    const secondStop = withTimeout(recorder.stopRecording(secondId), "second session stop");
    await settle();
    secondMedia.flush();
    const secondResult = await secondStop;

    const firstText = await blobText(firstResult.videoBlob!);
    const secondText = await blobText(secondResult.videoBlob!);
    expect(firstText).toBe(firstMedia.delivered.join(""));
    expect(secondText).toBe(secondMedia.delivered.join(""));
    for (const payload of firstMedia.delivered) {
      expect(secondText).not.toContain(payload);
    }
  });

  it("releases the recording when the recorder fails during stop", async () => {
    const recorder = new VideoRecorder();
    const id = await recorder.startRecording(fakeStream());
    const media = latestRecorder();
    media.emitChunk();

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = withTimeout(recorder.stopRecording(id), "failing stopRecording").catch(
      (error: unknown) => error
    );
    await settle();
    media.raiseError("device lost");

    const outcome = await failing;
    expect(outcome).toBeInstanceOf(Error);
    // A dead recording must not stay in the active map, or nothing can be
    // started or cancelled for it again.
    expect(recorder.getRecordingState(id)).toBe("idle");
    expect(recorder.isRecording(id)).toBe(false);
    consoleError.mockRestore();
  });
});

describe("VideoRecorder pause accounting", () => {
  it("excludes paused wall-clock time from the reported duration", async () => {
    const recorder = new VideoRecorder();
    const id = await recorder.startRecording(fakeStream());
    const media = latestRecorder();

    advanceClock(1000);
    recorder.pauseRecording(id);
    expect(media.state).toBe("paused");

    // The user walks away for five seconds while paused.
    advanceClock(5000);

    const stop = withTimeout(recorder.stopRecording(id), "paused stopRecording");
    await settle();
    media.flush();
    const result = await stop;

    expect(result.success).toBe(true);
    expect(result.duration).toBeCloseTo(1, 2);
  });

  it("keeps progress frozen while paused instead of auto-stopping", async () => {
    const recorder = new VideoRecorder();
    const progress: Array<{ currentDuration: number; state: string }> = [];
    const id = await recorder.startRecording(
      fakeStream(),
      { maxDuration: 2 },
      (update) => progress.push({ ...update })
    );
    const media = latestRecorder();

    advanceClock(1500);
    recorder.pauseRecording(id);

    // Well past maxDuration in wall-clock terms, but no recording happened.
    advanceClock(60_000);
    await new Promise((resolve) => setTimeout(resolve, 350));

    const pausedUpdates = progress.filter((p) => p.state === "paused");
    expect(pausedUpdates.length).toBeGreaterThan(0);
    for (const update of pausedUpdates) {
      expect(update.currentDuration).toBeCloseTo(1.5, 2);
    }
    expect(media.state).toBe("paused");
    expect(recorder.getRecordingState(id)).toBe("paused");

    recorder.cancelRecording(id);
  });
});
