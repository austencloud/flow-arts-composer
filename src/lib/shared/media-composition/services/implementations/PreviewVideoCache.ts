import {
  MAX_ACTIVE_PREVIEW_BYTES,
  MAX_PREVIEW_VIDEO_BYTES,
  previewVideoCacheKey,
  type PreviewVideoCopy,
  type PreviewVideoState,
} from "../../domain/preview-video";
import type {
  IPreviewVideoCache,
  PreviewVideoHandle,
  PreviewVideoStore,
} from "../contracts/IPreviewVideoCache";

export interface PreviewVideoDependencies {
  store: PreviewVideoStore;
  render(
    sourceUrl: string,
    signal: AbortSignal,
    onProgress: (progress: number) => void
  ): Promise<PreviewVideoCopy>;
  supported(): boolean;
  createUrl(blob: Blob): string;
  revokeUrl(url: string): void;
}

interface Entry {
  state: PreviewVideoState;
  refs: number;
  controller: AbortController;
  listeners: Set<(state: PreviewVideoState) => void>;
  ready: Promise<PreviewVideoState>;
  resolve(state: PreviewVideoState): void;
  objectUrl?: string;
  bytes?: number;
}

export class PreviewVideoCache implements IPreviewVideoCache {
  private entries = new Map<string, Entry>();
  private queue: Promise<void> = Promise.resolve();
  private activeBytes = 0;

  constructor(private readonly dependencies: PreviewVideoDependencies) {}

  acquire(sourceUrl: string, assetKey = sourceUrl): PreviewVideoHandle {
    const key = previewVideoCacheKey(sourceUrl, assetKey);
    let entry = this.entries.get(key);
    if (!entry) {
      let resolve!: Entry["resolve"];
      const ready = new Promise<PreviewVideoState>((done) => {
        resolve = done;
      });
      entry = {
        state: { status: "preparing", sourceUrl, url: sourceUrl, progress: 0 },
        refs: 0,
        controller: new AbortController(),
        listeners: new Set(),
        ready,
        resolve,
      };
      this.entries.set(key, entry);
      const owned = entry;
      this.queue = this.queue.then(() => this.prepare(key, assetKey, owned));
    }
    entry.refs++;
    const owned = entry;
    const subscriptions = new Set<(state: PreviewVideoState) => void>();
    let released = false;
    return {
      getState: () => ({ ...owned.state }),
      ready: owned.ready,
      subscribe: (listener) => {
        if (released) return () => {};
        subscriptions.add(listener);
        owned.listeners.add(listener);
        listener({ ...owned.state });
        return () => {
          subscriptions.delete(listener);
          owned.listeners.delete(listener);
        };
      },
      reportPlaybackError: (
        reason = "The preview copy could not play; the original video is being used"
      ) => {
        if (released || owned.state.status !== "ready") return;
        // Remove the bad copy before a later region can acquire it again.
        this.queue = this.queue.then(async () => {
          try {
            await this.dependencies.store.remove(key);
          } catch {
            /* A blocked device cache must not interrupt original-source playback. */
          }
        });
        this.emit(owned, {
          status: "fallback",
          sourceUrl,
          url: sourceUrl,
          progress: 0,
          reason,
        });
      },
      release: () => {
        if (released) return;
        released = true;
        for (const listener of subscriptions) owned.listeners.delete(listener);
        subscriptions.clear();
        if (--owned.refs > 0) return;
        owned.controller.abort();
        if (owned.objectUrl) this.dependencies.revokeUrl(owned.objectUrl);
        this.activeBytes -= owned.bytes ?? 0;
        owned.bytes = 0;
        owned.objectUrl = undefined;
        if (this.entries.get(key) === owned) this.entries.delete(key);
        owned.state = {
          status: "fallback",
          sourceUrl,
          url: sourceUrl,
          progress: 0,
          reason: "Preview released",
        };
        owned.resolve({ ...owned.state });
      },
    };
  }

  private emit(entry: Entry, state: PreviewVideoState) {
    entry.state = state;
    for (const listener of entry.listeners) {
      // A consumer callback cannot strand the other regions waiting for their copy.
      try {
        listener({ ...state });
      } catch (error) {
        console.error("Preview state listener failed", error);
      }
    }
  }

  private async prepare(
    key: string,
    assetKey: string,
    entry: Entry
  ): Promise<void> {
    if (!entry.refs) return;
    const sourceUrl = entry.state.sourceUrl;
    try {
      let copy: PreviewVideoCopy | null;
      let storageReason: string | undefined;
      try {
        copy = await this.dependencies.store.read(key);
      } catch {
        copy = null;
        storageReason =
          "Preview ready for this session; device cache is unavailable";
      }
      if (!entry.refs) return;
      if (!copy) {
        if (!this.dependencies.supported())
          throw new Error("This browser uses the original video for previews");
        copy = await this.dependencies.render(
          sourceUrl,
          entry.controller.signal,
          (progress) => {
            if (entry.refs)
              this.emit(entry, {
                ...entry.state,
                progress: Math.min(1, Math.max(0, progress)),
              });
          }
        );
        if (!entry.refs) return;
        if (copy.blob.size > MAX_PREVIEW_VIDEO_BYTES)
          throw new Error("This preview exceeds the local size limit");
        try {
          await this.dependencies.store.write(key, assetKey, copy);
        } catch {
          storageReason =
            "Preview ready for this session; device cache is unavailable";
        }
      }
      if (!entry.refs) return;
      if (copy.blob.size + this.activeBytes > MAX_ACTIVE_PREVIEW_BYTES) {
        throw new Error(
          "The local preview memory limit is in use; the original video is being used"
        );
      }
      const { blob, ...metadata } = copy;
      entry.objectUrl = this.dependencies.createUrl(blob);
      entry.bytes = blob.size;
      this.activeBytes += blob.size;
      this.emit(entry, {
        status: "ready",
        sourceUrl,
        url: entry.objectUrl,
        progress: 1,
        ...metadata,
        reason: storageReason,
      });
    } catch (error) {
      if (!entry.refs) return;
      this.emit(entry, {
        status: "fallback",
        sourceUrl,
        url: sourceUrl,
        progress: 0,
        reason:
          error instanceof Error
            ? error.message
            : "The original video is being used for preview",
      });
    } finally {
      entry.resolve({ ...entry.state });
    }
  }
}
