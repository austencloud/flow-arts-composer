/**
 * ExportOrchestrator lifecycle contract.
 *
 * These are the invariants a user can observe when an export is cancelled,
 * retried, or restarted while the previous attempt is still unwinding. The
 * subject is the REAL ExportOrchestrator; only the ambient singletons it reads
 * (settings, saved export options, image-composition settings) are stubbed.
 *
 * The video orchestrator is a controllable double that mirrors the real one's
 * observable contract rather than its internals:
 *   - executeExport() flips isExporting() true synchronously and returns a
 *     promise the test settles by hand;
 *   - cancelExport() flips isExporting() false immediately (the real one does
 *     this before its run has unwound) and arms the rejection the capture loop
 *     / the encoder's rejectPending() eventually produce ("Export cancelled");
 *   - the caller's progress callback is captured so a late emission from a
 *     superseded run can be replayed.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type {
  IVideoExportOrchestrator,
  VideoExportProgress,
} from "$lib/shared/compose/domain/video-export-types";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { ExportSettings } from "../../domain/models/export-settings";
import type { AnimationExportDependencies } from "../types";

vi.mock("$lib/shared/share/state/image-composition-state.svelte", () => ({
  getImageCompositionManager: () => ({
    getSettings: () => ({
      darkMode: true,
      includeStartPosition: true,
      addStepNumbers: false,
      addWord: true,
      addDifficultyLevel: false,
      showNotes: false,
      customNotesText: "",
    }),
  }),
}));

vi.mock(
  "$lib/shared/animation-panel/state/export-options-state.svelte",
  () => ({
    getExportOptionsState: () => ({
      getVideoOptions: () => ({
        fps: 30,
        loopCount: 1,
        resolution: 1080,
        effectOverrides: null,
        includeStartPosition: true,
        includeEndHold: true,
        quality: 0.9,
      }),
    }),
  })
);

vi.mock("$lib/shared/settings/state/settings-state.svelte", () => ({
  settingsService: { settings: { propType: "staff" } },
}));

// The 1.5s success-feedback hold is cosmetic and would cost this file ten
// seconds of real waiting. Every assertion here is about run identity, not that
// pause; the pause itself stays exercised by the product path.
vi.mock(
  "$lib/shared/animation-engine/domain/constants/timing",
  async (original) => ({
    ...((await original()) as Record<string, unknown>),
    VIDEO_EXPORT_SUCCESS_DELAY_MS: 0,
  })
);

const shareBlobNatively = vi.fn();
vi.mock("$lib/shared/foundation/services/file-downloader", () => ({
  shareBlobNatively: (...args: unknown[]) => shareBlobNatively(...args),
}));

const { ExportOrchestrator } = await import("../export-orchestrator");

/** A promise plus the handles to settle it from the test body. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  // Nothing in these tests observes an unhandled rejection on the raw promise;
  // the orchestrator is the only real consumer.
  promise.catch(() => {});
  return { promise, resolve, reject };
}

/** Let queued microtasks (and any awaited already-settled promise) drain. */
async function flush(times = 4) {
  for (let i = 0; i < times; i++) await Promise.resolve();
}

class ControllableVideoOrchestrator implements IVideoExportOrchestrator {
  exporting = false;
  runs: Array<{
    settle: ReturnType<typeof deferred<Blob>>;
    onProgress: (p: VideoExportProgress) => void;
  }> = [];
  cancelCalls = 0;

  executeExport(
    _canvas: HTMLCanvasElement,
    _playback: never,
    _panelState: never,
    onProgress: (progress: VideoExportProgress) => void
  ): Promise<Blob> {
    this.exporting = true;
    const settle = deferred<Blob>();
    this.runs.push({ settle, onProgress });
    return settle.promise;
  }

  cancelExport(): void {
    this.cancelCalls += 1;
    this.exporting = false;
    // The real pipeline rejects asynchronously: the capture loop only sees
    // shouldCancel on its next iteration, and a cancelled encoder rejects the
    // pending finish() promise. Arm it; the test decides when it lands.
    this.pendingCancel = this.runs[this.runs.length - 1] ?? null;
  }

  pendingCancel: (typeof this.runs)[number] | null = null;

  /** Land the rejection a cancelExport() armed. */
  landCancel(): void {
    const run = this.pendingCancel;
    this.pendingCancel = null;
    run?.settle.reject(new Error("Export cancelled"));
  }

  isExporting(): boolean {
    return this.exporting;
  }

  finishNewest(): void {
    this.exporting = false;
    this.runs[this.runs.length - 1]?.settle.resolve(new Blob());
  }

  failNewest(message: string): void {
    this.exporting = false;
    this.runs[this.runs.length - 1]?.settle.reject(new Error(message));
  }
}

const SEQUENCE = {
  id: "seq-1",
  word: "ABC",
  steps: [],
} as unknown as SequenceData;
const ANIMATION_SETTINGS = { format: "animation" } as ExportSettings;

function animationDependencies(): AnimationExportDependencies {
  return {
    canvas: { width: 400, height: 400 } as HTMLCanvasElement,
    playbackController: { togglePlayback: vi.fn() } as never,
    animationState: { isPlaying: false } as never,
  };
}

function makeOrchestrator() {
  const sharer = {
    downloadImage: vi.fn().mockResolvedValue(undefined),
    getImageBlob: vi.fn().mockResolvedValue(new Blob(["png"])),
    generateFilename: vi.fn().mockReturnValue("seq.png"),
  };
  const orchestrator = new ExportOrchestrator(sharer as never);
  const video = new ControllableVideoOrchestrator();
  orchestrator.setVideoOrchestrator(video);
  return { orchestrator, video, sharer };
}

function startAnimationExport(
  orchestrator: InstanceType<typeof ExportOrchestrator>,
  onProgress?: (p: VideoExportProgress) => void
) {
  return orchestrator.export(SEQUENCE, ANIMATION_SETTINGS, {
    animationDependencies: animationDependencies(),
    onProgress,
  });
}

beforeEach(() => {
  vi.useRealTimers();
  shareBlobNatively.mockReset();
});

describe("ExportOrchestrator cancellation", () => {
  it("reports a cancelled animation export as cancelled, not as a failure", async () => {
    const { orchestrator, video } = makeOrchestrator();

    const run = startAnimationExport(orchestrator);
    await flush();

    orchestrator.cancelExport();
    video.landCancel();

    const result = await run;
    // A deliberate cancel must not reach the host's error branch — that branch
    // fires an error toast and an error haptic for something the user asked for.
    expect(result).toEqual({ success: true, canceled: true });
  });

  it("keeps a cancel scoped to the run it was aimed at", async () => {
    const { orchestrator, video } = makeOrchestrator();

    const failed = startAnimationExport(orchestrator);
    await flush();
    video.failNewest("encoder died");
    expect(await failed).toEqual({ success: false, error: "encoder died" });

    // A cancel that lands after the run already failed (double-tap on the
    // takeover's Close/Cancel) must not colour the NEXT export.
    orchestrator.cancelExport();

    const retried = startAnimationExport(orchestrator);
    await flush();
    video.finishNewest();
    expect(await retried).toEqual({ success: true });
  });

  it("is idempotent under repeated cancel and leaves the pipeline reusable", async () => {
    const { orchestrator, video } = makeOrchestrator();

    const run = startAnimationExport(orchestrator);
    await flush();

    orchestrator.cancelExport();
    orchestrator.cancelExport();
    orchestrator.cancelExport();
    video.landCancel();

    expect(await run).toEqual({ success: true, canceled: true });
    // The real orchestrator's cancelExport() terminates its encoder worker;
    // calling it once per in-flight run is the contract.
    expect(video.cancelCalls).toBe(1);

    const retried = startAnimationExport(orchestrator);
    await flush();
    video.finishNewest();
    expect(await retried).toEqual({ success: true });
  });

  it("ignores a cancel when nothing is running", async () => {
    const { orchestrator, video } = makeOrchestrator();

    orchestrator.cancelExport();
    expect(orchestrator.isExporting()).toBe(false);
    expect(video.cancelCalls).toBe(0);

    const run = startAnimationExport(orchestrator);
    await flush();
    video.finishNewest();
    expect(await run).toEqual({ success: true });
  });
});

describe("ExportOrchestrator run identity", () => {
  it("refuses a second export while one is genuinely in flight", async () => {
    const { orchestrator, video } = makeOrchestrator();

    const first = startAnimationExport(orchestrator);
    await flush();

    expect(await startAnimationExport(orchestrator)).toEqual({
      success: false,
      error: "Export already in progress",
    });
    expect(video.runs).toHaveLength(1);

    video.finishNewest();
    await first;
  });

  it("does not hand the pipeline to a new run until the cancelled one has unwound", async () => {
    const { orchestrator, video } = makeOrchestrator();

    const first = startAnimationExport(orchestrator);
    await flush();
    orchestrator.cancelExport();

    // The user immediately retries. The cancelled run is still alive inside the
    // video orchestrator (its capture loop has not yet seen shouldCancel), so
    // starting a second run now would put two capture loops on one encoder.
    const second = startAnimationExport(orchestrator);
    await flush();
    expect(video.runs).toHaveLength(1);

    video.landCancel();
    await flush();
    expect(video.runs).toHaveLength(2);

    expect(await first).toEqual({ success: true, canceled: true });

    video.finishNewest();
    expect(await second).toEqual({ success: true });
  });

  it("never lets a superseded run's completion clear the newer run's flag", async () => {
    const { orchestrator, video } = makeOrchestrator();

    const first = startAnimationExport(orchestrator);
    await flush();
    orchestrator.cancelExport();

    const second = startAnimationExport(orchestrator);
    await flush();
    video.landCancel();
    await flush();

    // The cancelled run has now fully settled while the retry is mid-capture.
    await first;
    expect(orchestrator.isExporting()).toBe(true);
    expect(await startAnimationExport(orchestrator)).toEqual({
      success: false,
      error: "Export already in progress",
    });
    expect(video.runs).toHaveLength(2);

    video.finishNewest();
    await second;
    expect(orchestrator.isExporting()).toBe(false);
  });

  it("drops progress emitted by a superseded run", async () => {
    const { orchestrator, video } = makeOrchestrator();

    const staleProgress = vi.fn();
    const first = startAnimationExport(orchestrator, staleProgress);
    await flush();
    const staleRun = video.runs[0]!;

    staleRun.onProgress({ progress: 0.2, stage: "capturing" });
    expect(staleProgress).toHaveBeenCalledTimes(1);

    orchestrator.cancelExport();
    // The takeover is on its way down; the dying capture loop must not keep
    // driving the ring.
    staleRun.onProgress({ progress: 0.5, stage: "capturing" });
    expect(staleProgress).toHaveBeenCalledTimes(1);

    video.landCancel();
    await first;

    const liveProgress = vi.fn();
    const second = startAnimationExport(orchestrator, liveProgress);
    await flush();

    // A late emission from the dead run must not repaint the takeover that now
    // belongs to the retry.
    staleRun.onProgress({ progress: 0.9, stage: "encoding" });
    expect(staleProgress).toHaveBeenCalledTimes(1);
    expect(liveProgress).not.toHaveBeenCalled();

    video.finishNewest();
    await second;
  });
});

describe("ExportOrchestrator static share", () => {
  it("still reports a dismissed native share sheet as cancelled", async () => {
    const { orchestrator, sharer } = makeOrchestrator();

    await orchestrator.prepareStaticShare(SEQUENCE);
    shareBlobNatively.mockResolvedValue({ status: "canceled" });

    const result = await orchestrator.export(
      SEQUENCE,
      { format: "static" } as ExportSettings,
      { isMobile: true }
    );

    expect(result).toEqual({ success: true, canceled: true });
    expect(sharer.getImageBlob).toHaveBeenCalledTimes(1);
  });

  it("downloads on desktop and leaves the pipeline free afterwards", async () => {
    const { orchestrator, sharer } = makeOrchestrator();

    const result = await orchestrator.export(
      SEQUENCE,
      { format: "static" } as ExportSettings,
      { isMobile: false }
    );

    expect(result).toEqual({ success: true });
    expect(sharer.downloadImage).toHaveBeenCalledTimes(1);
    expect(orchestrator.isExporting()).toBe(false);
  });
});
