<script lang="ts">
  import { untrack } from "svelte";
  import type { PreviewVideoController } from "$lib/shared/media-composition/services/post-preview-clock";
  import {
    planMusicAudio,
    segmentGainAt,
  } from "$lib/shared/media-composition/domain/post-audio-plan";
  import type { PostMusic } from "$lib/shared/media-composition/domain/post-music";
  import {
    musicPreviewTarget,
    musicSoundsAt,
    shouldSeekMusic,
  } from "$lib/shared/media-composition/services/music-preview-sync";

  /**
   * Plays the post's music under the preview. The canvas drives it the way
   * it drives a clip's footage: it reads the element's clock, which sets the
   * preview's pace while the music sounds, and holds it while footage
   * buffers. Levels above 100% are the export's; here the volume stops at 1.
   */
  interface Props {
    music: PostMusic;
    /** The playhead, in post seconds. */
    postSeconds: number;
    postDurationSeconds: number;
    playing: boolean;
    onController: (controller: PreviewVideoController | null) => void;
  }

  let {
    music,
    postSeconds,
    postDurationSeconds,
    playing,
    onController,
  }: Props = $props();

  let audio = $state<HTMLAudioElement | null>(null);
  let held = false;
  let playRequest: HTMLAudioElement | null = null;
  let previousTarget: number | null = null;

  const target = $derived(musicPreviewTarget(music, postSeconds));
  const segment = $derived(
    planMusicAudio(music, postDurationSeconds)[0] ?? null
  );
  const sounding = $derived(musicSoundsAt(segment, postSeconds));
  const volume = $derived(
    segment
      ? Math.min(
          1,
          segmentGainAt(segment, postSeconds - segment.postStartSeconds)
        )
      : 0
  );

  /** Moves the element to the playhead's time when it has strayed. */
  function sync(element: HTMLAudioElement, jumped = false): void {
    if (element.readyState < 1) return;
    const seconds = target.seconds;
    const seek = shouldSeekMusic({
      currentTime: element.currentTime,
      targetTime: seconds,
      previousTargetTime: previousTarget,
      playing: playing && !held,
      seeking: element.seeking,
      jumped,
    });
    previousTarget = seconds;
    if (seek) element.currentTime = seconds;
  }

  function startPlayback(element: HTMLAudioElement): void {
    if (
      !playing ||
      held ||
      !sounding ||
      !element.paused ||
      playRequest === element
    )
      return;
    playRequest = element;
    void element
      .play()
      .then(() => {
        if (!playing || held || !sounding) element.pause();
      })
      .catch(() => undefined)
      .finally(() => {
        if (playRequest === element) playRequest = null;
      });
  }

  $effect(() => {
    const element = audio;
    const register = onController;
    if (!element) return;
    register({
      read: () => {
        sync(element);
        return {
          currentTime: element.currentTime,
          ready: !element.seeking && element.readyState >= 2,
          ended: element.ended,
        };
      },
      align: () => sync(element, true),
      hold: (next) => {
        held = next;
        if (next) element.pause();
        else startPlayback(element);
      },
    });
    return () => register(null);
  });

  $effect(() => {
    const element = audio;
    if (!element) return;
    element.volume = volume;
    element.muted = !playing || volume === 0;
  });

  $effect(() => {
    const element = audio;
    // Tracked: the playhead's place in the music, and whether it should sound.
    target.seconds;
    const shouldPlay = playing && sounding;
    if (!element) return;
    untrack(() => {
      sync(element);
      if (shouldPlay) startPlayback(element);
      else if (!element.paused) element.pause();
    });
  });

  $effect(() => {
    const element = audio;
    if (!element) return;
    return () => {
      // A removed element keeps playing, and keeps its download open until
      // its source goes.
      element.pause();
      element.removeAttribute("src");
      element.load();
    };
  });
</script>

<audio bind:this={audio} src={music.url} preload="auto"></audio>
