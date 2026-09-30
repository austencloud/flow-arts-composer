import { untrack } from "svelte";
import { getPreviewVideoCache } from "../get-preview-video-cache";
import type {
  IPreviewVideoCache,
  PreviewVideoHandle,
} from "../services/contracts/IPreviewVideoCache";
import type { PreviewVideoState } from "../domain/preview-video";

interface PreviewSource {
  id: string;
  url: string | null;
  assetKey: string;
}

interface SelectedPreview {
  sourceUrl: string;
  url: string;
  sourceWidth?: number;
  sourceHeight?: number;
}

interface PreviewLease {
  source: PreviewSource;
  handle: PreviewVideoHandle;
  state: PreviewVideoState;
  unsubscribe: () => void;
}

/** Playback copies are session resources, never replacements for project assets. */
export function createPostVideoPreviews(
  getSources: () => readonly PreviewSource[],
  getPlaying: () => boolean,
  cache: IPreviewVideoCache = getPreviewVideoCache()
) {
  const leases = new Map<string, PreviewLease>();
  let selected = $state.raw<Record<string, SelectedPreview>>({});
  let disposed = false;

  function select(id: string, lease: PreviewLease, playing: boolean) {
    const state = lease.state;
    const previous = selected[id];
    // Finishing an encode must not interrupt an already playing source.
    if (state.status === "ready" && playing) return;
    const next: SelectedPreview = {
      sourceUrl: state.sourceUrl,
      url: state.url,
      sourceWidth: state.sourceWidth ?? previous?.sourceWidth,
      sourceHeight: state.sourceHeight ?? previous?.sourceHeight,
    };
    if (
      previous?.sourceUrl === next.sourceUrl &&
      previous.url === next.url &&
      previous.sourceWidth === next.sourceWidth &&
      previous.sourceHeight === next.sourceHeight
    )
      return;
    selected = { ...selected, [id]: next };
  }

  function release(id: string, lease: PreviewLease) {
    leases.delete(id);
    lease.unsubscribe();
    lease.handle.release();
    const next = { ...selected };
    delete next[id];
    selected = next;
  }

  $effect(() => {
    const sources = getSources().map((source) => ({ ...source }));
    const playing = getPlaying();
    untrack(() => {
      const current = new Map(sources.map((source) => [source.id, source]));
      for (const [id, lease] of leases) {
        const source = current.get(id);
        if (
          source?.url !== lease.source.url ||
          source?.assetKey !== lease.source.assetKey
        ) {
          release(id, lease);
        }
      }
      for (const source of sources) {
        if (!source.url) continue;
        let lease = leases.get(source.id);
        if (!lease) {
          const handle = cache.acquire(source.url, source.assetKey);
          lease = {
            source,
            handle,
            state: handle.getState(),
            unsubscribe: () => {},
          };
          leases.set(source.id, lease);
          const activeLease = lease;
          lease.unsubscribe = handle.subscribe((state) => {
            if (disposed || leases.get(source.id) !== activeLease) return;
            activeLease.state = state;
            untrack(() => select(source.id, activeLease, getPlaying()));
          });
        }
        select(source.id, lease, playing);
      }
    });
  });

  $effect(() => () => {
    disposed = true;
    for (const [id, lease] of leases) release(id, lease);
  });

  return {
    resolve(id: string, sourceUrl: string | null) {
      const preview = selected[id];
      return preview?.sourceUrl === sourceUrl ? preview : { url: sourceUrl };
    },
    reportPlaybackError(id: string) {
      const lease = leases.get(id);
      // Errors from the original media must not invalidate a still-encoding copy.
      if (
        lease &&
        selected[id]?.url !== lease.source.url &&
        selected[id]?.url
      ) {
        lease.handle.reportPlaybackError();
      }
    },
  };
}
