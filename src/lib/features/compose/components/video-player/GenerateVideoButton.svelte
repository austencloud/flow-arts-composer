<!--
  GenerateVideoButton.svelte

  CTA button that initiates video generation process.
  Displayed when no video has been generated yet.
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  let {
    onGenerate,
  }: {
    onGenerate: () => void;
  } = $props();
</script>

<button
  class="generate-video-btn"
  onclick={onGenerate}
  type="button"
  aria-label={t("compose_ui_generate_video_for_this_sequence")}
>
  Generate Video
</button>

<style>
  .generate-video-btn {
    position: absolute;
    bottom: 12px;
    right: 12px;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    border: 1px solid var(--theme-stroke);
    color: var(--theme-text);
    padding: 14px 20px;
    min-height: var(--min-touch-target);
    border-radius: 10px;
    cursor: pointer;
    font-size: var(--font-size-compact);
    font-weight: 500;
    z-index: 20;
    transition: all var(--duration-normal) ease;
  }

  .generate-video-btn:hover {
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-stroke-strong);
  }

  .generate-video-btn:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }
</style>
