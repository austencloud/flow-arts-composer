<script lang="ts">
  import { untrack } from "svelte";
  import type { PreviewVideoController } from "#lib/shared/media-composition/services/post-preview-clock.js";
  import {
    planMusicAudio,
    segmentGainAt,
  } from "#lib/shared/media-composition/domain/post-audio-plan.js";
  import type { PostMusic } from "#lib/shared/media-composition/domain/post-music.js";
  import {
    musicPreviewTarget,
    musicSoundsAt,
    shouldSeekMusic,
  } from "#lib/shared/media-composition/services/music-preview-sync.js";

  /**
   * Plays the post's music under the preview. The canvas drives it the way
   * it drives a clip's footage: it reads the element's clock, which sets the
   * preview's pace while the music sounds, and holds it while footage
   * buffers. Levels above 100% are the export's; here the volume stops at 1.
   * A file that can't be loaded would never be ready and would hold the
   * clock for good, so it registers no controller and plays nothing, and
   * `onMissing` says so until the music is another file or this unmounts.
   */
  interface Props {
    music: PostMusic;
    /** The playhead, in post seconds. */
    postSeconds: number;
    postDurationSeconds: number;
    playing: boolean;
    onController: (controller: PreviewVideoController | null) => void;
    /** True while the music's file can't be loaded, false when that ends. */
    onMissing?: (missing: boolean) => void;
  }

  let {
    music,
    postSeconds,
    postDurationSeconds,
    playing,
    onController,
    onMissing,
  }: Props = $props();

  let audio = $state<HTMLAudioElement | null>(null);
  let held = false;
  // Whether the playhead effect last saw playback running, to find the edge
  // where Play is pressed.
  let wasPlaying = false;
  let playRequest: HTMLAudioElement | null = null;
  let previousTarget: number | null = null;
  // The source the element last failed to load, from its own attribute.
  let failedSource = $state<string | null>(null);

  const failed = $derived(failedSource === music.url);
  const target = $derived(musicPreviewTarget(music, postSeconds));
  const segment = $derived(
    planMusicAudio(music, postDurationSeconds)[0] ?? null
  );
  // A file that failed to load sounds nothing.
  const sounding = $derived(!failed && musicSoundsAt(segment, postSeconds));
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

  /**
   * Notes the source that failed. The attribute is read now: an error as the
   * element is torn down finds it already removed, and records nothing.
   */
  function noteFailure(element: Element): void {
    const source = element.getAttribute("src");
    if (source !== null) failedSource = source;
  }

  $effect(() => {
    const element = audio;
    const register = onController;
    // A file that can't be loaded stays out of the clock. The run before
    // this one has already told the canvas, in its cleanup, that it is gone.
    if (!element || failed) return;
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

  // Runs only while the file can't be loaded, so its cleanup says it can be
  // again: the music changed, or this left the page.
  $effect(() => {
    if (!failed) return;
    const report = onMissing;
    report?.(true);
    return () => report?.(false);
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
      // A seek dropped while paused is not retried, and a playing element is
      // let stray by up to a quarter second. Pressing Play lines it up.
      sync(element, playing && !wasPlaying);
      wasPlaying = playing;
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

<!-- A seek skipped while the element was still seeking is retried here. -->
<audio
  bind:this={audio}
  src={music.url}
  preload="auto"
  onerror={(event) => noteFailure(event.currentTarget)}
  onseeked={(event) => sync(event.currentTarget, true)}
></audio>
