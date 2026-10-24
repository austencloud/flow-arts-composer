// src/lib/shared/render/services/implementations/CompositionDispatcher.ts
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { SequenceExportOptions } from "../domain/models/sequence-export-options";
import type { CompositionProgressCallback, RenderCanvas } from "./types";
import type { ImageComposer } from "./image-composer";
import type { TextRenderer } from "./text-renderer";
import { convertGlyphCacheToBitmaps } from "./glyph-bitmap-loader";
import type { GlyphBitmapEntry } from "./glyph-bitmap-loader";
import { bundleTransferables } from "./card-asset-bundle";
import { captureException } from "#lib/shared/analytics/services/posthog.js";

type CompositionProgress = Parameters<CompositionProgressCallback>[0];

function reportFinalizing(
  onProgress: CompositionProgressCallback | undefined,
  latestProgress: CompositionProgress | undefined
): void {
  if (!onProgress || latestProgress?.stage === "finalizing") return;
  onProgress({
    current: latestProgress?.current ?? 1,
    total: latestProgress?.total ?? 1,
    stage: "finalizing",
  });
}

// ---- Protocol types (shared with composition.worker.ts) ----

export interface GlyphTransferEntry {
  letter: string;
  naturalWidth: number;
  naturalHeight: number;
  isDash: boolean;
}

export type CompositionWorkerInMessage =
  | {
      type: "init";
      glyphs: ImageBitmap[];
      glyphMeta: GlyphTransferEntry[];
      bundle: import("./card-asset-bundle").AssetBundle;
      overrideBundle: import("./override-placement-bundle").OverridePlacementBundle;
    }
  | {
      type: "compose";
      id: number;
      sequence: SequenceData;
      options: Partial<SequenceExportOptions>;
      qrBitmap: ImageBitmap | null;
    }
  | { type: "cancel"; id: number }
  | {
      // Re-seed ONLY the override resolver seam (arrow placements) on a warm
      // worker, without tearing down the expensive asset/SVG caches. Sent after
      // the user saves a Fix-Arrows adjustment so the next compose reflects it.
      type: "update-overrides";
      overrideBundle: import("./override-placement-bundle").OverridePlacementBundle;
    }
  | { type: "probe" };

/** Init stages a worker reports in order, ending with init-done. */
export type WorkerInitStage = "imports" | "renderer" | "seed" | "fonts";

export type CompositionWorkerOutMessage =
  | { type: "booted" }
  | { type: "init-stage"; stage: WorkerInitStage; ms: number }
  | { type: "init-done" }
  | { type: "init-error"; stage: WorkerInitStage; message: string }
  | { type: "result"; id: number; bitmap: ImageBitmap }
  | {
      type: "progress";
      id: number;
      current: number;
      total: number;
      stage: string;
    }
  | { type: "error"; id: number; message: string }
  | { type: "probe-result"; ok: boolean; error?: string };

/**
 * How one pool worker's start went, in milliseconds. `prepMs` is main-thread
 * cloning before the init message was posted; `bootMs` is `new Worker` to the
 * worker module running (null: it never ran); `stages` are the worker's own
 * init stage durations; `waitMs` is post to settle. A timeout's `stage` is the
 * stage it was still in, or null when it never started init.
 */
export interface WorkerInitReport {
  worker: number;
  outcome: "ready" | "error" | "timeout" | "terminated";
  prepMs: number;
  bootMs: number | null;
  waitMs: number;
  stages: Partial<Record<WorkerInitStage, number>>;
  stage: WorkerInitStage | null;
  error?: string;
}

interface WorkerEntry {
  worker: Worker;
  ready: boolean;
  pendingCount: number;
}

interface PendingRequest {
  resolve: (blob: Blob) => void;
  reject: (error: Error) => void;
  onProgress?: CompositionProgressCallback;
  signal?: AbortSignal;
  abortHandler?: () => void;
  workerEntry: WorkerEntry;
  // When set, the `result` branch resolves the raw inner ImageBitmap directly
  // (no webp Blob conversion, no bitmap close — the caller owns it). Used by
  // composeFrontBitmap so the main thread keeps the cheap stripe/bleed wrap.
  resolveBitmap?: (bitmap: ImageBitmap) => void;
  latestProgress?: CompositionProgress;
}

// One in-flight 1644x2244 RGBA card canvas per worker ≈ 14.7 MB. Reserve a core
// for the main thread and cap at 8 — past ~8 the seed/memory cost outweighs the
// throughput gain (a 32-core box would otherwise spawn 31 workers ≈ 455 MB).
export function computePoolSize(
  hardwareConcurrency: number | undefined,
  workerLimit = 8
): number {
  const cores = hardwareConcurrency || 4;
  return Math.max(2, Math.min(cores - 1, workerLimit));
}

// A production worker is one bundled module. In Vite development, each worker
// loads the raw module graph independently; eight workers turned one route
// visit into roughly a thousand requests and starved pointer updates. Two keep
// local printing responsive without changing the shipped production pool.
const WORKER_LIMIT = import.meta.env.DEV ? 2 : 8;
const POOL_SIZE = computePoolSize(
  typeof navigator !== "undefined" ? navigator.hardwareConcurrency : undefined,
  WORKER_LIMIT
);
const INIT_TIMEOUT_MS = 15_000;

export class CompositionDispatcher {
  private workers: WorkerEntry[] = [];
  private initialized = false;
  private initializing: Promise<void> | null = null;
  private nextRequestId = 1;
  private pendingRequests = new Map<number, PendingRequest>();
  private pendingBundle: import("./card-asset-bundle").AssetBundle | null =
    null;
  private pendingOverrideBundle:
    | import("./override-placement-bundle").OverridePlacementBundle
    | null = null;
  private pendingSignature: string | null = null;
  private seededSignature: string | null = null;
  // Open while a pre-warm builds its asset bundle. ensureInitialized awaits it so
  // a composeFrontBitmap that races in during the build can't seed the pool empty.
  private seedGate: Promise<void> | null = null;
  // Signature of the bundle an in-flight initPool is seeding with.
  private initializingSignature: string | null = null;
  // Bumped by terminate() so an initPool that outlives its pool leaves the
  // replacement's state alone.
  private poolGeneration = 0;
  // Settles each still-starting worker as "terminated" and clears its timer.
  private pendingInitAborts = new Set<() => void>();

  private static workerSupport: boolean | null = null;
  private static probing: Promise<boolean> | null = null;

  constructor(
    private readonly imageComposer: ImageComposer,
    private readonly textRenderer: TextRenderer
  ) {}

  /** Set the AssetBundle seeded into each worker's SVG caches at init time. */
  setAssetBundle(bundle: import("./card-asset-bundle").AssetBundle): void {
    this.pendingBundle = bundle;
  }

  /** Set the override placement bundle seeded into each worker at init. */
  setOverrideBundle(
    bundle: import("./override-placement-bundle").OverridePlacementBundle
  ): void {
    this.pendingOverrideBundle = bundle;
  }

  /**
   * Push a fresh override bundle to a WARM pool without re-seeding its (expensive)
   * asset caches. Updates the pending bundle so any worker initialized later seeds
   * fresh, and posts `update-overrides` to every live worker so the NEXT compose
   * reflects the change. Per-worker message order is FIFO, so a compose posted
   * after this call is processed by the re-seeded worker. No-op-safe before init
   * (pending bundle alone suffices — init will seed it).
   */
  updateOverrideBundle(
    bundle: import("./override-placement-bundle").OverridePlacementBundle
  ): void {
    this.pendingOverrideBundle = bundle;
    for (const entry of this.workers) {
      entry.worker.postMessage({
        type: "update-overrides",
        overrideBundle: bundle,
      } satisfies CompositionWorkerInMessage);
    }
  }

  /** Record the bundle signature that the next initPool will mark as seeded. */
  setPendingSignature(signature: string): void {
    this.pendingSignature = signature;
  }

  /** The signature of the bundle the pool is currently seeded with (null if unseeded). */
  getSeededSignature(): string | null {
    return this.seededSignature;
  }

  /**
   * Reserve an upcoming seed. Called SYNCHRONOUSLY by prewarmCardPool BEFORE its
   * async asset-bundle build, so any composeFrontBitmap that races in during the
   * build waits (via the seed gate in ensureInitialized) for the real bundle
   * instead of seeding the pool empty. A signature change tears down the stale
   * pool. Returns a resolver to call once the bundle has been set (or the build
   * failed) — it opens the gate so waiters proceed.
   */
  beginSeed(signature: string): () => void {
    this.pendingSignature = signature;
    // A pool still starting with another deck's bundle counts too. Letting it
    // finish marked it seeded with THIS signature while it held the old assets
    // (/shop prewarms one cover set, then /shop/starter-pack asks for another).
    const live = this.seededSignature ?? this.initializingSignature;
    if (live !== null && live !== signature) {
      this.terminate();
    }
    let resolve!: () => void;
    const gate = new Promise<void>((r) => {
      resolve = r;
    });
    this.seedGate = gate;
    return () => {
      resolve();
      // Only clear if still our gate — a later beginSeed may have replaced it.
      if (this.seedGate === gate) this.seedGate = null;
    };
  }

  static canUseWorker(): boolean {
    // Returns the cached probe result. `false` until probeWorkerSupport() has
    // run and confirmed the worker can boot + paint. A later task wires the
    // probe call at the dispatch call site.
    return CompositionDispatcher.workerSupport === true;
  }

  /**
   * Probe-once worker capability check. Boots a throwaway worker and verifies
   * it can paint an SVG-free back job end to end (init → OffscreenCanvas →
   * paint → transfer). Caches the result so subsequent calls are free.
   */
  static async probeWorkerSupport(): Promise<boolean> {
    if (CompositionDispatcher.workerSupport !== null)
      return CompositionDispatcher.workerSupport;
    // In-flight dedup: concurrent callers share the single probe in progress
    // (mirrors the `initializing` guard) instead of each spawning a worker.
    if (CompositionDispatcher.probing) return CompositionDispatcher.probing;
    CompositionDispatcher.probing = (async () => {
      try {
        if (
          typeof Worker === "undefined" ||
          typeof OffscreenCanvas === "undefined"
        ) {
          return (CompositionDispatcher.workerSupport = false);
        }
        try {
          const ok = await CompositionDispatcher.runProbe();
          return (CompositionDispatcher.workerSupport = ok);
        } catch {
          return (CompositionDispatcher.workerSupport = false);
        }
      } finally {
        CompositionDispatcher.probing = null;
      }
    })();
    return CompositionDispatcher.probing;
  }

  // Bootstraps via the SVG-free back paint path: a minimal proof-mode BackJob
  // needs NO seeded bundle (mandala null, decorations null), so it verifies
  // init -> OffscreenCanvas -> paint -> transfer end to end.
  private static runProbe(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const w = new Worker(
        new URL("../workers/composition.worker.ts", import.meta.url),
        {
          type: "module",
        }
      );
      const timeout = setTimeout(() => {
        console.warn("[CompositionDispatcher] worker probe timed out");
        w.terminate();
        resolve(false);
      }, 8000);
      w.onerror = (err) => {
        console.warn("[CompositionDispatcher] worker probe errored:", err);
        clearTimeout(timeout);
        w.terminate();
        resolve(false);
      };
      w.onmessage = (e: MessageEvent) => {
        const d = e.data as CompositionWorkerOutMessage;
        if (d?.type === "probe-result") {
          clearTimeout(timeout);
          w.terminate();
          if (!d.ok) {
            console.warn(
              "[CompositionDispatcher] worker probe failed:",
              d.error ?? "(no detail)"
            );
          }
          resolve(!!d.ok);
        }
      };
      w.postMessage({ type: "probe" } satisfies CompositionWorkerInMessage);
    });
  }

  async compose(
    sequence: SequenceData,
    options: Partial<SequenceExportOptions>,
    onProgress?: CompositionProgressCallback,
    signal?: AbortSignal,
    /** Pre-rendered QR bitmap (main-thread produced). The worker has no QR
     * generator, so a baked QR MUST be transferred in; the main-thread fallback
     * reads it via options.qrImageBitmap. Null = no QR baked. */
    qrBitmap: ImageBitmap | null = null
  ): Promise<Blob> {
    if (CompositionDispatcher.canUseWorker()) {
      try {
        return await this.composeOnWorker(
          sequence,
          options,
          onProgress,
          signal,
          qrBitmap
        );
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
          throw error;
        console.warn(
          "[CompositionDispatcher] Worker failed, falling back to main thread:",
          error
        );
        return this.composeOnMainThread(
          sequence,
          options,
          onProgress,
          signal,
          qrBitmap
        );
      }
    }
    return this.composeOnMainThread(
      sequence,
      options,
      onProgress,
      signal,
      qrBitmap
    );
  }


  private async composeOnWorker(
    sequence: SequenceData,
    options: Partial<SequenceExportOptions>,
    onProgress?: CompositionProgressCallback,
    signal?: AbortSignal,
    qrBitmap: ImageBitmap | null = null
  ): Promise<Blob> {
    await this.ensureInitialized();

    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    const id = this.nextRequestId++;
    const worker = this.pickWorker();
    if (!worker) {
      // No worker survived init. Throwing routes the caller into its existing
      // main-thread fallback; posting to a dead worker would just hang.
      throw new Error("No composition worker is ready");
    }
    worker.pendingCount++;

    return new Promise<Blob>((resolve, reject) => {
      const pending: PendingRequest = {
        resolve,
        reject,
        onProgress,
        signal,
        workerEntry: worker,
      };

      if (signal) {
        pending.abortHandler = () => {
          worker.worker.postMessage({
            type: "cancel",
            id,
          } satisfies CompositionWorkerInMessage);
        };
        signal.addEventListener("abort", pending.abortHandler, { once: true });
      }

      this.pendingRequests.set(id, pending);

      const plainSequence = JSON.parse(JSON.stringify(sequence));
      const plainOptions = JSON.parse(JSON.stringify(options));

      const transferList: Transferable[] = [];
      if (qrBitmap) transferList.push(qrBitmap);

      const message: CompositionWorkerInMessage = {
        type: "compose",
        id,
        sequence: plainSequence,
        options: plainOptions,
        qrBitmap,
      };

      worker.worker.postMessage(message, transferList);
    });
  }

  /**
   * Compose the front pictograph composite on a pool worker and return the raw
   * inner sequence ImageBitmap. The worker runs the same composeSequenceImage
   * path; the main thread keeps the cheap, deterministic stripe/bleed wrap.
   * The caller owns (and must dispose of) the returned bitmap.
   */
  async composeFrontBitmap(
    sequence: SequenceData,
    options: Partial<SequenceExportOptions>,
    qrBitmap: ImageBitmap | null = null,
    signal?: AbortSignal,
    onProgress?: CompositionProgressCallback
  ): Promise<ImageBitmap> {
    await this.ensureInitialized();

    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    const id = this.nextRequestId++;
    const worker = this.pickWorker();
    if (!worker) {
      // No worker survived init. Throwing routes the caller into its existing
      // main-thread fallback; posting to a dead worker would just hang.
      throw new Error("No composition worker is ready");
    }
    worker.pendingCount++;

    return new Promise<ImageBitmap>((resolve, reject) => {
      const pending: PendingRequest = {
        resolve: () => {}, // unused for the bitmap path
        reject,
        onProgress,
        signal,
        workerEntry: worker,
        resolveBitmap: resolve,
      };

      if (signal) {
        pending.abortHandler = () => {
          worker.worker.postMessage({
            type: "cancel",
            id,
          } satisfies CompositionWorkerInMessage);
        };
        signal.addEventListener("abort", pending.abortHandler, { once: true });
      }

      this.pendingRequests.set(id, pending);

      const plainSequence = JSON.parse(JSON.stringify(sequence));
      const plainOptions = JSON.parse(JSON.stringify(options));

      const message: CompositionWorkerInMessage = {
        type: "compose",
        id,
        sequence: plainSequence,
        options: plainOptions,
        qrBitmap,
      };

      worker.worker.postMessage(message, qrBitmap ? [qrBitmap] : []);
    });
  }

  private handleWorkerMessage(data: CompositionWorkerOutMessage): void {
    // Init messages are handled during init; probe-result is only seen by the
    // throwaway probe worker, never the pool — none carry a request id.
    if (
      data.type === "booted" ||
      data.type === "init-stage" ||
      data.type === "init-done" ||
      data.type === "init-error" ||
      data.type === "probe-result"
    )
      return;

    const pending = this.pendingRequests.get(data.id);
    if (!pending) return;

    if (data.type === "progress") {
      const progress: CompositionProgress = {
        current: data.current,
        total: data.total,
        stage: data.stage as "preparing" | "rendering" | "finalizing",
      };
      pending.latestProgress = progress;
      pending.onProgress?.(progress);
      return;
    }

    // Terminal messages — clean up
    this.pendingRequests.delete(data.id);
    if (pending.signal && pending.abortHandler) {
      pending.signal.removeEventListener("abort", pending.abortHandler);
    }
    pending.workerEntry.pendingCount--;

    if (data.type === "result") {
      // Bitmap path (composeFrontBitmap): hand the raw inner bitmap to the
      // caller without webp conversion. Cleanup above already ran. The caller
      // owns the bitmap, so do NOT close it here.
      if (pending.resolveBitmap) {
        pending.resolveBitmap(data.bitmap);
        return;
      }
      reportFinalizing(pending.onProgress, pending.latestProgress);
      const canvas = new OffscreenCanvas(data.bitmap.width, data.bitmap.height);
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(data.bitmap, 0, 0);
      data.bitmap.close();

      canvas.convertToBlob({ type: "image/webp", quality: 0.9 }).then(
        (blob) => pending.resolve(blob),
        (err) =>
          pending.reject(err instanceof Error ? err : new Error(String(err)))
      );
    } else if (data.type === "error") {
      if (
        data.message.includes("AbortError") ||
        data.message.includes("cancelled")
      ) {
        pending.reject(new DOMException(data.message, "AbortError"));
      } else {
        pending.reject(new Error(data.message));
      }
    }
  }

  // ---- Main-thread fallback path ----

  private async composeOnMainThread(
    sequence: SequenceData,
    options: Partial<SequenceExportOptions>,
    onProgress?: CompositionProgressCallback,
    signal?: AbortSignal,
    qrBitmap: ImageBitmap | null = null
  ): Promise<Blob> {
    // The main-thread ImageComposer draws a pre-rendered QR from
    // options.qrImageBitmap (falls back to its own generator otherwise). Thread
    // the transferred bitmap in so the fallback path matches the worker path.
    const opts = qrBitmap ? { ...options, qrImageBitmap: qrBitmap } : options;
    let latestProgress: CompositionProgress | undefined;
    const forwardProgress: CompositionProgressCallback | undefined = onProgress
      ? (progress) => {
          latestProgress = progress;
          onProgress(progress);
        }
      : undefined;
    const canvas: RenderCanvas = opts.cardMode
      ? await this.imageComposer.composeCardImage(
          sequence,
          opts,
          forwardProgress,
          signal
        )
      : await this.imageComposer.composeSequenceImage(
          sequence,
          opts,
          forwardProgress,
          signal
        );

    reportFinalizing(onProgress, latestProgress);
    if (canvas instanceof OffscreenCanvas) {
      return canvas.convertToBlob({ type: "image/webp", quality: 0.9 });
    }
    return new Promise<Blob>((resolve, reject) => {
      (canvas as HTMLCanvasElement).toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
        "image/webp",
        0.9
      );
    });
  }


  async ensureInitialized(): Promise<void> {
    // If a pre-warm is mid-flight (building its bundle), wait for it to set the
    // bundle before seeding — otherwise this call would seed the pool empty and
    // cache asset-less renders. The gate opens once prewarm has set the bundle.
    if (this.seedGate) await this.seedGate;
    if (this.initialized) return;
    if (this.initializing) return this.initializing;
    this.initializing = this.initPool();
    await this.initializing;
  }

  private async initPool(): Promise<void> {
    const generation = this.poolGeneration;
    // Captured before the first await, together with the bundle it names: a
    // beginSeed during this init changes the pending values, and the pool must
    // be marked with the bundle it was actually given.
    const signature = this.pendingSignature;
    const bundle = this.pendingBundle;
    const overrideBundle: import("./override-placement-bundle").OverridePlacementBundle =
      this.pendingOverrideBundle ?? {
        default: [],
        special: [],
        global: [],
        propGeometry: [],
      };
    this.initializingSignature = signature;

    await this.textRenderer.preloadGlyphImages();
    const glyphEntries = await convertGlyphCacheToBitmaps(
      this.textRenderer.getGlyphCache()
    );
    if (generation !== this.poolGeneration) {
      for (const entry of glyphEntries) entry.bitmap.close();
      return;
    }
    console.log(
      "[CompositionDispatcher] initPool glyphEntries:",
      glyphEntries.length,
      "bundle keys:",
      bundle?.keys.length ?? 0,
      "grids:",
      bundle ? Object.values(bundle.grids).filter(Boolean).length : 0
    );

    const glyphMeta: GlyphTransferEntry[] = glyphEntries.map((e) => ({
      letter: e.letter,
      naturalWidth: e.naturalWidth,
      naturalHeight: e.naturalHeight,
      isDash: e.isDash,
    }));

    // Spawn + seed every worker concurrently. `transfer` detaches the source
    // bitmaps, so each worker needs its own clone; running the N clone-sets in
    // parallel (instead of awaiting each inside a serial loop) is what turns the
    // ~3.7s seed into a sub-second one.
    const starts = Array.from({ length: POOL_SIZE }, (_, i) =>
      this.startWorker(i, glyphEntries, glyphMeta, bundle, overrideBundle)
    );

    // Every worker holds its own clones once its init message is posted.
    await Promise.all(starts.map((s) => s.posted));
    for (const entry of glyphEntries) {
      entry.bitmap.close();
    }

    // Open the pool as soon as one worker is ready; the rest join as they
    // finish. Waiting for all of them held every card for the slowest worker.
    // When none answer, the timeout still ends the wait and cards fall back to
    // the main thread.
    const settled = starts.map((s) => s.settled);
    await firstReady(settled);
    if (generation !== this.poolGeneration) return;

    this.initialized = true;
    this.initializing = null;
    this.initializingSignature = null;
    this.seededSignature = signature;

    void Promise.all(settled).then(reportPoolStart);
  }

  /**
   * Spawn pool worker `i`, post its init, and time each step. `posted`
   * resolves once the init message is on the wire (or the start failed);
   * `settled` never rejects and says how the start went.
   */
  private startWorker(
    i: number,
    glyphEntries: GlyphBitmapEntry[],
    glyphMeta: GlyphTransferEntry[],
    bundle: import("./card-asset-bundle").AssetBundle | null,
    overrideBundle: import("./override-placement-bundle").OverridePlacementBundle
  ): { posted: Promise<void>; settled: Promise<WorkerInitReport> } {
    const spawnedAt = performance.now();
    let postedAt: number | null = null;
    let bootMs: number | null = null;
    const stages: WorkerInitReport["stages"] = {};
    let failedStage: WorkerInitStage | null = null;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let finished = false;
    let settle!: (outcome: WorkerInitReport["outcome"], error?: string) => void;
    const abort = (): void => settle("terminated");

    const settled = new Promise<WorkerInitReport>((resolve) => {
      settle = (outcome, error) => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        this.pendingInitAborts.delete(abort);
        const now = performance.now();
        resolve({
          worker: i,
          outcome,
          prepMs: Math.round((postedAt ?? now) - spawnedAt),
          bootMs,
          waitMs: postedAt === null ? 0 : Math.round(now - postedAt),
          stages: { ...stages },
          stage:
            outcome === "ready"
              ? null
              : (failedStage ?? stageInProgress(bootMs !== null, stages)),
          ...(error !== undefined && { error }),
        });
      };
    });
    this.pendingInitAborts.add(abort);

    let worker: Worker;
    try {
      worker = new Worker(
        new URL("../workers/composition.worker.ts", import.meta.url),
        { type: "module" }
      );
    } catch (err) {
      settle("error", errorText(err));
      return { posted: Promise.resolve(), settled };
    }

    const entry: WorkerEntry = { worker, ready: false, pendingCount: 0 };
    this.workers.push(entry);

    // A worker that failed init is never handed work, so free its thread.
    const fail = (error: string): void => {
      worker.terminate();
      settle("error", error);
    };

    worker.onerror = (event) => {
      if (entry.ready) {
        console.error(`[CompositionDispatcher] Worker ${i} error:`, event);
        return;
      }
      // Before init-done this is the module failing to load or evaluate. It
      // used to be logged and then waited out for the full timeout.
      fail(event.message || "worker script failed to load");
    };

    worker.onmessage = (event: MessageEvent<CompositionWorkerOutMessage>) => {
      const data = event.data;
      switch (data.type) {
        case "booted":
          bootMs = Math.round(performance.now() - spawnedAt);
          break;
        case "init-stage":
          stages[data.stage] = data.ms;
          break;
        case "init-done":
          // terminate() already dropped this worker; it must not rejoin.
          if (!this.workers.includes(entry)) return;
          if (finished) {
            console.info(
              `[CompositionDispatcher] Worker ${i} finished init after its timeout and joined the pool`
            );
          }
          entry.ready = true;
          worker.onmessage = (ev: MessageEvent<CompositionWorkerOutMessage>) =>
            this.handleWorkerMessage(ev.data);
          settle("ready");
          break;
        case "init-error":
          failedStage = data.stage;
          fail(data.message);
          break;
      }
    };

    const posted = (async () => {
      try {
        // Clone glyph bitmaps for this worker (transfer consumes the original).
        const clonedBitmaps = await Promise.all(
          glyphEntries.map((e) => createImageBitmap(e.bitmap))
        );
        const bundleClone = await cloneAssetBundle(bundle);
        if (finished) return;

        const initMessage: CompositionWorkerInMessage = {
          type: "init",
          glyphs: clonedBitmaps,
          glyphMeta,
          bundle: bundleClone,
          overrideBundle,
        };
        worker.postMessage(initMessage, [
          ...clonedBitmaps,
          ...bundleTransferables(bundleClone),
        ]);
        postedAt = performance.now();

        // The clock must not start until the init message is actually on the
        // wire. Arming it at spawn would charge the worker for the main-thread
        // prep above — cloning every glyph bitmap and the whole asset bundle, N
        // times over, on a contended thread. That prep alone burned the full
        // budget in production and reported all N workers as timing out within
        // the same 40ms, before any of them had been asked to do anything
        // (2026-08-09).
        timeout = setTimeout(() => settle("timeout"), INIT_TIMEOUT_MS);
      } catch (err) {
        fail(errorText(err));
      }
    })();

    return { posted, settled };
  }

  /**
   * Least-loaded READY worker, or null when the pool has none.
   *
   * Seeding `best` with `workers[0]` regardless of its readiness meant a
   * partially- or fully-failed pool kept handing out a worker that never
   * answered, and the compose promise hung forever instead of falling back to
   * the main thread. Only ready workers are candidates now, and an empty
   * result is reported honestly.
   */
  private pickWorker(): WorkerEntry | null {
    let best: WorkerEntry | null = null;
    for (const entry of this.workers) {
      if (!entry.ready) continue;
      if (!best || entry.pendingCount < best.pendingCount) {
        best = entry;
      }
    }
    return best;
  }

  terminate(): void {
    this.poolGeneration++;
    // Settle workers still starting so their init timers can't fire later as
    // a burst of "init timeout" reports about a pool that no longer exists.
    for (const abort of [...this.pendingInitAborts]) abort();
    for (const entry of this.workers) {
      entry.worker.terminate();
    }
    this.workers = [];
    this.initialized = false;
    this.initializing = null;
    this.initializingSignature = null;
    this.seededSignature = null;

    for (const [, pending] of this.pendingRequests) {
      pending.reject(new Error("Dispatcher terminated"));
    }
    this.pendingRequests.clear();
  }
}

// ---- Pool start helpers ----

const INIT_STAGE_ORDER: readonly WorkerInitStage[] = [
  "imports",
  "renderer",
  "seed",
  "fonts",
];

/** The stage a worker was in when it stopped answering, or null if it never booted. */
function stageInProgress(
  booted: boolean,
  finished: WorkerInitReport["stages"]
): WorkerInitStage | null {
  if (!booted) return null;
  return INIT_STAGE_ORDER.find((s) => finished[s] === undefined) ?? "fonts";
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Resolves when the first report is "ready", or when every report is in. */
function firstReady(reports: Promise<WorkerInitReport>[]): Promise<void> {
  return new Promise((resolve) => {
    let remaining = reports.length;
    if (remaining === 0) resolve();
    for (const report of reports) {
      void report.then((r) => {
        remaining--;
        if (r.outcome === "ready" || remaining === 0) resolve();
      });
    }
  });
}

/**
 * One report per pool start. Every worker used to console.error its own
 * timeout, which PostHog turned into six or seven identical exceptions with no
 * timings. Workers dropped by terminate() are not failures.
 */
function reportPoolStart(reports: WorkerInitReport[]): void {
  const count = (outcome: WorkerInitReport["outcome"]) =>
    reports.filter((r) => r.outcome === outcome).length;
  const ready = count("ready");
  const timeouts = count("timeout");
  const errors = count("error");
  if (timeouts + errors === 0) {
    if (ready > 0) {
      console.info("[CompositionDispatcher] worker pool started:", reports);
    }
    return;
  }
  console.warn(
    `[CompositionDispatcher] ${timeouts + errors} of ${reports.length} workers failed to start` +
      (ready === 0 ? "; cards render on the main thread" : ""),
    reports
  );
  const nav =
    typeof navigator !== "undefined"
      ? (navigator as Navigator & { deviceMemory?: number })
      : undefined;
  captureException(new Error("Composition workers failed to start"), {
    worker_pool_size: reports.length,
    worker_ready: ready,
    worker_timeouts: timeouts,
    worker_errors: errors,
    worker_first_error: reports.find((r) => r.error)?.error ?? null,
    worker_init_reports: reports,
    worker_init_timeout_ms: INIT_TIMEOUT_MS,
    hardware_concurrency: nav?.hardwareConcurrency ?? null,
    device_memory: nav?.deviceMemory ?? null,
  });
}

/** Per-worker copy of the asset bundle (transfer detaches the source bitmaps). */
async function cloneAssetBundle(
  bundle: import("./card-asset-bundle").AssetBundle | null
): Promise<import("./card-asset-bundle").AssetBundle> {
  // Empty bundle when none was set — the worker simply seeds nothing.
  if (!bundle) {
    return {
      keys: [],
      bitmaps: [],
      grids: {
        diamond: null,
        box: null,
        diamondNonRadial: null,
        boxNonRadial: null,
      },
      icons: [],
    };
  }
  type GridSlot = import("./card-asset-bundle").AssetBundle["grids"]["diamond"];
  const cloneGrid = async (g: GridSlot): Promise<ImageBitmap | null> =>
    g ? await createImageBitmap(g as ImageBitmapSource) : null;
  const [bitmaps, icons, diamond, box, diamondNonRadial, boxNonRadial] =
    await Promise.all([
      Promise.all(bundle.bitmaps.map((b) => createImageBitmap(b))),
      Promise.all(
        bundle.icons.map(async (icon) => ({
          path: icon.path,
          bitmap: await createImageBitmap(icon.bitmap),
        }))
      ),
      cloneGrid(bundle.grids.diamond),
      cloneGrid(bundle.grids.box),
      cloneGrid(bundle.grids.diamondNonRadial),
      cloneGrid(bundle.grids.boxNonRadial),
    ]);
  return {
    keys: [...bundle.keys],
    bitmaps,
    grids: { diamond, box, diamondNonRadial, boxNonRadial },
    icons,
  };
}
