<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import { POST_FRAME_RATE } from "$lib/shared/media-composition/domain/post-project";
  import type { PostEditorState } from "$lib/shared/media-composition/state/post-editor-state.svelte";
  import { formatTakeClock } from "../builder/post-builder-format";

  /**
   * Play, one frame back or on, and the clock. The clock reads to the
   * hundredth so a single frame step shows.
   */
  interface Props {
    editor: PostEditorState;
    disabled?: boolean;
  }

  let { editor, disabled = false }: Props = $props();

  const FRAME_SECONDS = 1 / POST_FRAME_RATE;
  const empty = $derived(editor.durationSeconds <= 0);

  function step(frames: number): void {
    editor.pause();
    editor.seek(editor.previewSeconds + frames * FRAME_SECONDS);
  }
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
    <i class="fa-solid fa-backward-step" aria-hidden="true"></i>
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
    <i
      class="fa-solid {editor.isPlaying ? 'fa-pause' : 'fa-play'}"
      aria-hidden="true"
    ></i>
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
    <i class="fa-solid fa-forward-step" aria-hidden="true"></i>
  </button>
  <output class="clock" aria-label={t("share_studio_deep_playhead")}>
    {formatTakeClock(editor.previewSeconds)}
    <span class="total">/ {formatTakeClock(editor.durationSeconds)}</span>
  </output>
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
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    flex: none;
    border: 1px solid var(--theme-stroke, #484755);
    border-radius: 50%;
    color: var(--theme-text, #fff);
    background: var(--theme-card-bg);
    cursor: pointer;
  }

  .play {
    width: 3.25rem;
    height: 3.25rem;
    border-color: var(--theme-accent, #d4813a);
  }

  .round:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  .round:focus-visible {
    outline: 2px solid var(--theme-accent, currentColor);
    outline-offset: 2px;
  }

  .clock {
    min-width: 9.5rem;
    color: var(--theme-text, #fff);
    font-size: 0.9375rem;
    font-variant-numeric: tabular-nums;
    text-align: center;
    white-space: nowrap;
  }

  .total {
    color: var(--theme-text-secondary, #aaa);
  }
</style>
