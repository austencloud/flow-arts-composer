import { flushSync, mount } from "svelte";
import type { PostMusic } from "$lib/shared/media-composition/domain/post-music";
import {
  updateMusic,
  type MusicPatch,
} from "$lib/shared/media-composition/domain/post-music-edits";
import PostMusicTool from "$lib/shared/share/components/post-studio/editor/PostMusicTool.svelte";
import { NOW, project, video } from "./post-project-fixtures";

/**
 * Mounts the music's panel the way the workspace does: every change goes
 * through updateMusic, and the panel gets the new music back. The playhead
 * starts at the post's 0 s, paused.
 */
export function mountMusicTool(target: HTMLElement, initial: PostMusic) {
  const changes: Array<[string, MusicPatch]> = [];
  let music = $state.raw(initial);
  let playing = $state(false);
  let playhead = 0;
  const component = mount(PostMusicTool, {
    target,
    props: {
      get music() {
        return music;
      },
      get playing() {
        return playing;
      },
      playheadSeconds: () => playhead,
      onChange: (key: string, patch: MusicPatch) => {
        changes.push([key, patch]);
        const next = updateMusic({ ...project([video("v1")]), music }, patch, {
          now: NOW + 1,
        });
        if (next.music) music = next.music;
      },
    },
  });
  flushSync();
  return {
    component,
    changes,
    get music() {
      return music;
    },
    setPlaying(next: boolean) {
      playing = next;
      flushSync();
    },
    setPlayhead(seconds: number) {
      playhead = seconds;
    },
    /** Swaps in another music, as adding a new file does. */
    setMusic(next: PostMusic) {
      music = next;
      flushSync();
    },
  };
}
