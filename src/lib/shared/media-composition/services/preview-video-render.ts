import {
  PREVIEW_STALL_MS,
  type PreviewVideoCopy,
} from "../domain/preview-video";

type PreviewWorkerMessage =
  | { type: "progress"; progress: number }
  | { type: "error"; reason: string }
  | ({ type: "done"; buffer: ArrayBuffer } & Omit<PreviewVideoCopy, "blob">);

export function renderPreviewVideo(
  sourceUrl: string,
  signal: AbortSignal,
  onProgress: (progress: number) => void
): Promise<PreviewVideoCopy> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error("Preview preparation cancelled"));
      return;
    }
    const worker = new Worker(
      new URL("../workers/preview-video.worker.ts", import.meta.url),
      { type: "module" }
    );
    const finish = (error?: Error, copy?: PreviewVideoCopy) => {
      clearTimeout(stall);
      signal.removeEventListener("abort", abort);
      worker.terminate();
      if (copy) resolve(copy);
      else reject(error ?? new Error("Preview preparation failed"));
    };
    const abort = () => finish(new Error("Preview preparation cancelled"));
    // A long 4K recording takes minutes to copy; only a copy that stops
    // moving is given up.
    let stall = setTimeout(stalled, PREVIEW_STALL_MS);
    function stalled() {
      finish(new Error("Preview preparation stopped making progress"));
    }
    signal.addEventListener("abort", abort, { once: true });
    worker.onmessage = (event: MessageEvent<PreviewWorkerMessage>) => {
      const result = event.data;
      if (result.type === "progress") {
        clearTimeout(stall);
        stall = setTimeout(stalled, PREVIEW_STALL_MS);
        onProgress(result.progress);
        return;
      }
      if (result.type === "error") {
        finish(new Error(result.reason));
        return;
      }
      const { buffer, type: _type, ...metadata } = result;
      finish(undefined, {
        ...metadata,
        blob: new Blob([buffer], { type: "video/mp4" }),
      });
    };
    worker.onerror = (event) =>
      finish(new Error(event.message || "Preview worker failed"));
    worker.onmessageerror = () =>
      finish(new Error("Preview worker returned unreadable data"));
    try {
      worker.postMessage({ sourceUrl });
    } catch (error) {
      finish(
        error instanceof Error
          ? error
          : new Error("Preview worker could not start")
      );
    }
  });
}
