/**
 * VideoRecorder
 *
 * Records video from user's camera for sequence performance submissions.
 * Uses MediaRecorder API and caches recordings to IndexedDB for instant replay.
 */

import type {
  RecordingProgress,
  RecordingResult,
  RecordingOptions,
} from "./types";

// IndexedDB configuration
const DB_NAME = "tka-video-recordings";
const STORE_NAME = "recordings";
const DB_VERSION = 1;

interface RecordingState {
  recordingId: string;
  mediaRecorder: MediaRecorder;
  chunks: Blob[];
  startTime: number;
  pausedDuration: number;
  lastPauseTime: number | null;
  options: Required<RecordingOptions>;
  onProgress?: (progress: RecordingProgress) => void;
  progressInterval?: number;
  /**
   * Settles when the recorder has emitted its `stop` event — which the spec
   * guarantees comes after the final `dataavailable`. Created at start time so
   * it is already armed no matter who ends the recorder: the app, the user, or
   * the browser dropping the camera track.
   */
  stopped: Promise<void>;
  /** The single in-flight finalization, shared by every caller of stopRecording. */
  stopPromise?: Promise<RecordingResult>;
  /**
   * When the recorder actually ended, however it ended. A recorder can finish
   * long before anyone asks it to — dropped track, suspended tab — and the
   * minutes a panel then spends showing stale controls are not recorded time.
   */
  endedAt: number | null;
  /**
   * Set by cancelRecording. A finalization already waiting on the stop event
   * still holds this state, so it has to be told the take was thrown away
   * before it mints a blob URL and writes the recording to IndexedDB.
   */
  cancelled: boolean;
}

export class VideoRecorder {
  private db: IDBDatabase | null = null;
  private activeRecordings = new Map<string, RecordingState>();
  private cachedBlobUrls = new Map<string, string>();

  /**
   * Initialize IndexedDB for recording caching
   */
  private async initDB(): Promise<IDBDatabase> {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);

      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "recordingId" });
        }
      };
    });
  }

  /**
   * Generate unique recording ID
   */
  private generateRecordingId(): string {
    return `rec-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Start recording from camera stream
   */
  async startRecording(
    stream: MediaStream,
    options: RecordingOptions = {},
    onProgress?: (progress: RecordingProgress) => void
  ): Promise<string> {
    const recordingId = this.generateRecordingId();

    const { format = "webm", quality = 0.9, maxDuration = 60 } = options;

    // Determine best MIME type
    const preferredMimeType =
      format === "webm" ? "video/webm;codecs=vp9" : "video/mp4";

    const mimeType = MediaRecorder.isTypeSupported(preferredMimeType)
      ? preferredMimeType
      : MediaRecorder.isTypeSupported("video/webm")
        ? "video/webm"
        : "video/mp4";

    // Create MediaRecorder
    const mediaRecorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: quality * 5_000_000, // 5 Mbps at max quality
    });

    const chunks: Blob[] = [];

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    // Wire the terminal handlers before starting. Attaching them at stop time
    // instead loses the tail of the recording whenever the recorder ends on its
    // own (camera track dropped, tab suspended): it is already "inactive" while
    // its final `dataavailable` is still queued.
    let markStopped: (() => void) | undefined;
    let markFailed: ((error: Error) => void) | undefined;
    const stopped = new Promise<void>((resolve, reject) => {
      markStopped = resolve;
      markFailed = reject;
    });
    // Nobody is awaiting `stopped` until stopRecording runs; keep a failure in
    // the meantime from surfacing as an unhandled rejection.
    void stopped.catch(() => {});

    // Store recording state
    const recordingState: RecordingState = {
      recordingId,
      mediaRecorder,
      chunks,
      startTime: Date.now(),
      pausedDuration: 0,
      lastPauseTime: null,
      options: { format, quality, maxDuration },
      onProgress,
      stopped,
      endedAt: null,
      cancelled: false,
    };

    mediaRecorder.onstop = () => {
      this.markEnded(recordingState);
      markStopped?.();
    };
    mediaRecorder.onerror = (event) => {
      console.error("MediaRecorder error:", event);
      this.markEnded(recordingState);
      markFailed?.(new Error("Recording failed"));
    };

    // Start recording with 100ms chunks for smooth capture
    mediaRecorder.start(100);

    this.activeRecordings.set(recordingId, recordingState);

    // Start progress reporting
    if (onProgress) {
      const progressInterval = window.setInterval(() => {
        const state = this.activeRecordings.get(recordingId);
        if (!state) {
          clearInterval(progressInterval);
          return;
        }

        const currentDuration = this.getCurrentDuration(recordingId);

        onProgress({
          currentDuration,
          state: this.getRecordingStateInternal(state),
        });

        // Auto-stop if max duration reached
        if (currentDuration >= maxDuration) {
          void this.stopRecording(recordingId).catch(() => {});
        }
      }, 100);

      recordingState.progressInterval = progressInterval;
    }

    return recordingId;
  }

  /**
   * Pause ongoing recording
   */
  pauseRecording(recordingId: string): void {
    const state = this.activeRecordings.get(recordingId);
    if (!state) {
      console.warn(`No recording found with ID ${recordingId}`);
      return;
    }

    if (state.mediaRecorder.state === "recording") {
      state.mediaRecorder.pause();
      state.lastPauseTime = Date.now();
    }
  }

  /**
   * Resume paused recording
   */
  resumeRecording(recordingId: string): void {
    const state = this.activeRecordings.get(recordingId);
    if (!state) {
      console.warn(`No recording found with ID ${recordingId}`);
      return;
    }

    if (state.mediaRecorder.state === "paused" && state.lastPauseTime) {
      const pauseDuration = Date.now() - state.lastPauseTime;
      state.pausedDuration += pauseDuration;
      state.lastPauseTime = null;
      state.mediaRecorder.resume();
    }
  }

  /**
   * Stop recording and finalize video
   */
  async stopRecording(recordingId: string): Promise<RecordingResult> {
    const state = this.activeRecordings.get(recordingId);
    if (!state) {
      return {
        success: false,
        error: "Recording not found",
        recordingId,
      };
    }

    // A second stop — a double tap, or the user pressing stop just as the
    // maxDuration auto-stop fires — joins the first finalization instead of
    // racing it. Racing used to strand the first caller forever and hand the
    // second one a blob assembled before the last chunk landed.
    state.stopPromise ??= this.finalizeRecording(state);
    return state.stopPromise;
  }

  /**
   * Ends the recorder and assembles the finished video. Runs at most once per
   * recording.
   */
  private async finalizeRecording(
    state: RecordingState
  ): Promise<RecordingResult> {
    const { recordingId } = state;

    this.clearProgressTimer(state);

    // Freeze the duration at the moment stop was requested, or at the moment
    // the recorder ended if it got there first.
    const duration = this.durationOf(state);

    try {
      if (state.mediaRecorder.state !== "inactive") {
        state.mediaRecorder.stop();
      }
      // Waiting for the `stop` event — never just for "inactive" — is what
      // guarantees the final `dataavailable` is already in `chunks`.
      await state.stopped;
    } finally {
      // Even a failed recorder has to leave the active map, or its id can
      // never be started, cancelled, or stopped again.
      this.activeRecordings.delete(recordingId);
    }

    if (state.cancelled) {
      // Thrown away while we were waiting for the recorder to flush. Nothing
      // here is ours to keep: no object URL for a panel that will never revoke
      // it, nothing written to storage, and no success for a take the user
      // discarded.
      return {
        success: false,
        error: "Recording cancelled",
        recordingId,
      };
    }

    const videoBlob = new Blob(state.chunks, {
      type: state.mediaRecorder.mimeType,
    });

    // Create blob URL
    const blobUrl = URL.createObjectURL(videoBlob);

    // Cache the recording
    await this.cacheRecording(recordingId, videoBlob, duration);

    return {
      success: true,
      videoBlob,
      blobUrl,
      duration,
      recordingId,
    };
  }

  /**
   * Cancel ongoing recording
   */
  cancelRecording(recordingId: string): void {
    const state = this.activeRecordings.get(recordingId);
    if (!state) {
      console.warn(`No recording found with ID ${recordingId}`);
      return;
    }

    // Mark first: a finalization already waiting on the stop event holds this
    // same state object, and this flag is the only thing that tells it the take
    // was discarded rather than saved.
    state.cancelled = true;

    this.clearProgressTimer(state);

    // Stop MediaRecorder without saving
    if (state.mediaRecorder.state !== "inactive") {
      state.mediaRecorder.stop();
    }

    // Clean up
    this.activeRecordings.delete(recordingId);
  }

  /**
   * Get cached recording by ID
   */
  async getCachedRecording(
    recordingId: string
  ): Promise<RecordingResult | null> {
    try {
      const db = await this.initDB();

      return new Promise((resolve) => {
        const transaction = db.transaction(STORE_NAME, "readonly");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(recordingId);

        request.onsuccess = () => {
          const result = request.result;
          if (result?.videoBlob) {
            const prev = this.cachedBlobUrls.get(recordingId);
            if (prev) URL.revokeObjectURL(prev);
            const blobUrl = URL.createObjectURL(result.videoBlob);
            this.cachedBlobUrls.set(recordingId, blobUrl);
            resolve({
              success: true,
              videoBlob: result.videoBlob,
              blobUrl,
              duration: result.duration,
              recordingId,
            });
          } else {
            resolve(null);
          }
        };

        request.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  /**
   * Cache a recording to IndexedDB
   */
  async cacheRecording(
    recordingId: string,
    videoBlob: Blob,
    duration: number
  ): Promise<void> {
    try {
      const db = await this.initDB();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readwrite");
        const store = transaction.objectStore(STORE_NAME);

        const request = store.put({
          recordingId,
          videoBlob,
          duration,
          createdAt: Date.now(),
        });

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error("Failed to cache recording:", error);
    }
  }

  /**
   * Clear cached recording
   */
  async clearCachedRecording(recordingId: string): Promise<void> {
    try {
      const db = await this.initDB();

      return new Promise((resolve) => {
        const transaction = db.transaction(STORE_NAME, "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        store.delete(recordingId);
        resolve();
      });
    } catch {
      // Ignore errors
    }
  }

  /**
   * Clear all cached recordings
   */
  async clearAllCachedRecordings(): Promise<void> {
    try {
      const db = await this.initDB();

      return new Promise((resolve) => {
        const transaction = db.transaction(STORE_NAME, "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        store.clear();
        resolve();
      });
    } catch {
      // Ignore errors
    }
  }

  /**
   * Check if currently recording
   */
  isRecording(recordingId: string): boolean {
    const state = this.activeRecordings.get(recordingId);
    return state?.mediaRecorder.state === "recording";
  }

  /**
   * Get current recording state
   */
  getRecordingState(
    recordingId: string
  ): "idle" | "recording" | "paused" | "stopped" {
    const state = this.activeRecordings.get(recordingId);
    if (!state) return "idle";
    return this.getRecordingStateInternal(state);
  }

  /**
   * Internal helper to get recording state
   */
  private getRecordingStateInternal(
    state: RecordingState
  ): "recording" | "paused" | "stopped" {
    if (state.mediaRecorder.state === "recording") return "recording";
    if (state.mediaRecorder.state === "paused") return "paused";
    return "stopped";
  }

  /**
   * Get current recording duration in seconds
   */
  private getCurrentDuration(recordingId: string): number {
    const state = this.activeRecordings.get(recordingId);
    if (!state) return 0;
    return this.durationOf(state);
  }

  /**
   * Recorded seconds, excluding paused time.
   *
   * `pausedDuration` only accumulates on resume, so a pause that is still open
   * has to be subtracted separately. Without it the timer keeps climbing while
   * paused — inflating the saved duration and letting the maxDuration auto-stop
   * fire on a recording that is not capturing anything.
   */
  private durationOf(state: RecordingState): number {
    // Once the recorder has ended, its clock has stopped. Measuring to "now"
    // instead bills the recording for however long the panel sat there before
    // anyone pressed stop.
    const now = state.endedAt ?? Date.now();
    const openPause =
      state.lastPauseTime !== null ? now - state.lastPauseTime : 0;
    const elapsed = now - state.startTime;
    const activeDuration = elapsed - state.pausedDuration - openPause;
    return Math.max(0, activeDuration) / 1000;
  }

  /**
   * The recorder has emitted its terminal event. Freeze the duration clock and
   * stop the progress timer: whoever ended it, there is nothing left to report,
   * and a duration that kept climbing here would trip the maxDuration auto-stop
   * on a recorder that already stopped.
   */
  private markEnded(state: RecordingState): void {
    state.endedAt ??= Date.now();
    this.clearProgressTimer(state);
  }

  private clearProgressTimer(state: RecordingState): void {
    if (state.progressInterval) {
      clearInterval(state.progressInterval);
      state.progressInterval = undefined;
    }
  }
}

// Singleton instance
let serviceInstance: VideoRecorder | null = null;

export function getVideoRecorder(): VideoRecorder {
  if (!serviceInstance) {
    serviceInstance = new VideoRecorder();
  }
  return serviceInstance;
}
