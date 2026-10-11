import type {
  DownloadOptions,
  BatchDownloadOptions,
  DownloadResult,
} from "./types";
import { detectPlatform } from "#lib/shared/mobile/services/platform-detector.js";

export type NativeFileShareResult =
  | { status: "shared"; filename: string }
  | { status: "canceled"; filename: string }
  | { status: "unavailable"; filename: string; error?: Error }
  | { status: "failed"; filename: string; error: Error };

export interface NativeFileShareOptions {
  title?: string;
  text?: string;
}

/** Anchor (<a download>) to disk. The terminal fallback for every path here. */
function anchorDownload(blob: Blob, filename: string): Promise<DownloadResult> {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      resolve({ success: true, filename, method: "download" });
    } catch (error) {
      resolve({
        success: false,
        filename,
        method: "download",
        error: error as Error,
      });
    }
  });
}

function createShareData(
  blob: Blob,
  filename: string,
  options: NativeFileShareOptions
): ShareData {
  const file = new File([blob], filename, {
    type: blob.type || "application/octet-stream",
    lastModified: Date.now(),
  });

  return {
    files: [file],
    title: options.title,
    text: options.text,
  };
}

function errorFromUnknown(error: unknown): Error {
  if (error instanceof Error) return error;
  if (typeof error === "object" && error !== null) {
    const errorLike = error as { name?: unknown; message?: unknown };
    const normalized = new Error(
      typeof errorLike.message === "string" ? errorLike.message : String(error)
    );
    if (typeof errorLike.name === "string") {
      normalized.name = errorLike.name;
    }
    return normalized;
  }
  return new Error(String(error));
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : typeof error === "object" &&
        error !== null &&
        "name" in error &&
        error.name === "AbortError";
}

/** True when this browser advertises native file sharing. */
export function supportsNativeFileShare(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function" &&
    typeof navigator.canShare === "function" &&
    typeof File !== "undefined"
  );
}

/**
 * Checks the exact file payload without opening a share sheet.
 *
 * `canShare()` does not require transient activation, so callers can use this
 * while rendering a menu and reserve the later click for `share()`.
 */
export function canNativeShareFile(blob: Blob, filename: string): boolean {
  if (!supportsNativeFileShare()) return false;

  try {
    return navigator.canShare(createShareData(blob, filename, {}));
  } catch {
    return false;
  }
}

/**
 * Opens the native share sheet and reports the outcome without downloading.
 *
 * The call to `navigator.share()` happens before this function reaches its
 * first `await`. That preserves the click's transient activation on WebKit.
 * Download is intentionally a separate, explicit user choice.
 */
export async function shareBlobNatively(
  blob: Blob,
  filename: string,
  options: NativeFileShareOptions = {}
): Promise<NativeFileShareResult> {
  if (!supportsNativeFileShare()) {
    return { status: "unavailable", filename };
  }

  let sharePromise: Promise<void>;
  try {
    const shareData = createShareData(blob, filename, options);
    if (!navigator.canShare(shareData)) {
      return { status: "unavailable", filename };
    }

    // Keep this call before the first await. Safari/WebKit consumes the
    // initiating click's transient activation when the promise is created.
    sharePromise = navigator.share(shareData);
  } catch (error) {
    if (isAbortError(error)) {
      return { status: "canceled", filename };
    }
    return {
      status: "failed",
      filename,
      error: errorFromUnknown(error),
    };
  }

  try {
    await sharePromise;
    return { status: "shared", filename };
  } catch (error) {
    if (isAbortError(error)) {
      return { status: "canceled", filename };
    }
    return {
      status: "failed",
      filename,
      error: errorFromUnknown(error),
    };
  }
}

/** Explicitly downloads a blob. This never opens a native share sheet. */
export function downloadBlobToDisk(
  blob: Blob,
  filename: string
): Promise<DownloadResult> {
  return anchorDownload(blob, filename);
}

/**
 * Device-gated save: native share sheet on mobile, straight-to-disk on desktop.
 *
 * Thin alias over {@link shareOrDownloadBlob} (the single source of the platform
 * gate). The gate is load-bearing: desktop Chrome/Edge DO implement
 * `navigator.share`/`canShare`, so feature-detecting share alone pops the OS
 * (Windows/macOS) share sheet on desktop — which nobody wants for a file that
 * should just download. Gate on the DEVICE, not the capability.
 */
export async function downloadBlob(
  blob: Blob,
  filename: string,
  _options: DownloadOptions = {}
): Promise<DownloadResult> {
  return shareOrDownloadBlob(blob, filename);
}

/**
 * Share-first on mobile, download on desktop.
 *
 * On a mobile platform (`detectPlatform() !== "desktop"`) this opens the native
 * share sheet so the user chooses where the file lands (Files, Photos, AirDrop,
 * a message…) instead of a blind background download. On desktop the share sheet
 * is intrusive and the download location is known, so it goes straight to disk.
 *
 * The platform gate is deliberate: desktop Chrome DOES implement
 * `navigator.share`/`canShare`, so feature detection alone would pop the share
 * sheet on desktop too. Gate on the device, not the capability.
 *
 * Falls back to anchor download when share is unavailable, the file isn't
 * shareable, or share fails for any reason other than the user dismissing it
 * (e.g. transient-activation loss after a long export → just download).
 */
export async function shareOrDownloadBlob(
  blob: Blob,
  filename: string,
  options: NativeFileShareOptions = {}
): Promise<DownloadResult> {
  const isMobile = detectPlatform() !== "desktop";
  if (isMobile) {
    const result = await shareBlobNatively(blob, filename, options);
    if (result.status === "shared") {
      return { success: true, filename, method: "share" };
    }
    if (result.status === "canceled") {
      return { success: true, filename, method: "share", canceled: true };
    }
  }

  return anchorDownload(blob, filename);
}

/**
 * Prevents browser blocking multiple parallel downloads.
 */
export async function downloadBlobBatch(
  blobs: Array<{ blob: Blob; filename: string }>,
  options: BatchDownloadOptions = {}
): Promise<DownloadResult[]> {
  const results: DownloadResult[] = [];
  const delay = options.delay || 100;

  for (let i = 0; i < blobs.length; i++) {
    const item = blobs[i];
    if (!item) continue;
    const { blob, filename } = item;

    const result = await downloadBlob(blob, filename, options);
    results.push(result);

    if (i < blobs.length - 1 && delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  return results;
}

/**
 * Preserves Unicode, strips < > : " / \ | ? * and C0 control chars.
 */
export function sanitizeFilename(filename: string): string {
  return (
    filename
      // eslint-disable-next-line no-control-regex
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
      .replace(/\s+/g, " ")
      .replace(/^[.\s]+|[.\s]+$/g, "")
      .substring(0, 200)
  );
}

export function generateTimestampedFilename(
  baseName: string,
  extension: string,
  includeTime: boolean = true
): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = includeTime
    ? now.toISOString().slice(11, 19).replace(/:/g, "-")
    : "";

  const timestamp = includeTime ? `${date}_${time}` : date;
  const sanitizedBaseName = sanitizeFilename(baseName);

  return `${sanitizedBaseName}_${timestamp}.${extension}`;
}

export function supportsFileDownload(): boolean {
  try {
    return (
      typeof URL !== "undefined" &&
      typeof URL.createObjectURL === "function" &&
      typeof document.createElement === "function" &&
      "download" in document.createElement("a")
    );
  } catch {
    return false;
  }
}

export function getFileExtensionForMimeType(mimeType: string): string {
  const mimeTypeMap: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "application/pdf": "pdf",
    "text/plain": "txt",
    "application/json": "json",
  };

  return mimeTypeMap[mimeType.toLowerCase()] || "bin";
}
