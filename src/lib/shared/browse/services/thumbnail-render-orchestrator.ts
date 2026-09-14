/**
 * ThumbnailRenderOrchestrator
 *
 * Coordinates the 4-tier thumbnail loading pipeline:
 * 1. Static bundled (instant) - pre-rendered thumbnails in /static/thumbnails/
 * 2. Local IndexedDB (instant) - personalized cache of viewed thumbnails
 * 3. Cloud cache (fast) - Firebase Storage with manifest
 * 4. Local render (slow) - Canvas2D rendering as final fallback
 *
 * Static thumbnails are synced from cloud during releases for instant loading.
 * Local cache provides instant loading for frequently-viewed sequences.
 * This is the main entry point for components.
 */

import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type {
  ThumbnailRenderInput,
  ThumbnailCacheKey,
} from "./thumbnail-key-deriver";
import * as keyDeriverModule from "./thumbnail-key-deriver";
import {
  ThumbnailRenderTimeoutError,
  ThumbnailRenderQueue,
} from "./thumbnail-render-queue";
import type { ThumbnailRenderer } from "$lib/shared/browse/services/thumbnail-renderer";
import * as cloudCacheModule from "$lib/shared/browse/services/cloud-thumbnail-cache";
import type { CloudThumbnailKey } from "$lib/shared/browse/services/cloud-thumbnail-cache";
import type { ThumbnailLocalCache } from "./thumbnail-local-cache";
import type { ThumbnailMetricsCollector } from "./thumbnail-metrics-collector";
import { captureThumbnailRenderFailure } from "$lib/shared/analytics/thumbnail-analytics";

export interface RenderProgress {
  current: number;
  total: number;
  stage: "preparing" | "rendering" | "finalizing";
}
export type ThumbnailLoadStatus =
  | { state: "idle" }
  | { state: "checking-cache" }
  | { state: "queued"; position: number }
  | { state: "rendering"; progress?: RenderProgress }
  | { state: "uploading" }
  | { state: "complete"; url: string }
  | { state: "error"; error: Error };
export interface ThumbnailRequest {
  /** The sequence to render */
  sequence: SequenceData;

  /** Render configuration */
  input: ThumbnailRenderInput;

  /** Optional callback for status updates */
  onStatusChange?: (status: ThumbnailLoadStatus) => void;

  /** Skip cloud cache check and render directly (use after 404 errors) */
  skipCache?: boolean;

  /** Priority for queue ordering (lower = higher priority). Use element's Y position. */
  priority?: number;

  /** Cancels only this caller; shared same-key rendering continues for others. */
  signal?: AbortSignal;

  /** Gallery requests either prepare scan assets in the background or reuse a
   * public prepared QR, depending on the caller's authorization. */
  qrPolicy?: "generate" | "cache-only" | "background" | "prepared-only";

  /** Paint a separately cached preview while its QR version is prepared. */
  onPreview?: (preview: ThumbnailResult) => void;
}
export interface ThumbnailResult {
  /** URL to display (either cloud URL or blob URL), null if render failed */
  url: string | null;

  /** Whether this came from cache (true) or was freshly rendered (false) */
  fromCache: boolean;

  /** The cache key used (for cancellation) */
  key: ThumbnailCacheKey;

  /** Error if rendering failed (only present when url is null) */
  error?: Error;

  /**
   * A visible render can be intentionally left uncached when it does not match
   * its key. Admin warmers use this signal instead of counting that fallback as
   * a successfully warmed asset.
   */
  cacheWriteSkippedReason?: "qr_inconsistent";
}

// In-memory LRU cache of hash → blobUrl for instant revisits.
// Survives component remounts within the same page session.
const MAX_MEMORY_ENTRIES = 500;

class MemoryUrlCache {
  private map = new Map<string, string>();

  get(hash: string): string | null {
    const url = this.map.get(hash);
    if (!url) return null;
    // Move to end (most recently used)
    this.map.delete(hash);
    this.map.set(hash, url);
    return url;
  }

  set(hash: string, url: string): void {
    if (this.map.has(hash)) {
      this.map.delete(hash);
    } else if (this.map.size >= MAX_MEMORY_ENTRIES) {
      // Evict oldest entry
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) {
        const oldUrl = this.map.get(oldest);
        this.map.delete(oldest);
        if (oldUrl?.startsWith("blob:")) {
          URL.revokeObjectURL(oldUrl);
        }
      }
    }
    this.map.set(hash, url);
  }

  delete(hash: string): void {
    const url = this.map.get(hash);
    if (url === undefined) return;
    this.map.delete(hash);
    if (url.startsWith("blob:")) {
      URL.revokeObjectURL(url);
    }
  }

  clear(): void {
    for (const url of this.map.values()) {
      if (url.startsWith("blob:")) {
        URL.revokeObjectURL(url);
      }
    }
    this.map.clear();
  }
}

/** Fetch a cloud thumbnail body and persist it locally — ONLY on HTTP OK.
 *  fetch() resolves on 404 with an error body; writing that body poisoned
 *  IndexedDB (the stale-404-flood bug). A confirmed 404 negative-caches the
 *  cloud key instead (mirrors offline-cache-orchestrator.ts:314-321). Exported
 *  for focused tests; the class method delegates. */
export async function saveCloudBlobToLocal(
  url: string,
  hash: string,
  cloudKey: CloudThumbnailKey,
  localCache: { set(hash: string, blob: Blob): Promise<void> },
  fetchImpl: typeof fetch = fetch,
  markMissingFn: (key: CloudThumbnailKey) => void = cloudCacheModule.markMissing
): Promise<void> {
  try {
    const response = await fetchImpl(url);
    if (!response.ok) {
      // Only a real "not found" is authoritative. 5xx/permission stay retryable.
      if (response.status === 404) markMissingFn(cloudKey);
      return;
    }
    const blob = await response.blob();
    await localCache.set(hash, blob);
  } catch {
    // Non-fatal — cloud URL still renders; local tier just isn't warmed.
  }
}

// Static thumbnail manifest - loaded once, lists all bundled thumbnails
let staticManifest: Set<string> | null = null;
let staticManifestLoading: Promise<Set<string>> | null = null;
let staticManifestRetryAt = 0;
const STATIC_MANIFEST_RETRY_COOLDOWN_MS = 5_000;
const UNAVAILABLE_STATIC_MANIFEST = new Set<string>();

async function getStaticManifest(): Promise<Set<string>> {
  if (staticManifest !== null) return staticManifest;
  if (staticManifestLoading) return staticManifestLoading;
  if (Date.now() < staticManifestRetryAt) return UNAVAILABLE_STATIC_MANIFEST;

  staticManifestLoading = (async () => {
    try {
      const response = await fetch("/thumbnails/manifest.json");
      if (!response.ok) {
        throw new Error(
          `Static thumbnail manifest returned ${response.status}`
        );
      }
      const data = (await response.json()) as { keys: string[] };
      staticManifest = new Set(data.keys);
      staticManifestRetryAt = 0;
      return staticManifest;
    } catch (error) {
      staticManifestRetryAt = Date.now() + STATIC_MANIFEST_RETRY_COOLDOWN_MS;
      console.warn("[Static] Thumbnail manifest unavailable:", error);
      return UNAVAILABLE_STATIC_MANIFEST;
    } finally {
      staticManifestLoading = null;
    }
  })();

  return staticManifestLoading;
}

// Mirror of sanitizeFilename() in scripts/sync-static-thumbnails.cjs — files
// land on disk (Windows) with these characters replaced, so lookups must too.
function sanitizeForStaticPath(name: string): string {
  return name.replace(/:/g, "-").replace(/[?<>"|*]/g, "_");
}

function isRenderCancellation(error: Error): boolean {
  return error.message === "Cancelled" || error.name === "AbortError";
}

function cancellationError(signal: AbortSignal): Error {
  if (signal.reason instanceof Error) return signal.reason;
  return new DOMException(
    typeof signal.reason === "string" ? signal.reason : "Cancelled",
    "AbortError"
  );
}

function normalizeRenderError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (typeof error !== "object" || error === null) {
    return new Error(String(error));
  }

  const errorLike = error as {
    code?: unknown;
    message?: unknown;
    name?: unknown;
  };
  const normalized = new Error(
    typeof errorLike.message === "string" ? errorLike.message : String(error)
  ) as Error & { code?: string };
  if (typeof errorLike.name === "string") {
    normalized.name = errorLike.name;
  }
  if (typeof errorLike.code === "string") {
    normalized.code = errorLike.code;
  }
  return normalized;
}

function renderErrorCode(error: Error): string {
  if (
    error instanceof ThumbnailRenderTimeoutError ||
    (error as Error & { code?: string }).code === "THUMBNAIL_RENDER_TIMEOUT"
  ) {
    return "THUMBNAIL_RENDER_TIMEOUT";
  }
  if (error.message.includes("ORPHANED_SEQUENCE")) {
    return "ORPHANED_SEQUENCE";
  }
  return "RENDER_FAILED";
}

function uploadToCloud(
  orchestrator: ThumbnailRenderOrchestrator,
  key: ThumbnailCacheKey,
  blob: Blob
): void {
  const upload = cloudCacheModule
    .upload(orchestrator.buildCloudKey(key), blob)
    .then((url) => {
      if (url) {
        orchestrator["metrics"]?.recordUpload(true);
      }
    })
    .catch(() => {
      // Non-fatal - image is displayed, just couldn't upload for others
      orchestrator["metrics"]?.recordUpload(false);
    });

  // A live card is finished the moment its image paints, so the upload stays
  // off the render path. A batch warm pass is the opposite case: the upload IS
  // the deliverable, and whoever started it needs to know when closing the tab
  // is safe. Register the promise so settleUploads() can answer that.
  orchestrator.trackUpload(upload);
}

export class ThumbnailRenderOrchestrator {
  private completedCount = 0;
  private memoryCache = new MemoryUrlCache();
  private backgroundQueue = new ThumbnailRenderQueue();

  // Generation counter: bumped when all caches are nuked.
  // Any thumbnail rendered before this generation is stale.
  private cacheGeneration = 0;
  // Track which generation each key was last rendered at
  private renderedGenerations = new Map<string, number>();

  // Uploads that have been handed to Storage but have not settled yet. Kept so
  // a batch pass can wait for its own writes instead of guessing.
  private inFlightUploads = new Set<Promise<void>>();

  constructor(
    private queue: ThumbnailRenderQueue,
    private renderer: ThumbnailRenderer,
    private localCache: ThumbnailLocalCache,
    private metrics?: ThumbnailMetricsCollector
  ) {
    this.backgroundQueue.setMaxConcurrent(1);
  }

  /**
   * Register an in-flight cloud upload. Called by the module-level upload
   * helper; the set self-drains as each upload settles.
   */
  trackUpload(upload: Promise<void>): void {
    this.inFlightUploads.add(upload);
    void upload.finally(() => this.inFlightUploads.delete(upload));
  }

  /**
   * Resolve once every upload this orchestrator has started has settled.
   *
   * Uploads are deliberately fire-and-forget so a gallery card paints as soon
   * as its image exists. That makes "render finished" a poor proxy for "the
   * shared cache actually has it" — a warm pass can report 100% while hundreds
   * of writes are still in the air, and closing the tab there throws that work
   * away. A batch caller awaits this before it claims to be done.
   *
   * Loops because settling one upload can enqueue another (the cloud module
   * probes for an existing object before it writes).
   */
  async settleUploads(): Promise<void> {
    while (this.inFlightUploads.size > 0) {
      await Promise.allSettled([...this.inFlightUploads]);
    }
  }

  /**
   * Nuke every cache layer and force all subsequent requests to render fresh.
   * Call this from the admin "Clear Cloud Thumbnails" flow AFTER deleting
   * cloud files and local IndexedDB - this handles the remaining in-memory
   * layers (URL cache, knownExists, static manifest).
   */
  invalidateAllCaches(): void {
    this.cacheGeneration++;
    this.renderedGenerations.clear();
    this.memoryCache.clear();
    // Nuke in-memory URL cache + persistent "known exists" list
    cloudCacheModule.clearMemoryCache(true);
    // Reset static manifest so stale bundled thumbnails aren't served
    staticManifest = new Set();
    staticManifestRetryAt = 0;
  }

  getCached(hash: string): string | null {
    const lastRenderedGen = this.renderedGenerations.get(hash) ?? 0;
    if (lastRenderedGen < this.cacheGeneration) return null;
    return this.memoryCache.get(hash);
  }

  async getThumbnail(request: ThumbnailRequest): Promise<ThumbnailResult> {
    if (
      request.qrPolicy !== "background" &&
      request.qrPolicy !== "prepared-only"
    )
      return this.loadThumbnail(request);

    const preview = await this.loadThumbnail({
      ...request,
      qrPolicy: "cache-only",
    });
    if (
      !preview.url ||
      preview.key.inputs.visibility?.showQRCode ||
      !request.input.visibility?.showQRCode
    ) {
      return preview;
    }
    if (request.signal?.aborted) throw cancellationError(request.signal);
    request.onPreview?.(preview);

    // A gallery miss is ordinary. Do this check before handing work to the
    // renderer so it doesn't compose another QR-free image after the preview
    // already painted. Fail closed for older/lightweight renderer harnesses:
    // prepared-only must never fall through to QR generation.
    if (request.qrPolicy === "prepared-only") {
      let hasPreparedQR = false;
      try {
        hasPreparedQR =
          (await this.renderer.hasPreparedQR?.(
            request.sequence,
            request.input,
            request.signal
          )) ?? false;
      } catch {
        // A public prepared record can disappear or be unreachable while a
        // card is on screen. Keep the preview rather than surfacing an error.
        if (request.signal?.aborted) throw cancellationError(request.signal);
        return preview;
      }
      if (!hasPreparedQR) return preview;
      if (request.signal?.aborted) throw cancellationError(request.signal);
    }

    // The preview stays visible, without a loading overlay. Only one background
    // QR job runs at a time, on a separate queue that cannot block new previews.
    // Signed-in gallery cards prepare scan assets there; guest cards only reuse
    // a public prepared QR.
    const final = await this.loadThumbnail(
      {
        ...request,
        qrPolicy:
          request.qrPolicy === "prepared-only" ? "prepared-only" : "generate",
        onStatusChange: undefined,
      },
      undefined,
      this.backgroundQueue
    );
    if (final.cacheWriteSkippedReason && final.url?.startsWith("blob:")) {
      URL.revokeObjectURL(final.url);
    }
    return final.url && !final.cacheWriteSkippedReason ? final : preview;
  }

  private async loadThumbnail(
    request: ThumbnailRequest,
    continuedRequestId?: string,
    renderQueue: ThumbnailRenderQueue = this.queue
  ): Promise<ThumbnailResult> {
    const key = keyDeriverModule.deriveKey(request.input);
    const cloudKey = this.buildCloudKey(key);

    // If all caches were nuked (admin clear), force skip for this key
    // until it's been freshly rendered in the current generation.
    // Unseen keys default to generation 0 — the SESSION-START generation —
    // so they may use every cache tier. (`?? -1` here silently disabled
    // static/cloud/local for the first request of every key each session,
    // making the whole gallery re-render locally.) After an admin nuke bumps
    // the generation, 0 < generation correctly forces a fresh render.
    const lastRenderedGen = this.renderedGenerations.get(key.hash) ?? 0;
    const mustSkipCache =
      request.skipCache || lastRenderedGen < this.cacheGeneration;

    // Start metrics tracking
    const requestId =
      continuedRequestId ??
      this.metrics?.startRequest(true, {
        cacheKeyHash: key.hash,
        sequenceId: request.sequence.id || key.inputs.sequenceId || null,
        variant: key.inputs.variant,
        propKey: key.propKey,
        qrRequested: key.inputs.visibility?.showQRCode ?? false,
        lightMode: key.inputs.lightMode,
        usesDefaults: key.usesDefaults,
        initialStepCount:
          request.sequence.steps?.length ??
          request.sequence.sequenceLength ??
          0,
        queueDepthAtEnqueue: null,
        activeAtEnqueue: null,
        workerEligible: null,
      }) ??
      "";
    const assertRequestActive = () => {
      if (!request.signal?.aborted) return;
      this.metrics?.cancelRequest(requestId);
      throw cancellationError(request.signal);
    };
    assertRequestActive();

    // Step 0: In-memory URL cache (synchronous, zero latency)
    // Survives component remounts - eliminates placeholder flash on revisits
    if (!mustSkipCache) {
      const memUrl = this.memoryCache.get(key.hash);
      if (memUrl) {
        this.completedCount++;
        this.metrics?.endRequest(requestId, "memory");
        request.onStatusChange?.({ state: "complete", url: memUrl });
        return { url: memUrl, fromCache: true, key };
      }
    }

    // Step 1: Check STATIC bundled thumbnails (instant, no network latency)
    if (key.usesDefaults && !mustSkipCache) {
      this.metrics?.startStage(requestId, "static_manifest");
      const manifest = await getStaticManifest();
      assertRequestActive();
      // Current format first (variant/prop/name_id_renderer_mode — mirrors
      // cloud storage paths), legacy shape second
      // (prop/name_renderer_mode — pre-variant bundles).
      const staticKey = [
        this.buildStaticKey(key),
        this.buildLegacyStaticKey(key),
      ].find((candidate) => manifest.has(candidate));

      if (staticKey) {
        const staticUrl = `/thumbnails/${staticKey}.webp`;
        this.memoryCache.set(key.hash, staticUrl);
        this.renderedGenerations.set(key.hash, this.cacheGeneration);
        this.completedCount++;
        this.metrics?.endRequest(requestId, "static");
        request.onStatusChange?.({ state: "complete", url: staticUrl });
        return { url: staticUrl, fromCache: true, key };
      } else if (manifest.size > 0) {
        console.debug(
          `[Static] Not in manifest: "${this.buildStaticKey(key)}" (sequence: ${key.inputs.sequenceName})`
        );
      }
    }

    // Step 2: Check LOCAL IndexedDB cache (instant, personalized)
    if (!mustSkipCache) {
      this.metrics?.startStage(requestId, "local_cache");
      const localBlob = await this.localCache.get(key.hash);
      assertRequestActive();
      if (localBlob) {
        const url = URL.createObjectURL(localBlob);
        this.memoryCache.set(key.hash, url);
        this.renderedGenerations.set(key.hash, this.cacheGeneration);
        this.completedCount++;
        this.metrics?.endRequest(requestId, "local");
        request.onStatusChange?.({ state: "complete", url });
        return { url, fromCache: true, key };
      }
    }

    // Step 3: Check cloud in-memory URL cache (instant, session-only)
    if (key.usesDefaults && !mustSkipCache) {
      this.metrics?.startStage(requestId, "cloud_lookup");
      const memoryCached = cloudCacheModule.getCachedUrl(cloudKey);
      if (memoryCached) {
        this.memoryCache.set(key.hash, memoryCached);
        this.renderedGenerations.set(key.hash, this.cacheGeneration);
        this.completedCount++;
        this.metrics?.endRequest(requestId, "cloud");
        request.onStatusChange?.({ state: "complete", url: memoryCached });
        return { url: memoryCached, fromCache: true, key };
      }

      // Step 4: Check cloud cache (network request)
      if (memoryCached === undefined) {
        request.onStatusChange?.({ state: "checking-cache" });
        const cloudUrl = await cloudCacheModule.getUrl(
          cloudKey,
          request.priority ?? Infinity,
          { probeUnknown: false }
        );
        assertRequestActive();
        if (cloudUrl) {
          void saveCloudBlobToLocal(
            cloudUrl,
            key.hash,
            cloudKey,
            this.localCache
          );
          this.memoryCache.set(key.hash, cloudUrl);
          this.renderedGenerations.set(key.hash, this.cacheGeneration);
          this.completedCount++;
          this.metrics?.endRequest(requestId, "cloud");
          request.onStatusChange?.({ state: "complete", url: cloudUrl });
          return { url: cloudUrl, fromCache: true, key };
        }
      }
    }

    if (
      request.qrPolicy === "cache-only" &&
      key.inputs.visibility?.showQRCode
    ) {
      // Preparing a new QR verifies every scan cell in both themes. That can
      // take tens of seconds per card and serialize an entire scrolled gallery.
      // Load a separately keyed preview instead. Warmers
      // and full-card callers still use the complete, scannable render path.
      const previewInput = {
        ...request.input,
        visibility: { ...request.input.visibility, showQRCode: false },
      };
      this.metrics?.updateRequestContext(requestId, {
        cacheKeyHash: keyDeriverModule.deriveKey(previewInput).hash,
        qrRequested: false,
      });
      return this.loadThumbnail(
        {
          ...request,
          input: previewInput,
        },
        requestId
      );
    }

    // Step 5: Need to render - queue to throttle concurrent renders
    request.onStatusChange?.({ state: "queued", position: 0 });
    const queueStartTime = performance.now();
    this.metrics?.startStage(requestId, "queue_wait");

    // Track queue depth
    const queueStats = renderQueue.getStats();
    this.metrics?.recordQueueState(requestId, queueStats);
    assertRequestActive();

    let queueWaitTime: number | undefined;
    let renderStartTime: number | undefined;
    let executedThisRequest = false;

    try {
      const result = await renderQueue.enqueue(
        key.hash,
        async (signal, reportActivity) => {
          if (renderQueue === this.backgroundQueue) {
            await this.waitForPreviewQueue(signal, reportActivity);
          }
          executedThisRequest = true;
          reportActivity();
          queueWaitTime = performance.now() - queueStartTime;
          renderStartTime = performance.now();

          // Render locally with progress tracking
          if (!request.signal?.aborted) {
            request.onStatusChange?.({ state: "rendering" });
          }
          const { blob, qrConsistent } = await this.renderer.render(
            request.sequence,
            key.inputs,
            request.qrPolicy === "prepared-only"
              ? { qrLookup: "prepared-only" }
              : undefined,
            (progress) => {
              if (signal.aborted || request.signal?.aborted) return;
              reportActivity();
              this.metrics?.recordProgress(requestId, progress);
              // Forward progress updates to status callback
              request.onStatusChange?.({
                state: "rendering",
                progress: {
                  current: progress.current,
                  total: progress.total,
                  stage: progress.stage,
                },
              });
            },
            signal,
            (stage, details) => {
              reportActivity();
              this.metrics?.startStage(requestId, stage, details);
            },
            reportActivity
          );

          // The queue deadline may have won while a non-cooperative renderer was
          // still finishing blob encoding. Never let that late completion create
          // a URL, populate caches, upload, or overwrite the timeout error state.
          if (signal.aborted) {
            throw new DOMException("Aborted", "AbortError");
          }

          const renderTime = performance.now() - renderStartTime;

          // Create blob URL for display
          const url = URL.createObjectURL(blob);

          // Persist ONLY when the render matches its key. A QR-on key whose QR
          // bitmap failed to produce yields a QR-less image — displaying it once
          // is fine, but caching/uploading it under the QR key would poison the
          // shared cache for everyone. Skip all cache writes so the next mount
          // retries (and succeeds once the short code / network is available).
          if (qrConsistent) {
            // Save to local cache (for ALL thumbnails - instant next time)
            this.localCache.set(key.hash, blob).catch(() => {});

            // Upload to cloud (for shared/default classes only — includes the
            // deterministic QR variant now)
            if (key.usesDefaults) {
              uploadToCloud(this, key, blob);
            }

            // Store in memory cache for instant revisits
            this.memoryCache.set(key.hash, url);
            this.renderedGenerations.set(key.hash, this.cacheGeneration);
          }
          this.completedCount++;
          this.metrics?.endRequest(requestId, "render", {
            queueWaitTime,
            renderTime,
          });
          if (!request.signal?.aborted) {
            request.onStatusChange?.({ state: "complete", url });
          }

          return {
            url,
            fromCache: false,
            key,
            cacheWriteSkippedReason: qrConsistent
              ? undefined
              : ("qr_inconsistent" as const),
          };
        },
        {
          priority: request.priority,
          consumerSignal: request.signal,
          // A QR thumbnail verifies and may rasterize every scan cell in both
          // themes before composition. Production traces showed three of these
          // competing in qr_bitmap for minutes, so they use the queue's
          // exclusive lane while ordinary worker renders remain concurrent.
          exclusive: key.inputs.visibility?.showQRCode === true,
        }
      );

      // A second card requesting the same key shares the queue promise. Its
      // request still needs a terminal metric even though the first card owned
      // the renderer callbacks.
      if (!executedThisRequest) {
        this.metrics?.endRequest(requestId, "render", {
          queueWaitTime: performance.now() - queueStartTime,
        });
      }
      return result;
    } catch (error) {
      const err = normalizeRenderError(error);

      // Let cancellations propagate
      if (isRenderCancellation(err)) {
        this.metrics?.cancelRequest(requestId);
        throw err;
      }

      // Log the error but don't throw - return a failed result gracefully
      // This prevents unhandled promise rejections for corrupt/orphaned sequences
      // Use debug level for orphaned sequences (data issue, not bug) to reduce console noise
      const errorCode = renderErrorCode(err);
      const isOrphanedSequence = errorCode === "ORPHANED_SEQUENCE";
      if (isOrphanedSequence) {
        console.debug(
          `[ThumbnailRenderOrchestrator] Orphaned sequence "${key.inputs.sequenceName}" - has no step data`
        );
      } else {
        console.warn(
          `[ThumbnailRenderOrchestrator] Failed to render "${key.inputs.sequenceName}":`,
          err.message
        );
      }
      const failureMetrics = this.metrics?.endRequest(requestId, "failed", {
        queueWaitTime,
        renderTime:
          renderStartTime === undefined
            ? undefined
            : performance.now() - renderStartTime,
        errorCode,
      });
      if (!isOrphanedSequence && failureMetrics) {
        captureThumbnailRenderFailure(err, failureMetrics);
      }
      request.onStatusChange?.({ state: "error", error: err });

      // Return a failed result instead of throwing
      return { url: null, fromCache: false, key, error: err };
    }
  }

  cancel(key: Pick<ThumbnailCacheKey, "hash">): void {
    this.queue.cancel(key.hash);
    this.backgroundQueue.cancel(key.hash);
  }

  cancelAll(): void {
    this.queue.cancelAll();
    this.backgroundQueue.cancelAll();
  }

  getBackgroundQueueStats(): { queued: number; active: number } {
    const { queued, active } = this.backgroundQueue.getStats();
    return { queued, active };
  }

  private waitForPreviewQueue(
    signal: AbortSignal,
    reportActivity: () => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const cleanup = () => {
        clearTimeout(timer);
        signal.removeEventListener("abort", onAbort);
      };
      const onAbort = () => {
        cleanup();
        reject(cancellationError(signal));
      };
      const check = () => {
        if (signal.aborted) return onAbort();
        const { active, queued } = this.queue.getStats();
        if (!active && !queued) {
          cleanup();
          resolve();
        } else {
          reportActivity();
          timer = setTimeout(check, 100);
        }
      };
      signal.addEventListener("abort", onAbort, { once: true });
      check();
    });
  }

  getQueueStats(): { queued: number; active: number; completed: number } {
    const queueStats = this.queue.getStats();
    return {
      queued: queueStats.queued,
      active: queueStats.active,
      completed: this.completedCount,
    };
  }

  buildCloudKey(key: ThumbnailCacheKey): CloudThumbnailKey {
    return {
      sequenceName: key.inputs.sequenceName,
      sequenceId: key.inputs.sequenceId,
      propType: key.propKey as PropType,
      lightMode: key.inputs.lightMode,
      variant: key.inputs.variant,
      showQRCode: key.inputs.visibility?.showQRCode ?? false,
      rendererVersion: key.rendererVersion,
    };
  }

  /**
   * Build key for static manifest lookup — current format.
   * Format: {variant}/{propType}/{sequenceName}_{sequenceId}_r{renderer}_{mode}
   * Mirrors the cloud storage path (sync-static-thumbnails.cjs downloads files
   * verbatim and derives manifest keys from the on-disk paths), so this must
   * stay in lockstep with getStoragePath() in cloud-thumbnail-cache.ts.
   */
  buildStaticKey(key: ThumbnailCacheKey): string {
    const modeSuffix = key.inputs.lightMode ? "_light" : "_dark";
    const idSuffix = key.inputs.sequenceId ? `_${key.inputs.sequenceId}` : "";
    const qrSuffix = key.inputs.visibility?.showQRCode ? "_qr" : "";
    const rendererSuffix = `_r${key.rendererVersion}`;
    return `${key.inputs.variant}/${key.propKey}/${sanitizeForStaticPath(
      `${key.inputs.sequenceName}${idSuffix}`
    )}${qrSuffix}${rendererSuffix}${modeSuffix}`;
  }

  /**
   * Legacy static key shape (pre-variant bundles):
   * {propType}/{sequenceName}_r{renderer}_{mode}.
   *
   * The renderer suffix is intentionally required here too. An unversioned
   * fallback would bypass a renderer migration and immediately restore the
   * stale raster this key is meant to invalidate.
   * The `_qr` suffix means QR-on requests never match a legacy (no-QR) file.
   */
  buildLegacyStaticKey(key: ThumbnailCacheKey): string {
    const modeSuffix = key.inputs.lightMode ? "_light" : "_dark";
    const qrSuffix = key.inputs.visibility?.showQRCode ? "_qr" : "";
    const rendererSuffix = `_r${key.rendererVersion}`;
    return `${key.propKey}/${sanitizeForStaticPath(key.inputs.sequenceName)}${qrSuffix}${rendererSuffix}${modeSuffix}`;
  }

  /**
   * Drop one hash from the in-memory URL cache so sibling mounts stop
   * re-serving a known-bad entry (the flood mechanism).
   */
  evictHash(hash: string): void {
    this.memoryCache.delete(hash);
  }
}
