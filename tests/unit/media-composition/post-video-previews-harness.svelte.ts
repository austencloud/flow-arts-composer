import type { IPreviewVideoCache } from "$lib/shared/media-composition/services/contracts/IPreviewVideoCache";
import { createPostVideoPreviews } from "$lib/shared/media-composition/state/post-video-previews.svelte";

export interface HarnessVideoSource {
  id: string;
  url: string | null;
  assetKey: string;
}

export function createPostVideoPreviewsHarness(
  initial: readonly HarnessVideoSource[],
  cache: IPreviewVideoCache,
  initiallyPlaying = false
) {
  let sources = $state(initial.map((source) => ({ ...source })));
  let playing = $state(initiallyPlaying);
  let previews!: ReturnType<typeof createPostVideoPreviews>;
  const dispose = $effect.root(() => {
    previews = createPostVideoPreviews(
      () => sources,
      () => playing,
      cache
    );
  });

  return {
    previews,
    setSources(next: readonly HarnessVideoSource[]) {
      sources = next.map((source) => ({ ...source }));
    },
    replaceSource(id: string, url: string | null, assetKey: string) {
      const source = sources.find((source) => source.id === id);
      if (!source) throw new Error("The harness source is missing");
      source.url = url;
      source.assetKey = assetKey;
    },
    setPlaying(next: boolean) {
      playing = next;
    },
    dispose,
  };
}
