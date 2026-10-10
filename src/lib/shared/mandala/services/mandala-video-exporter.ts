/**
 * Mandala Video Exporter — one-shot worker driver.
 *
 * Owns the *orchestration* of `mandala-export.worker.ts` for a single clip:
 * cache-busted worker construction, the message protocol, the `beforeunload`
 * guard, and teardown. It does NOT own delivery (the caller decides what to do
 * with the finished blob, e.g. `shareOrDownloadBlob`) nor any viewer look-state
 * (the caller passes a fully-built `MandalaFrameSpec`).
 *
 * Extracted from `MandalaViewerController.startExport()` so both the sequence
 * viewer and the Playground mandala surface drive the worker through one path
 * instead of each hand-rolling the postMessage handling.
 */

import type { MandalaFrameSpec } from "#lib/shared/mandala/services/mandala-frame-renderer.js";
import type {
  MandalaExportOut,
  MandalaExportDiag,
} from "#lib/shared/mandala/workers/mandala-export.worker.js";
// Vite emits the compiled export worker and hands back its URL as a string, so
// we can append a cache-busting version query before instantiating the Worker.
import exportWorkerUrl from "#lib/shared/mandala/workers/mandala-export.worker.ts?worker&url";

// A mandala is thin bright strokes on flat black — it compresses to far less
// than typical video at the same resolution. Lower bitrates cut entropy-coding
// work (faster encode) with no visible loss. Single home for bitrate policy,
// shared by every surface that exports a mandala clip.
export const MANDALA_BITRATE_BY_RES: Record<number, number> = {
  720: 6_000_000,
  1080: 10_000_000,
  2160: 20_000_000,
};

export function mandalaBitrateFor(resolution: number): number {
  return MANDALA_BITRATE_BY_RES[resolution] ?? MANDALA_BITRATE_BY_RES[1080]!;
}

export interface MandalaVideoExportCallbacks {
  /** "capturing" while frames render/encode, "encoding" during the final flush. */
  onPhase?: (phase: "capturing" | "encoding") => void;
  /** Encode progress, 0..1. */
  onProgress?: (fraction: number) => void;
  /** Optional live diagnostics (render/encode/mux split, HW status). */
  onDiag?: (diag: MandalaExportDiag) => void;
}

export interface MandalaVideoExportHandle {
  /** Resolves with the finished MP4 blob; rejects on worker error or cancel. */
  readonly done: Promise<Blob>;
  /** Cancel the in-flight export (tells the worker to stop, then terminates it). */
  cancel(): void;
}

/**
 * Spin up the mandala export worker for one clip and return a handle. The worker
 * runs the ENTIRE pipeline off the main thread — per-frame geometry, gradient/
 * glow render, rotation, and the H.264 encode — so any on-screen animation keeps
 * running without jank. The main thread only posts the spec once and reflects
 * progress via the callbacks.
 */
export function exportMandalaVideo(
  spec: MandalaFrameSpec,
  bitrate: number,
  callbacks: MandalaVideoExportCallbacks = {},
): MandalaVideoExportHandle {
  let worker: Worker | null = null;
  let beforeUnload: ((e: BeforeUnloadEvent) => void) | null = null;
  let settled = false;
  let rejectDone: (err: Error) => void = () => {};

  const clearBeforeUnload = (): void => {
    if (beforeUnload && typeof window !== "undefined") {
      window.removeEventListener("beforeunload", beforeUnload);
      beforeUnload = null;
    }
  };
  const disposeWorker = (): void => {
    if (worker) {
      worker.terminate();
      worker = null;
    }
  };

  const done = new Promise<Blob>((resolve, reject) => {
    rejectDone = reject;
    const finish = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      disposeWorker();
      clearBeforeUnload();
      fn();
    };

    // Cache-bust the worker entry URL: a SW / HTTP cache (esp. over a tunnel
    // host) can otherwise serve a stale worker bundle so codec/profile fixes
    // never take. `?worker&url` (Vite-native) yields the compiled worker's URL
    // as a string; tag it with a unique version query before constructing the
    // Worker so the browser always refetches the entry.
    let workerUrl: URL;
    try {
      workerUrl = new URL(exportWorkerUrl, window.location.href);
      // Date.now via performance origin — Math.random/Date.now are fine here (not
      // a workflow script); a monotonically-changing tag is all we need.
      workerUrl.searchParams.set("v", String(Date.now()));
      worker = new Worker(workerUrl, { type: "module" });
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
      return;
    }

    beforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    if (typeof window !== "undefined") window.addEventListener("beforeunload", beforeUnload);

    worker.onmessage = (e: MessageEvent<MandalaExportOut>) => {
      const msg = e.data;
      switch (msg.type) {
        case "diag":
          callbacks.onDiag?.(msg);
          break;
        case "progress":
          callbacks.onProgress?.(msg.frameIndex / msg.totalFrames);
          break;
        case "finalizing":
          callbacks.onPhase?.("encoding");
          break;
        case "complete":
          finish(() => resolve(new Blob([msg.buffer], { type: "video/mp4" })));
          break;
        case "error":
          finish(() => reject(new Error(msg.error)));
          break;
      }
    };
    worker.onerror = (e) => {
      finish(() => reject(new Error(e.message || "Mandala export worker crashed")));
    };

    callbacks.onPhase?.("capturing");
    worker.postMessage({ type: "start", spec, bitrate });
  });

  // Swallow unhandled-rejection noise if the caller only awaits via cancel().
  done.catch(() => {});

  return {
    done,
    cancel(): void {
      if (settled) return;
      if (worker) {
        try {
          worker.postMessage({ type: "cancel" });
        } catch {
          // ignore — worker may already be gone
        }
      }
      settled = true;
      disposeWorker();
      clearBeforeUnload();
      rejectDone(new Error("Mandala export cancelled"));
    },
  };
}
