<script lang="ts">
  import { useStrings } from "@austencloud/video-editor/strings";
  import {
  POST_FRAME_RATE,
} from "@austencloud/video-editor/core";
  import type { VideoEditorState } from "@austencloud/video-editor";
  import TypeableValue from "$lib/shared/ui/components/TypeableValue.svelte";
  import { formatTakeClock, parseClock, roundToFrameSeconds } from "@austencloud/video-editor/ui";
  import {
    Icon,
    faBackwardStep,
    faForwardStep,
    faPause,
    faPlay,
  } from "@austencloud/video-editor/icons";

  const t = useStrings();

  /**
   * Play, one frame back or on, and the clock. The clock reads to the
   * hundredth so a single frame step shows; pressing it types a time to go
   * to.
   */
  interface Props {
    editor: VideoEditorState;
    disabled?: boolean;
  }

  let { editor, disabled = false }: Props = $props();

  const FRAME_SECONDS = 1 / POST_FRAME_RATE;
  const empty = $derived(editor.durationSeconds <= 0);

  function step(frames: number): void {
    editor.pause();
    editor.seek(editor.previewSeconds + frames * FRAME_SECONDS);
  }

  function goTo(seconds: number): void {
    editor.pause();
    editor.seek(roundToFrameSeconds(seconds));
  }

  const now = $derived(formatTakeClock(editor.previewSeconds));
  const total = $derived(formatTakeClock(editor.durationSeconds));
</script>

<div class="transport" role="group" aria-label={t("share_studio_deep_playback")}>
  <button
    type="button"
    class="round"
    disabled={disabled || empty}
    onclick={() => step(-1)}
    aria-label={t("post_editor_frame_back")}
    aria-keyshortcuts="ArrowLeft"
    title={t("post_editor_frame_back")}
  >
    <Icon icon={faBackwardStep} />
  </button>
  <button
    type="button"
    class="round play"
    disabled={disabled || empty}
    onclick={editor.togglePlayback}
    aria-label={editor.isPlaying
      ? t("share_studio_deep_pause")
      : t("share_studio_deep_play")}
    aria-keyshortcuts="Space"
  >
    <Icon icon={editor.isPlaying ? faPause : faPlay} />
  </button>
  <button
    type="button"
    class="round"
    disabled={disabled || empty}
    onclick={() => step(1)}
    aria-label={t("post_editor_frame_forward")}
    aria-keyshortcuts="ArrowRight"
    title={t("post_editor_frame_forward")}
  >
    <Icon icon={faForwardStep} />
  </button>
  <div class="clock">
    <TypeableValue
      label={t("share_studio_deep_playhead")}
      text={now}
      draft={now}
      parse={parseClock}
      sizer={total}
      disabled={disabled || empty}
      oncommit={goTo}
    />
    <span class="total">/ {total}</span>
  </div>
</div>

<style>
  .transport {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    min-width: 0;
  }

  .round {
    display: grid;
    place-items: center;
    width: var(--ve-min-touch-target, 44px);
    height: var(--ve-min-touch-target, 44px);
    flex: none;
    border: 1px solid var(--ve-theme-stroke, #484755);
    border-radius: 50%;
    color: var(--ve-theme-text, #fff);
    background: var(--ve-theme-card-bg);
    cursor: pointer;
  }

  .play {
    width: 3.25rem;
    height: 3.25rem;
    border-color: var(--ve-theme-accent, #d4813a);
  }

  .round:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  .round:focus-visible {
    outline: 2px solid var(--ve-theme-accent, currentColor);
    outline-offset: 2px;
  }

  .clock {
    --typeable-font-size: 0.9375rem;
    --typeable-min-width: 0;
    display: flex;
    align-items: center;
    gap: 0.375rem;
    color: var(--ve-theme-text, #fff);
    font-size: 0.9375rem;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .total {
    color: var(--ve-theme-text-secondary, #aaa);
  }
</style>
