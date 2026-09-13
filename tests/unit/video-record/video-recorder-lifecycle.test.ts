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
function withTimeout<T>(
  promise: Promise<T>,
  label: string,
  ms = 2000
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`${label} never settled within ${ms}ms`)),
        ms
      )
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

/** A promise the test opens by hand, for holding an await open. */
function gate(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

beforeEach(() => {
  clock = 1_000_000;
  objectUrlCounter = 0;
  FakeMediaRecorder.reset();
  vi.spyOn(Date, "now").mockImplementation(() => clock);
  globalThis.MediaRecorder =
    FakeMediaRecorder as unknown as typeof MediaRecorder;
  URL.createObjectURL = vi.fn(() => `blob:fake/${++objectUrlCounter}`);
  URL.revokeObjectURL = vi.fn();
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

    const resultPromise = withTimeout(
      recorder.stopRecording(id),
      "stopRecording"
    );
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

    const result = await withTimeout(
      recorder.stopRecording(id),
      "late stopRecording"
    );
    expect(result.success).toBe(true);
    expect(await blobText(result.videoBlob!)).toBe(media.delivered.join(""));
  });

  it("resolves every caller when stop is requested twice in a row", async () => {
    const recorder = new VideoRecorder();
    const id = await recorder.startRecording(fakeStream());
    const media = latestRecorder();
    media.emitChunk();

    const first = withTimeout(
      recorder.stopRecording(id),
      "first stopRecording"
    );
    const second = withTimeout(
      recorder.stopRecording(id),
      "second stopRecording"
    );
    await settle();
    media.flush();

    const [a, b] = await Promise.all([first, second]);
    expect(a.success).toBe(true);
    expect(b.success).toBe(true);
    expect(a.videoBlob!.size).toBe(b.videoBlob!.size);
    expect(await blobText(a.videoBlob!)).toBe(media.delivered.join(""));
    // One finalization, so one blob URL — a second one would leak, since the
    // panel only ever revokes the URL it was handed.
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });

  it("never carries chunks from a finished session into the next one", async () => {
    const recorder = new VideoRecorder();

    const firstId = await recorder.startRecording(fakeStream());
    const firstMedia = latestRecorder();
    firstMedia.emitChunk();
    const firstStop = withTimeout(
      recorder.stopRecording(firstId),
      "first session stop"
    );
    await settle();
    firstMedia.flush();
    const firstResult = await firstStop;

    const secondId = await recorder.startRecording(fakeStream());
    const secondMedia = latestRecorder();
    expect(secondMedia).not.toBe(firstMedia);
    secondMedia.emitChunk();
    const secondStop = withTimeout(
      recorder.stopRecording(secondId),
      "second session stop"
    );
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

    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const failing = withTimeout(
      recorder.stopRecording(id),
      "failing stopRecording"
    ).catch((error: unknown) => error);
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

  it("keeps nothing from a recording cancelled while the stop was still flushing", async () => {
    const recorder = new VideoRecorder();
    const id = await recorder.startRecording(fakeStream());
    const media = latestRecorder();
    media.emitChunk();

    const stop = withTimeout(recorder.stopRecording(id), "cancelled stop");
    await settle();

    // The take is thrown away before the recorder finished flushing: the user
    // hit cancel, or the panel was destroyed. The finalization already under
    // way still holds this recording's state.
    recorder.cancelRecording(id);
    media.flush();

    const result = await stop;
    expect(result.success).toBe(false);
    expect(result.videoBlob).toBeUndefined();
    expect(result.blobUrl).toBeUndefined();
    // A discarded take must not mint an object URL nobody will revoke, and must
    // not hand a torn-down panel a result it would show as a finished video.
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    // Nor should it reach storage.
    await expect(recorder.getCachedRecording(id)).resolves.toBeNull();
  });

  it("rolls back a recording cancelled while the cache write was still open", async () => {
    // Before the fix the cancel lands after the map entry is gone and warns.
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const recorder = new VideoRecorder();

    // Hold the finalization inside its IndexedDB write, then let the real write
    // through, so the rollback has something real to undo.
    const cacheReached = gate();
    const releaseCache = gate();
    const writeToCache = recorder.cacheRecording.bind(recorder);
    vi.spyOn(recorder, "cacheRecording").mockImplementation(
      async (cacheId, blob, duration) => {
        cacheReached.resolve();
        await releaseCache.promise;
        await writeToCache(cacheId, blob, duration);
      }
    );

    const id = await recorder.startRecording(fakeStream());
    const media = latestRecorder();
    media.emitChunk();

    const stop = withTimeout(recorder.stopRecording(id), "cache-window stop");
    await settle();
    media.flush();
    await cacheReached.promise;

    // The panel tears down here, after the recorder has fully flushed and while
    // IndexedDB is mid-write. This is the last moment a cancel can land.
    recorder.cancelRecording(id);
    releaseCache.resolve();

    const result = await stop;
    expect(result.success).toBe(false);
    expect(result.blobUrl).toBeUndefined();
    expect(URL.createObjectURL).not.toHaveBeenCalled();

    // The write did happen, so this only passes if the finalization noticed the
    // cancellation afterwards and removed the discarded take.
    await expect(recorder.getCachedRecording(id)).resolves.toBeNull();
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

    const stop = withTimeout(
      recorder.stopRecording(id),
      "paused stopRecording"
    );
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

describe("VideoRecorder self-ended recordings", () => {
  it("does not charge the recording for the wait between the recorder ending and the stop press", async () => {
    const recorder = new VideoRecorder();
    const id = await recorder.startRecording(fakeStream(), {
      maxDuration: 600,
    });
    const media = latestRecorder();

    media.emitChunk();
    advanceClock(5000);

    // The camera track drops at five seconds. The recorder is finished; the
    // panel still shows recording controls and nobody presses stop yet.
    media.endOnItsOwn();
    media.flush();

    // Fifteen seconds later the user notices and presses stop.
    advanceClock(15_000);
    const result = await withTimeout(
      recorder.stopRecording(id),
      "late stopRecording"
    );

    expect(result.success).toBe(true);
    expect(result.duration).toBeCloseTo(5, 2);
  });

  it("stops reporting progress once the recorder has ended on its own", async () => {
    const recorder = new VideoRecorder();
    const progress: Array<{ currentDuration: number; state: string }> = [];
    const id = await recorder.startRecording(
      fakeStream(),
      { maxDuration: 600 },
      (update) => progress.push({ ...update })
    );
    const media = latestRecorder();

    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(progress.length).toBeGreaterThan(0);

    advanceClock(5000);
    media.endOnItsOwn();
    media.flush();
    const updatesAtEnd = progress.length;

    // The timer has nothing left to report: no clock of this recording is
    // running, and a duration that kept climbing here could trip the
    // maxDuration auto-stop on a recorder that already stopped.
    advanceClock(60_000);
    await new Promise((resolve) => setTimeout(resolve, 250));

    expect(progress.length).toBe(updatesAtEnd);

    const result = await withTimeout(
      recorder.stopRecording(id),
      "stop after self-end"
    );
    expect(result.duration).toBeCloseTo(5, 2);
  });
});
