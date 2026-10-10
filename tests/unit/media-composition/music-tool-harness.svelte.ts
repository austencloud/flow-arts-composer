import { flushSync, mount } from "svelte";
import type { PostMusic } from "#lib/shared/media-composition/domain/post-music.js";
import {
  trimMusic,
  updateMusic,
  type MusicPatch,
} from "#lib/shared/media-composition/domain/post-music-edits.js";
import PostMusicTool from "#lib/shared/share/components/post-studio/editor/PostMusicTool.svelte";
import { NOW, project, video } from "./post-project-fixtures";

/**
 * Mounts the music's panel the way the workspace does: every change goes
 * through updateMusic and every trim through trimMusic, and the panel gets
 * the new music back. The playhead starts at the post's 0 s, paused, and the
 * music's file loads.
 */
export function mountMusicTool(target: HTMLElement, initial: PostMusic) {
  const changes: Array<[string, MusicPatch]> = [];
  const trims: Array<[edge: "start" | "end", postSeconds: number]> = [];
  let music = $state.raw(initial);
  let playing = $state(false);
  let playhead = $state(0);
  let missing = $state(false);
  const component = mount(PostMusicTool, {
    target,
    props: {
      get music() {
        return music;
      },
      get playing() {
        return playing;
      },
      get missing() {
        return missing;
      },
      playheadSeconds: () => playhead,
      onChange: (key: string, patch: MusicPatch) => {
        changes.push([key, patch]);
        const next = updateMusic({ ...project([video("v1")]), music }, patch, {
          now: NOW + 1,
        });
        if (next.music) music = next.music;
      },
      onTrim: (edge: "start" | "end", postSeconds: number) => {
        trims.push([edge, postSeconds]);
        const next = trimMusic(
          { ...project([video("v1")]), music },
          edge,
          postSeconds,
          { now: NOW + 1 }
        );
        if (next.music) music = next.music;
      },
    },
  });
  flushSync();
  return {
    component,
    changes,
    trims,
    get music() {
      return music;
    },
    setPlaying(next: boolean) {
      playing = next;
      flushSync();
    },
    setPlayhead(seconds: number) {
      playhead = seconds;
      flushSync();
    },
    /** The preview reports that the music's file can't be loaded, or can be. */
    setMissing(next: boolean) {
      missing = next;
      flushSync();
    },
    /** Swaps in another music, as adding a new file does. */
    setMusic(next: PostMusic) {
      music = next;
      flushSync();
    },
  };
}
