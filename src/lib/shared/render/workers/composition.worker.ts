//
// Off-thread composition worker for thumbnail / export rendering.
// Instantiated by CompositionDispatcher as a pool of N workers.
//
// Transitive-import strategy:
//   ImageComposer (and its deps) pull in Svelte stores and $app/environment
//   at module level. We dynamic-import the entire pipeline so failures are
//   caught at init time and the dispatcher falls back to the main thread.

import type {
  CompositionWorkerInMessage,
  CompositionWorkerOutMessage,
  GlyphTransferEntry,
} from "../services/composition-dispatcher";
import type { CompositionProgressCallback, RenderCanvas } from "../services/types";
import type { ImageComposer } from '../services/image-composer';
import type { PictographBlobCache } from '../services/pictograph-blob-cache';
import type { PictographMemoryCache } from '../services/pictograph-memory-cache';
import type { TextRenderer } from '../services/text-renderer';

// Worker-safe cache stubs
// The worker performs fresh renders every time — caching is handled by the
// main-thread ThumbnailRenderOrchestrator. These stubs satisfy the
// ImageComposer constructor without pulling in IndexedDB ($app/environment)
// or HTMLImageElement (PictographMemoryCache).

/** No-op blob cache — worker renders are not persisted to IndexedDB. */
class WorkerBlobCache {
  async get(_key: string): Promise<Blob | null> {
    return null;
  }
  async put(_key: string, _blob: Blob): Promise<void> {}
  async delete(_key: string): Promise<void> {}
  async clear(): Promise<void> {}
  async getStats() {
    return { count: 0, sizeBytes: 0, maxSizeBytes: 0 };
  }
}

/** No-op memory cache — worker has no HTMLImageElement support. */
class WorkerMemoryCache {
  getKey(baseHash: string, size: number): string {
    return `${baseHash}:${size}`;
  }
  get(_key: string): undefined {
    return undefined;
  }
  set(_key: string, _img: unknown): void {}
  delete(_key: string): void {}
  clear(): void {}
  get size(): number {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const activeRenders = new Map<number, { cancelled: boolean }>();

// Pipeline singletons — created lazily at init
let imageComposer: InstanceType<
  typeof ImageComposer
> | null = null;
let workerTextRenderer: InstanceType<
  typeof TextRenderer
> | null = null;

// ---------------------------------------------------------------------------
// Messaging helpers
// ---------------------------------------------------------------------------

function postResult(
  msg: CompositionWorkerOutMessage,
  transfer?: Transferable[],
): void {
  self.postMessage(msg, { transfer: transfer ?? [] });
}

// ---------------------------------------------------------------------------
// Init — build the render pipeline inside the worker
// ---------------------------------------------------------------------------

async function handleInit(
  glyphs: ImageBitmap[],
  glyphMeta: GlyphTransferEntry[],
  bundle: import("../services/card-asset-bundle").AssetBundle,
  overrideBundle: import("../services/override-placement-bundle").OverridePlacementBundle,
): Promise<void> {
  // Dynamic-import the pipeline classes.  If any import fails (e.g. because a
  // transitive dep references `document` or Svelte stores), the error
  // propagates to the dispatcher which falls back to the main thread.
  const [
    { ImageComposer },
    { TextRenderer },
    { Canvas2DDirectRenderer },
    { LayerCompositor },
    { PictographKeyHasher },
    { registerWorkerLoopDisplayResolver },
  ] = await Promise.all([
    import("../services/image-composer"),
    import("../services/text-renderer"),
    import("../services/canvas-2d-direct-renderer"),
    import("../services/layer-compositor"),
    import("../services/pictograph-key-hasher"),
    import("$lib/shared/composition-root/worker-loop-display-resolver"),
  ]);

  registerWorkerLoopDisplayResolver();

  // --- TextRenderer: populate with transferred glyph bitmaps ---
  workerTextRenderer = new TextRenderer();
  const entries = glyphMeta.map((meta, i) => ({
    letter: meta.letter,
    bitmap: glyphs[i]!,
    naturalWidth: meta.naturalWidth,
    naturalHeight: meta.naturalHeight,
    isDash: meta.isDash,
  }));
  workerTextRenderer.setGlyphBitmaps(entries);

  // --- Render pipeline ---
  const keyHasher = new PictographKeyHasher();
  const canvas2DRenderer = new Canvas2DDirectRenderer();
  await canvas2DRenderer.initialize();
  const layerCompositor = new LayerCompositor();

  // Worker-safe cache stubs (see class definitions above)
  const blobCache = new WorkerBlobCache();
  const memoryCache = new WorkerMemoryCache();

  imageComposer = new ImageComposer(
    workerTextRenderer,
    blobCache as unknown as PictographBlobCache,         // satisfies PictographBlobCache interface
    keyHasher,
    memoryCache as unknown as PictographMemoryCache,       // satisfies PictographMemoryCache interface
    canvas2DRenderer,
    layerCompositor,
  );

  // Seed the singleton SVG caches from the transferred bundle so the worker
  // NEVER calls createImageBitmap(svgBlob) (which fails on the app's SVGs in
  // worker scope). Built on the main thread, index-aligned keys/bitmaps + grids.
  const { seedCachesFromBundle } = await import("../services/card-asset-bundle");
  seedCachesFromBundle(bundle);
  const { seedOverrideResolvers } = await import("../services/seed-override-resolvers");
  seedOverrideResolvers(overrideBundle);
  console.log("[composition.worker] seeded glyphs:", glyphMeta.length, "bundle keys:", bundle.keys.length, "grids:", Object.values(bundle.grids).filter(Boolean).length);

  // Load Gelasio (metric-compatible Georgia) into the worker FontFaceSet so step
  // labels + footer text match the main thread. local('Georgia') is blocked in
  // workers, so we load the bundled woff2 by URL.
  const { loadGelasioInto } = await import("../services/gelasio-fonts");
  await loadGelasioInto((self as unknown as WorkerGlobalScope & { fonts: FontFaceSet }).fonts);

  postResult({ type: "init-done" });
}

// ---------------------------------------------------------------------------
// Compose — render a sequence/card image and return ImageBitmap
// ---------------------------------------------------------------------------

async function handleCompose(
  msg: Extract<CompositionWorkerInMessage, { type: "compose" }>,
): Promise<void> {
  const { id, sequence, options } = msg;
  const renderState = { cancelled: false };
  activeRenders.set(id, renderState);

  try {
    if (!imageComposer) {
      throw new Error("Worker not initialized");
    }

    const effectiveOptions = { ...options };
    // The QR bitmap is rendered on the main thread (the worker has no Firebase /
    // QR generator) and transferred in. Attach it so composeSequenceImage's
    // renderQRCode draws it instead of generating. Not part of the serialized
    // options — it arrived via the transfer list.
    if (msg.qrBitmap) {
      (effectiveOptions as { qrImageBitmap?: CanvasImageSource }).qrImageBitmap = msg.qrBitmap;
    }

    // Pseudo AbortSignal that checks the local cancelled flag.
    // ImageComposer checks signal?.aborted between beats.
    const pseudoSignal = {
      get aborted() {
        return renderState.cancelled;
      },
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() {
        return false;
      },
      onabort: null,
      reason: undefined,
      throwIfAborted() {
        if (renderState.cancelled)
          throw new DOMException("Aborted", "AbortError");
      },
    } as AbortSignal;

    const onProgress: CompositionProgressCallback = (progress) => {
      if (renderState.cancelled) return;
      postResult({
        type: "progress",
        id,
        current: progress.current,
        total: progress.total,
        stage: progress.stage,
      });
    };

    let canvas: RenderCanvas = effectiveOptions.cardMode
      ? await imageComposer.composeCardImage(
          sequence,
          effectiveOptions,
          onProgress,
          pseudoSignal,
        )
      : await imageComposer.composeSequenceImage(
          sequence,
          effectiveOptions,
          onProgress,
          pseudoSignal,
        );

    // Front card frame: wrap the rendered content in the MPC stripe border +
    // glow so the worker returns a full framed card (matches renderFront). The
    // frame module builds an OffscreenCanvas in worker scope (createRenderCanvas).
    if (effectiveOptions.frontCardFrame) {
      const { wrapContentInCardFrame } = await import(
        "$lib/features/choreo-card/services/card-front-frame"
      );
      canvas = wrapContentInCardFrame(
        canvas as CanvasImageSource,
        effectiveOptions.frontCardFrame,
      );
    }

    if (renderState.cancelled) {
      postResult({
        type: "error",
        id,
        message: "Render cancelled (AbortError)",
      });
      return;
    }

    // Convert to ImageBitmap for zero-copy transfer to main thread
    let bitmap: ImageBitmap;
    if (canvas instanceof OffscreenCanvas) {
      bitmap = canvas.transferToImageBitmap();
    } else {
      bitmap = await createImageBitmap(canvas as ImageBitmapSource);
    }

    postResult({ type: "result", id, bitmap }, [bitmap]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    postResult({ type: "error", id, message });
  } finally {
    activeRenders.delete(id);
  }
}

// ---------------------------------------------------------------------------
// Message router
// ---------------------------------------------------------------------------

self.onmessage = (event: MessageEvent<CompositionWorkerInMessage>) => {
  const msg = event.data;

  switch (msg.type) {
    case "init":
      handleInit(msg.glyphs, msg.glyphMeta, msg.bundle, msg.overrideBundle).catch((err) => {
        console.error("[composition.worker] Init failed:", err);
        postResult({
          type: "error",
          id: -1,
          message: `Init failed: ${err instanceof Error ? err.message : String(err)}`,
        });
      });
      break;

    case "probe":
      // Capability check: paint a minimal SVG-free back job (no seeded bundle
      // needed — mandala/decorations null) and report whether it produced
      // non-blank pixels. Proves init -> OffscreenCanvas -> paint end to end.
      (async () => {
        try {
          const { paintBackJob } = await import(
            "$lib/features/choreo-card/services/card-back/card-back-raster"
          );
          const job = {
            width: 64,
            height: 64,
            bleedPx: 4,
            borderPx: 8,
            borderGradient: {
              type: "linear",
              angleDeg: 0,
              stops: [
                { offset: 0, color: "#000" },
                { offset: 1, color: "#000" },
              ],
            },
            bgGradient: {
              type: "linear",
              angleDeg: 0,
              stops: [
                { offset: 0, color: "#fff" },
                { offset: 1, color: "#fff" },
              ],
            },
            decorations: null,
            mandala: null,
            bitmaps: [],
          };
          const off = paintBackJob(job as never);
          const ctx = off.getContext("2d")!;
          const px = ctx.getImageData(0, 0, off.width, off.height).data;
          let nonZero = 0;
          for (let i = 3; i < px.length; i += 4) if (px[i] !== 0) nonZero++;
          postResult({ type: "probe-result", ok: nonZero > 0 });
        } catch (err) {
          postResult({ type: "probe-result", ok: false, error: String(err) });
        }
      })();
      break;

    case "update-overrides":
      // Re-seed the override resolver seam in place (arrow placements changed via
      // Fix Arrows). Cheap: rebuilds the four *State instances from the new bundle
      // and re-registers resolvers — the asset/SVG caches are untouched.
      (async () => {
        try {
          const { seedOverrideResolvers } = await import(
            "../services/seed-override-resolvers"
          );
          seedOverrideResolvers(msg.overrideBundle);
        } catch (err) {
          console.error("[composition.worker] update-overrides failed:", err);
        }
      })();
      break;

    case "compose":
      handleCompose(msg).catch((err) => {
        console.error("[composition.worker] Compose failed:", err);
        postResult({
          type: "error",
          id: msg.id,
          message: err instanceof Error ? err.message : String(err),
        });
      });
      break;

    case "cancel": {
      const state = activeRenders.get(msg.id);
      if (state) state.cancelled = true;
      break;
    }
  }
};
