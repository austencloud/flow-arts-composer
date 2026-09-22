import { getErrorHandler } from "$lib/shared/application/get-error-handler";
import { authedFetch } from "$lib/shared/auth/services/authed-fetch";
import { isWeb } from "$lib/shared/platform/services/platform-detector";
import { dev } from "$app/environment";
import {
  getUploadUrl,
  startMultipart,
  getPartUrl,
  completeMultipart,
  listParts,
  deleteByPrefix,
} from "./r2-presigner";
import { getAuthSync } from "$lib/shared/auth/firebase";
import type { ErrorHandler } from "$lib/shared/application/services/error-handler";
import type {
  VideoUploadResult,
  UploadOptions,
  MultipartUploadState,
} from "./types";

const MULTIPART_THRESHOLD = 100 * 1024 * 1024;
const PART_SIZE = 10 * 1024 * 1024;
const MAX_CONCURRENT_PARTS = 3;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;
const THUMBNAIL_UPLOAD_TIMEOUT_MS = 30_000;
// A hung PUT (connection opens but no bytes move — flaky mobile, a stalled
// proxy/Private Relay, a captive portal) never fires onload OR onerror, so
// without this it blocks the awaiting save/upload forever. XHR's own
// `timeout`/`ontimeout` is a TOTAL-duration limit that would also kill a slow
// but healthy large multipart part on a weak connection, so instead we watch
// upload *progress*: if no bytes move for this long, abort and let the retry
// loop treat it as a transient network error.
const UPLOAD_STALL_TIMEOUT_MS = 30_000;
const UPLOAD_STALL_CHECK_MS = 5_000;
const STORAGE_KEY = "tka-multipart-uploads";
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

async function computeFileFingerprint(file: File | Blob): Promise<string> {
  const SAMPLE_SIZE = 1024 * 1024;
  const head = file.slice(0, SAMPLE_SIZE);
  const tail = file.slice(Math.max(0, file.size - SAMPLE_SIZE));
  const combined = new Blob([head, tail]);
  const buffer = await combined.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return (
    hashArray.map((b) => b.toString(16).padStart(2, "0")).join("") +
    `-${file.size}`
  );
}

function loadMultipartState(): Record<
  string,
  MultipartUploadState & {
    startedAt: number;
    fileName: string;
    fileSize: number;
  }
> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveMultipartState(
  fingerprint: string,
  state: MultipartUploadState & {
    startedAt: number;
    fileName: string;
    fileSize: number;
  }
): void {
  const all = loadMultipartState();
  all[fingerprint] = state;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

function removeMultipartState(fingerprint: string): void {
  const all = loadMultipartState();
  delete all[fingerprint];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

function purgeStaleEntries(): void {
  const all = loadMultipartState();
  const now = Date.now();
  let changed = false;
  for (const [key, entry] of Object.entries(all)) {
    if (now - entry.startedAt > STALE_THRESHOLD_MS) {
      delete all[key];
      changed = true;
    }
  }
  if (changed) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  }
}

function xhrPutOnce(
  url: string,
  body: Blob,
  contentType: string,
  options?: {
    onProgress?: (loaded: number, total: number) => void;
    signal?: AbortSignal;
  }
): Promise<{ etag: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    // Single-settle guard: the stall watchdog aborts the xhr, which then also
    // fires onerror — without this, both would try to reject the same promise.
    let settled = false;
    let lastProgressAt = Date.now();
    let stallTimer: ReturnType<typeof setInterval> | null = null;
    let abortHandler: (() => void) | null = null;
    const stop = () => {
      if (stallTimer !== null) {
        clearInterval(stallTimer);
        stallTimer = null;
      }
      if (abortHandler && options?.signal) {
        options.signal.removeEventListener("abort", abortHandler);
        abortHandler = null;
      }
    };
    const done = <T>(fn: (v: T) => void, v: T) => {
      if (settled) return;
      settled = true;
      stop();
      fn(v);
    };

    if (options?.signal) {
      if (options.signal.aborted) {
        reject(new DOMException("Upload aborted", "AbortError"));
        return;
      }
      abortHandler = () => {
        done(reject, new DOMException("Upload aborted", "AbortError"));
        xhr.abort();
      };
      options.signal.addEventListener("abort", abortHandler, { once: true });
    }

    xhr.open("PUT", url, true);
    xhr.setRequestHeader("Content-Type", contentType);

    xhr.upload.onprogress = (event) => {
      lastProgressAt = Date.now();
      if (event.lengthComputable && options?.onProgress) {
        options.onProgress(event.loaded, event.total);
      }
    };
    xhr.upload.onload = () => {
      lastProgressAt = Date.now();
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const etag = xhr.getResponseHeader("ETag") || "";
        done(resolve, { etag });
      } else {
        done(
          reject,
          new Error(
            `Upload failed with status ${xhr.status}: ${xhr.statusText}`
          )
        );
      }
    };

    xhr.onerror = () => {
      let host = "unknown";
      try {
        host = new URL(url).host;
      } catch {
        /* ignore */
      }
      // Do NOT assert CORS here: onerror fires for ANY network-level failure
      // (offline, blocked by a privacy/ad extension, DNS, dropped connection),
      // and asserting a misconfigured bucket sent real debugging down a dead end
      // when the CORS policy was in fact correct. State the observable and stop.
      const err: Error & { isNetworkError?: boolean } = new Error(
        `Network error uploading to ${host} from ${location.origin} ` +
          `(offline, blocked by an extension/proxy, or CORS).`
      );
      err.isNetworkError = true;
      done(reject, err);
    };

    stallTimer = setInterval(() => {
      if (Date.now() - lastProgressAt > UPLOAD_STALL_TIMEOUT_MS) {
        const err: Error & { isNetworkError?: boolean } = new Error(
          `Upload stalled: no progress for ${Math.round(UPLOAD_STALL_TIMEOUT_MS / 1000)}s`
        );
        err.isNetworkError = true;
        done(reject, err);
        try {
          xhr.abort();
        } catch {
          /* ignore */
        }
      }
    }, UPLOAD_STALL_CHECK_MS);

    try {
      xhr.send(body);
    } catch (error) {
      done(reject, error instanceof Error ? error : new Error(String(error)));
    }
  });
}

async function xhrPut(
  url: string,
  body: Blob,
  contentType: string,
  options?: {
    onProgress?: (loaded: number, total: number) => void;
    signal?: AbortSignal;
  }
): Promise<{ etag: string }> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await xhrPutOnce(url, body, contentType, options);
    } catch (error: unknown) {
      const errRecord = error as Record<string, unknown> | null;
      const isAbort = errRecord?.name === "AbortError";
      const isNetworkError = errRecord?.isNetworkError === true;
      const isLastAttempt = attempt === MAX_RETRIES - 1;

      if (isAbort || !isNetworkError || isLastAttempt) {
        throw error;
      }

      const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
      console.warn(
        `R2 upload attempt ${attempt + 1}/${MAX_RETRIES} failed (network error), retrying in ${delay}ms...`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error("Upload failed after retries");
}

function createThumbnailAttemptSignal(parent?: AbortSignal): {
  signal: AbortSignal;
  dispose: () => void;
} {
  const controller = new AbortController();
  const forwardParentAbort = () => {
    controller.abort(parent?.reason);
  };

  if (parent?.aborted) {
    forwardParentAbort();
  } else {
    parent?.addEventListener("abort", forwardParentAbort, { once: true });
  }

  const timeout = setTimeout(() => {
    controller.abort(
      new DOMException("Thumbnail upload timed out", "TimeoutError")
    );
  }, THUMBNAIL_UPLOAD_TIMEOUT_MS);

  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timeout);
      parent?.removeEventListener("abort", forwardParentAbort);
    },
  };
}

/** File extension for a share artifact, keyed off the blob's own content type
 *  so a JPEG card does not land under a .png key. */
function shareArtifactExtension(contentType: string, isVideo: boolean): string {
  switch (contentType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "video/mp4":
      return "mp4";
    case "video/webm":
      return "webm";
    default:
      return isVideo ? "mp4" : "png";
  }
}

function normalizeError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    const normalized = new Error(error.message);
    if ("name" in error && typeof error.name === "string") {
      normalized.name = error.name;
    }
    return normalized;
  }
  return new Error(String(error));
}

function abortError(signal?: AbortSignal): Error {
  return signal?.reason !== undefined
    ? normalizeError(signal.reason)
    : new DOMException("Upload aborted", "AbortError");
}

function isVideoUploadResult(value: unknown): value is VideoUploadResult {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<VideoUploadResult>;
  return typeof candidate.url === "string" && typeof candidate.key === "string";
}

async function uploadSequenceThumbnailFirstParty(
  sequenceId: string,
  thumbnailBlob: Blob,
  contentType: string,
  options?: UploadOptions
): Promise<VideoUploadResult> {
  const query = new URLSearchParams({ sequenceId });
  const endpoint = `/api/thumbnail?${query.toString()}`;
  let lastError: Error | null = null;

  options?.onProgress?.(0);

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (options?.signal?.aborted) {
      throw abortError(options.signal);
    }

    if (attempt > 0) {
      const delay = RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    const attemptSignal = createThumbnailAttemptSignal(options?.signal);
    try {
      const response = await authedFetch(endpoint, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": contentType,
        },
        body: thumbnailBlob,
        signal: attemptSignal.signal,
      });

      if (response.ok) {
        const result: unknown = await response.json();
        if (!isVideoUploadResult(result)) {
          throw new Error("Thumbnail upload returned an invalid response");
        }
        options?.onProgress?.(100);
        return result;
      }

      const detail = (await response.text()).trim().slice(0, 300);
      const error = new Error(
        `Thumbnail upload failed with status ${response.status}` +
          (detail ? `: ${detail}` : "")
      );
      const isLastAttempt = attempt === MAX_RETRIES - 1;
      if (response.status < 500 || isLastAttempt) {
        throw error;
      }
      lastError = error;
    } catch (error) {
      if (options?.signal?.aborted) {
        throw abortError(options.signal);
      }

      const normalized = normalizeError(error);
      const timedOut =
        attemptSignal.signal.aborted &&
        normalizeError(attemptSignal.signal.reason).name === "TimeoutError";
      const retryable = timedOut || normalized.name === "TypeError";
      const isLastAttempt = attempt === MAX_RETRIES - 1;

      if (!retryable || isLastAttempt) {
        throw normalized;
      }
      lastError = normalized;
    } finally {
      attemptSignal.dispose();
    }
  }

  throw lastError ?? new Error("Thumbnail upload failed after retries");
}

export class R2VideoUploader {
  constructor() {
    if (typeof window !== "undefined") {
      purgeStaleEntries();
    }
  }

  private getUserId(): string {
    const user = getAuthSync().currentUser;
    if (!user) {
      throw new Error("User must be authenticated to upload");
    }
    return user.uid;
  }

  private handleError(
    error: unknown,
    action: string,
    additionalData?: Record<string, unknown>
  ): never {
    console.error(`R2VideoUploader: Failed to ${action}:`, error);
    const errorHandler = getErrorHandler() as ErrorHandler;
    errorHandler.showUserError({
      message: `Couldn't ${action.replace(/-/g, " ")}`,
      technicalDetails: error instanceof Error ? error.message : String(error),
      error: error instanceof Error ? error : new Error(String(error)),
      severity: "error",
      context: {
        module: "share",
        action,
        additionalData,
      },
    });
    throw error;
  }

  private async uploadSingle(
    fileName: string,
    contentType: string,
    file: File | Blob,
    userId: string,
    category: string,
    sequenceId: string,
    options?: UploadOptions
  ): Promise<VideoUploadResult> {
    const { presignedUrl, publicUrl, key } = await getUploadUrl({
      fileName,
      contentType,
      contentLength: file.size,
      userId,
      category,
      sequenceId,
    });

    await xhrPut(presignedUrl, file, contentType, {
      onProgress: (loaded, total) => {
        options?.onProgress?.(Math.round((loaded / total) * 100));
      },
      signal: options?.signal,
    });

    return { url: publicUrl, key };
  }

  private async uploadMultipart(
    fileName: string,
    contentType: string,
    file: File | Blob,
    userId: string,
    category: string,
    sequenceId: string,
    options?: UploadOptions
  ): Promise<VideoUploadResult> {
    const totalParts = Math.ceil(file.size / PART_SIZE);
    const fingerprint = await computeFileFingerprint(
      file instanceof File ? file : new File([file], "blob")
    );

    let savedState = loadMultipartState()[fingerprint] as
      | (MultipartUploadState & {
          startedAt: number;
          fileName: string;
          fileSize: number;
        })
      | undefined;
    let uploadId: string;
    let key: string;
    let completedParts: Array<{ ETag: string; PartNumber: number }> = [];

    if (savedState && !savedState.startedAt) {
      removeMultipartState(fingerprint);
      savedState = undefined;
    }

    if (savedState) {
      const { parts: confirmedParts, expired } = await listParts({
        key: savedState.key,
        uploadId: savedState.uploadId,
      });

      if (expired) {
        removeMultipartState(fingerprint);
        const startResult = await startMultipart({
          fileName,
          contentType,
          userId,
          category,
          sequenceId,
        });
        uploadId = startResult.uploadId;
        key = startResult.key;
      } else {
        uploadId = savedState.uploadId;
        key = savedState.key;
        completedParts = confirmedParts.map((p) => ({
          ETag: p.ETag,
          PartNumber: p.PartNumber,
        }));
      }
    } else {
      const startResult = await startMultipart({
        fileName,
        contentType,
        userId,
        category,
        sequenceId,
      });
      uploadId = startResult.uploadId;
      key = startResult.key;
    }

    const completedPartNumbers = new Set(
      completedParts.map((p) => p.PartNumber)
    );
    const missingParts: number[] = [];
    for (let i = 1; i <= totalParts; i++) {
      if (!completedPartNumbers.has(i)) {
        missingParts.push(i);
      }
    }

    const partProgress = new Map<number, number>();
    const totalBytes = file.size;
    let completedBytes = 0;
    for (const pn of completedPartNumbers) {
      const start = (pn - 1) * PART_SIZE;
      const end = Math.min(start + PART_SIZE, file.size);
      completedBytes += end - start;
    }

    const updateOverallProgress = () => {
      let current = completedBytes;
      for (const bytes of partProgress.values()) {
        current += bytes;
      }
      options?.onProgress?.(Math.round((current / totalBytes) * 100));
    };

    const uploadPart = async (partNumber: number) => {
      const start = (partNumber - 1) * PART_SIZE;
      const end = Math.min(start + PART_SIZE, file.size);
      const chunk = file.slice(start, end);

      const { presignedUrl } = await getPartUrl({
        key,
        uploadId,
        partNumber,
      });

      const { etag } = await xhrPut(presignedUrl, chunk, contentType, {
        onProgress: (loaded) => {
          partProgress.set(partNumber, loaded);
          updateOverallProgress();
        },
        signal: options?.signal,
      });

      partProgress.delete(partNumber);
      completedBytes += end - start;

      const part = { ETag: etag, PartNumber: partNumber };
      completedParts.push(part);

      saveMultipartState(fingerprint, {
        uploadId,
        key,
        completedParts,
        totalParts,
        partSize: PART_SIZE,
        startedAt: savedState?.startedAt ?? Date.now(),
        fileName: file instanceof File ? file.name : "blob",
        fileSize: file.size,
      });
    };

    const queue = [...missingParts];
    const workers: Promise<void>[] = [];

    for (let i = 0; i < Math.min(MAX_CONCURRENT_PARTS, queue.length); i++) {
      workers.push(
        (async () => {
          while (queue.length > 0) {
            const partNumber = queue.shift()!;
            await uploadPart(partNumber);
          }
        })()
      );
    }

    await Promise.all(workers);

    completedParts.sort((a, b) => a.PartNumber - b.PartNumber);

    const { publicUrl } = await completeMultipart({
      key,
      uploadId,
      parts: completedParts,
    });

    removeMultipartState(fingerprint);

    return { url: publicUrl, key };
  }

  async uploadPerformanceVideo(
    sequenceId: string,
    videoFile: File | Blob,
    options?: UploadOptions
  ): Promise<VideoUploadResult> {
    return this.uploadAssociatedVideo(sequenceId, videoFile, options);
  }

  /** Upload footage associated with a sequence or a saved artwork. The caller
   * supplies a namespaced key such as `tunnel:<id>` so unrelated subjects can
   * never collide in the user's recordings folder. */
  async uploadAssociatedVideo(
    subjectKey: string,
    videoFile: File | Blob,
    options?: UploadOptions
  ): Promise<VideoUploadResult> {
    try {
      const userId = this.getUserId();
      const timestamp = Date.now();
      const extension =
        videoFile instanceof File
          ? videoFile.name.split(".").pop() || "mp4"
          : "mp4";
      const fileName = `${timestamp}.${extension}`;
      const contentType = videoFile.type || "video/mp4";

      if (videoFile.size >= MULTIPART_THRESHOLD) {
        return await this.uploadMultipart(
          fileName,
          contentType,
          videoFile,
          userId,
          "recordings",
          subjectKey,
          options
        );
      }
      return await this.uploadSingle(
        fileName,
        contentType,
        videoFile,
        userId,
        "recordings",
        subjectKey,
        options
      );
    } catch (error) {
      if ((error as Error).name === "AbortError") throw error;
      return this.handleError(error, "upload-video", { subjectKey });
    }
  }

  async uploadAnimatedSequence(
    sequenceId: string,
    animationBlob: Blob,
    format: "webp",
    options?: UploadOptions
  ): Promise<VideoUploadResult> {
    try {
      const userId = this.getUserId();
      const fileName = `sequence.${format}`;
      const contentType = "image/webp";

      return await this.uploadSingle(
        fileName,
        contentType,
        animationBlob,
        userId,
        "animations",
        sequenceId,
        options
      );
    } catch (error) {
      if ((error as Error).name === "AbortError") throw error;
      return this.handleError(error, "upload-animation", {
        sequenceId,
        format,
      });
    }
  }

  /**
   * Upload a share artifact (card PNG or exported video) so a phone can fetch
   * it by QR, and so Phase 2's Graph API publish has a URL to hand Meta.
   *
   * Timestamped filename on purpose: this must never overwrite the sequence's
   * canonical thumbnail the way uploadSequenceThumbnail would. Lands under the
   * same per-user prefixes deleteSequenceAssets already sweeps, so a deleted
   * sequence takes its handoff artifacts with it.
   */
  async uploadShareArtifact(
    sequenceId: string,
    blob: Blob,
    artifact: "card" | "video",
    options?: UploadOptions
  ): Promise<VideoUploadResult> {
    try {
      const userId = this.getUserId();
      const timestamp = Date.now();
      const isVideo = artifact === "video";
      const contentType = blob.type || (isVideo ? "video/mp4" : "image/png");
      // The extension follows the blob, not the artifact kind: Instagram's
      // container endpoint accepts JPEG only, so a card bound for a direct
      // post arrives here already converted and must land as .jpg.
      const fileName = `${timestamp}_share.${shareArtifactExtension(contentType, isVideo)}`;
      const category = isVideo ? "recordings" : "thumbnails";

      if (blob.size >= MULTIPART_THRESHOLD) {
        return await this.uploadMultipart(
          fileName,
          contentType,
          blob,
          userId,
          category,
          sequenceId,
          options
        );
      }
      return await this.uploadSingle(
        fileName,
        contentType,
        blob,
        userId,
        category,
        sequenceId,
        options
      );
    } catch (error) {
      if ((error as Error).name === "AbortError") throw error;
      return this.handleError(error, "upload-share-artifact", {
        sequenceId,
        artifact,
      });
    }
  }

  async deleteSequenceAssets(sequenceId: string): Promise<void> {
    try {
      const userId = this.getUserId();
      const prefixes = [
        `users/${userId}/recordings/${sequenceId}/`,
        `users/${userId}/animations/${sequenceId}/`,
        `users/${userId}/thumbnails/${sequenceId}/`,
      ];
      await Promise.all(prefixes.map((prefix) => deleteByPrefix(prefix)));
    } catch (error) {
      return this.handleError(error, "delete-assets", { sequenceId });
    }
  }

  getPublicUrl(key: string): string {
    const baseUrl = import.meta.env.VITE_R2_PUBLIC_URL || "";
    return `${baseUrl}/${key}`;
  }

  async uploadVideoThumbnail(
    sequenceId: string,
    thumbnailBlob: Blob,
    videoTimestamp: number,
    options?: UploadOptions
  ): Promise<VideoUploadResult> {
    try {
      const userId = this.getUserId();
      const fileName = `${videoTimestamp}_thumb.jpg`;
      const contentType = "image/jpeg";

      return await this.uploadSingle(
        fileName,
        contentType,
        thumbnailBlob,
        userId,
        "thumbnails",
        sequenceId,
        options
      );
    } catch (error) {
      if ((error as Error).name === "AbortError") throw error;
      return this.handleError(error, "upload-thumbnail", { sequenceId });
    }
  }

  async uploadSequenceThumbnail(
    sequenceId: string,
    thumbnailBlob: Blob,
    format: "png" | "jpeg" | "webp" = "png",
    options?: UploadOptions
  ): Promise<VideoUploadResult> {
    try {
      const userId = this.getUserId();
      const fileName = `thumbnail.${format}`;
      const contentTypeMap: Record<string, string> = {
        png: "image/png",
        jpeg: "image/jpeg",
        webp: "image/webp",
      };
      const contentType = contentTypeMap[format] ?? "image/png";

      // Vite's emulated R2 is local, so its production public URL would point
      // at an object that exists only on this machine. Native shells have no
      // Pages Worker at their app origin. Both keep the existing presigned path;
      // deployed web clients stay same-origin through the Worker.
      if (!dev && isWeb()) {
        return await uploadSequenceThumbnailFirstParty(
          sequenceId,
          thumbnailBlob,
          contentType,
          options
        );
      }

      return await this.uploadSingle(
        fileName,
        contentType,
        thumbnailBlob,
        userId,
        "thumbnails",
        sequenceId,
        options
      );
    } catch (error) {
      if ((error as Error).name === "AbortError") throw error;
      // Caller (library-save-service) deliberately degrades a thumbnail failure
      // to a warning toast and still completes the save, so this path only logs
      // and rethrows — routing through handleError would stack a second,
      // higher-severity error toast on top of that intentional warning.
      console.error("R2VideoUploader: Failed to upload-thumbnail:", error);
      throw error;
    }
  }
}
