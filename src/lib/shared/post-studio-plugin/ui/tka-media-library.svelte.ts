import { untrack } from "svelte";
import type { LibraryTake, MediaLibrary } from "@austencloud/video-editor";
import { t } from "$lib/shared/i18n/i18n.svelte.js";
import type { CollaborativeVideo } from "$lib/shared/video-collaboration/domain/collaborative-video";
import type { SequenceVideosStore } from "$lib/shared/video-collaboration/state/sequence-videos-store.svelte";

/** A saved video the editor can place: it has a file and a length. */
function takeOf(video: CollaborativeVideo): LibraryTake | null {
  if (!video.videoUrl || !(video.duration > 0)) return null;
  return {
    id: video.id,
    label: video.description?.trim() || t("share_studio_saved_video"),
    url: video.videoUrl,
    durationSeconds: video.duration,
    ...(video.beatMap ? { detail: t("share_studio_timing_saved") } : {}),
  };
}

/**
 * One sequence's saved videos as the editor's library. The store has no subscribe, so onChange
 * watches it from an effect root; the store rewrites its array on every write (its header), so
 * reading `videos` and `error` sees each change. The first run only subscribes.
 */
export function createTkaMediaLibrary(
  store: SequenceVideosStore
): MediaLibrary {
  const takes = () =>
    store.videos
      .map(takeOf)
      .filter((take): take is LibraryTake => take !== null);
  return {
    async listTakes() {
      await store.load();
      if (store.error) throw new Error(store.error);
      return takes();
    },
    async resolveTake(id) {
      await store.load();
      return takes().find((take) => take.id === id) ?? null;
    },
    requestFor: (url) => new Request(url),
    onChange(listener) {
      let first = true;
      return $effect.root(() => {
        $effect(() => {
          void store.videos;
          void store.error;
          if (first) {
            first = false;
            return;
          }
          untrack(listener);
        });
      });
    },
  };
}
