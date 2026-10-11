// src/lib/shared/render/services/implementations/CompositionDispatcher.ts
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { SequenceExportOptions } from "../domain/models/sequence-export-options";
import type { CompositionProgressCallback, RenderCanvas } from "./types";
import type { ImageComposer } from "./image-composer";
import type { TextRenderer } from "./text-renderer";
import { convertGlyphCacheToBitmaps } from "./glyph-bitmap-loader";
import { bundleTransferables } from "./card-asset-bundle";

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

export type CompositionWorkerOutMessage =
  | { type: "init-done" }
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
    if (this.seededSignature !== null && this.seededSignature !== signature) {
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
    // init-done is handled during init; probe-result is only seen by the
    // throwaway probe worker, never the pool — both lack a request id.
    if (data.type === "init-done" || data.type === "probe-result") return;

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
    await this.textRenderer.preloadGlyphImages();
    const glyphEntries = await convertGlyphCacheToBitmaps(
      this.textRenderer.getGlyphCache()
    );
    console.log(
      "[CompositionDispatcher] initPool glyphEntries:",
      glyphEntries.length,
      "bundle keys:",
      this.pendingBundle?.keys.length ?? 0,
      "grids:",
      this.pendingBundle
        ? Object.values(this.pendingBundle.grids).filter(Boolean).length
        : 0
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
    const spawnWorker = async (i: number): Promise<void> => {
      try {
        const worker = new Worker(
          new URL("../workers/composition.worker.ts", import.meta.url),
          { type: "module" }
        );

        const entry: WorkerEntry = { worker, ready: false, pendingCount: 0 };
        worker.onerror = (err) => {
          console.error(`[CompositionDispatcher] Worker ${i} error:`, err);
        };
        this.workers.push(entry);

        // The clock must not start until the init message is actually on the
        // wire. Arming it here would charge the worker for the main-thread prep
        // that happens below — cloning every glyph bitmap and the whole asset
        // bundle, N times over, on a contended thread. That prep alone burned
        // the full budget in production and reported all N workers as timing
        // out within the same 40ms, before any of them had been asked to do
        // anything (2026-08-09).
        let armTimeout = (): void => {};
        const ready = new Promise<void>((resolve, reject) => {
          let timeout: ReturnType<typeof setTimeout> | undefined;
          armTimeout = () => {
            timeout = setTimeout(
              () => reject(new Error(`Worker ${i} init timeout`)),
              INIT_TIMEOUT_MS
            );
          };
          worker.onmessage = (
            event: MessageEvent<CompositionWorkerOutMessage>
          ) => {
            if (event.data.type === "init-done") {
              clearTimeout(timeout);
              entry.ready = true;
              worker.onmessage = (
                ev: MessageEvent<CompositionWorkerOutMessage>
              ) => this.handleWorkerMessage(ev.data);
              resolve();
            }
          };
        });

        // Clone glyph bitmaps for this worker (transfer consumes the original).
        const clonedBitmaps = await Promise.all(
          glyphEntries.map((e) => createImageBitmap(e.bitmap))
        );

        // Clone the AssetBundle per worker. Empty bundle when none was set —
        // the worker simply seeds nothing.
        const bundle = this.pendingBundle;
        let bundleClone: import("./card-asset-bundle").AssetBundle = {
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
        if (bundle) {
          const clonedBmps = await Promise.all(
            bundle.bitmaps.map((b) => createImageBitmap(b))
          );
          type GridSlot =
            import("./card-asset-bundle").AssetBundle["grids"]["diamond"];
          const cloneGrid = async (g: GridSlot): Promise<ImageBitmap | null> =>
            g ? await createImageBitmap(g as ImageBitmapSource) : null;
          // Clone footer icons per worker (transfer detaches the source).
          const clonedIcons = await Promise.all(
            bundle.icons.map(async (icon) => ({
              path: icon.path,
              bitmap: await createImageBitmap(icon.bitmap),
            }))
          );
          bundleClone = {
            keys: [...bundle.keys],
            bitmaps: clonedBmps,
            grids: {
              diamond: await cloneGrid(bundle.grids.diamond),
              box: await cloneGrid(bundle.grids.box),
              diamondNonRadial: await cloneGrid(bundle.grids.diamondNonRadial),
              boxNonRadial: await cloneGrid(bundle.grids.boxNonRadial),
            },
            icons: clonedIcons,
          };
        }

        const initMessage: CompositionWorkerInMessage = {
          type: "init",
          glyphs: clonedBitmaps,
          glyphMeta,
          bundle: bundleClone,
          overrideBundle: this.pendingOverrideBundle ?? {
            default: [],
            special: [],
            global: [],
            propGeometry: [],
          },
        };
        worker.postMessage(initMessage, [
          ...clonedBitmaps,
          ...bundleTransferables(bundleClone),
        ]);
        armTimeout();

        await ready;
      } catch (err) {
        console.error(
          `[CompositionDispatcher] Failed to create worker ${i}:`,
          err
        );
      }
    };

    await Promise.all(
      Array.from({ length: POOL_SIZE }, (_, i) => spawnWorker(i))
    );

    // Close the source glyph bitmaps — workers have their own clones
    for (const entry of glyphEntries) {
      entry.bitmap.close();
    }

    this.initialized = true;
    this.initializing = null;
    this.seededSignature = this.pendingSignature;
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
    for (const entry of this.workers) {
      entry.worker.terminate();
    }
    this.workers = [];
    this.initialized = false;
    this.initializing = null;
    this.seededSignature = null;

    for (const [, pending] of this.pendingRequests) {
      pending.reject(new Error("Dispatcher terminated"));
    }
    this.pendingRequests.clear();
  }
}
