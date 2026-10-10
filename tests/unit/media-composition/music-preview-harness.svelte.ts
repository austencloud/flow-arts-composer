import { flushSync, mount } from "svelte";
import type { PreviewVideoController } from "#lib/shared/media-composition/services/post-preview-clock.js";
import type { PostMusic } from "#lib/shared/media-composition/domain/post-music.js";
import PostMusicPreview from "#lib/shared/share/components/post-studio/editor/PostMusicPreview.svelte";

/**
 * Mounts the preview's music paused at 0 s in a 60 s post, recording every
 * controller it registers and every report that its file is missing or not.
 */
export function mountMusicPreview(target: HTMLElement, initial: PostMusic) {
  const controllers: Array<PreviewVideoController | null> = [];
  const missingReports: boolean[] = [];
  let music = $state.raw(initial);
  let postSeconds = $state(0);
  let playing = $state(false);
  const component = mount(PostMusicPreview, {
    target,
    props: {
      get music() {
        return music;
      },
      get postSeconds() {
        return postSeconds;
      },
      postDurationSeconds: 60,
      get playing() {
        return playing;
      },
      onController: (controller: PreviewVideoController | null) => {
        controllers.push(controller);
      },
      onMissing: (missing: boolean) => {
        missingReports.push(missing);
      },
    },
  });
  flushSync();
  return {
    component,
    controllers,
    missingReports,
    get controller() {
      return controllers.at(-1) ?? null;
    },
    setMusic(next: PostMusic) {
      music = next;
      flushSync();
    },
    setPostSeconds(next: number) {
      postSeconds = next;
      flushSync();
    },
    setPlaying(next: boolean) {
      playing = next;
      flushSync();
    },
  };
}
