import type {
  PreviewVideoCopy,
  PreviewVideoState,
} from "../../domain/preview-video";

export interface PreviewVideoHandle {
  getState(): PreviewVideoState;
  ready: Promise<PreviewVideoState>;
  subscribe(listener: (state: PreviewVideoState) => void): () => void;
  reportPlaybackError(reason?: string): void;
  release(): void;
}

export interface IPreviewVideoCache {
  acquire(sourceUrl: string, assetKey?: string): PreviewVideoHandle;
}

export interface PreviewVideoStore {
  read(key: string): Promise<PreviewVideoCopy | null>;
  write(key: string, assetKey: string, copy: PreviewVideoCopy): Promise<void>;
  remove(key: string): Promise<void>;
}
