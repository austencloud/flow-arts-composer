<!--
  The crop screen's time bar, in the transport's place: play or pause, and a
  scrubber over just the clip with a diamond at each framing keyframe. The
  workspace loops playback on the crop screen; this bar only asks for it.
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import ValueSlider from "$lib/shared/ui/components/ValueSlider.svelte";
  import {
    POST_FRAME_RATE,
    itemEnd,
    type PostVideoItem,
  } from "$lib/shared/media-composition/domain/post-project";
  import { keyframeMarkers } from "$lib/shared/media-composition/domain/post-project-keyframes";
  import type { PostEditorState } from "$lib/shared/media-composition/state/post-editor-state.svelte";
  import { formatTakeClock } from "../builder/post-builder-format";

  interface Props {
    editor: PostEditorState;
    item: PostVideoItem;
    /** Play or pause, looping the clip. */
    onToggle: () => void;
    /** Moves the playhead, kept on the clip. */
    onSeek: (seconds: number) => void;
  }

  let { editor, item, onToggle, onSeek }: Props = $props();

  const FRAME_SECONDS = 1 / POST_FRAME_RATE;
  const start = $derived(item.start);
  /** The last frame that still shows the clip. */
  const end = $derived(Math.max(item.start, itemEnd(item) - FRAME_SECONDS));
  const length = $derived(formatTakeClock(itemEnd(item) - item.start));
  const marks = $derived(
    keyframeMarkers(item)
      .filter((marker) => marker.channels.includes("framing"))
      .map((marker) => marker.seconds)
  );

  function seek(seconds: number): void {
    editor.pause();
    onSeek(seconds);
  }
</script>

<div class="timebar" role="group" aria-label={t("post_crop_timebar")}>
  <button
    type="button"
    class="play"
    onclick={onToggle}
    aria-label={editor.isPlaying
      ? t("share_studio_deep_pause")
      : t("share_studio_deep_play")}
    aria-keyshortcuts="Space"
  >
    <i
      class="fa-solid {editor.isPlaying ? 'fa-pause' : 'fa-play'}"
      aria-hidden="true"
    ></i>
  </button>
  <div class="scrubber">
    <ValueSlider
      label={t("share_studio_deep_playhead")}
      value={editor.previewSeconds}
      min={start}
      max={end}
      step={FRAME_SECONDS}
      origin={start}
      format={(seconds) => `${formatTakeClock(seconds - start)} / ${length}`}
      {marks}
      onchange={seek}
    />
  </div>
</div>

<style>
  .timebar {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    max-width: 40rem;
    min-width: 0;
    margin-inline: auto;
    padding-inline: 0.5rem;
    box-sizing: border-box;
  }

  .play {
    display: grid;
    place-items: center;
    width: 3.25rem;
    height: 3.25rem;
    flex: none;
    border: 1px solid var(--theme-accent, #d4813a);
    border-radius: 50%;
    color: var(--theme-text, #fff);
    background: var(--theme-card-bg);
    cursor: pointer;
  }

  .play:focus-visible {
    outline: 2px solid var(--theme-accent, currentColor);
    outline-offset: 2px;
  }

  .scrubber {
    flex: 1;
    min-width: 0;
  }
</style>
