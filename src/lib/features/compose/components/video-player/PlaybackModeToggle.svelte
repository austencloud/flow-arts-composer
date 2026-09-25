<!--
  PlaybackModeToggle.svelte

  Toggle between live preview and video playback modes.
  Displayed when a video has been successfully generated.
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  let {
    currentMode = $bindable("live"),
    onModeChange,
  }: {
    currentMode?: "live" | "video";
    onModeChange: (mode: "live" | "video") => void;
  } = $props();

  function switchToLive() {
    currentMode = "live";
    onModeChange("live");
  }

  function switchToVideo() {
    currentMode = "video";
    onModeChange("video");
  }
</script>

<div class="mode-toggle">
  <button
    class="animation-mode-btn"
    class:active={currentMode === "live"}
    onclick={switchToLive}
    type="button"
    aria-label={t("compose_ui_live_playback_mode")}
    aria-pressed={currentMode === "live"}
  >
    Live
  </button>
  <button
    class="animation-mode-btn"
    class:active={currentMode === "video"}
    onclick={switchToVideo}
    type="button"
    aria-label={t("compose_ui_video_playback_mode")}
    aria-pressed={currentMode === "video"}
  >
    Video
  </button>
</div>

<style>
  .mode-toggle {
    position: absolute;
    bottom: 12px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    background: var(--theme-panel-bg);
    border-radius: 8px;
    padding: 4px;
    z-index: 20;
  }

  .animation-mode-btn {
    background: transparent;
    border: none;
    color: var(--theme-text-dim);
    padding: 12px 18px;
    min-height: var(--min-touch-target);
    border-radius: 8px;
    cursor: pointer;
    font-size: var(--font-size-compact);
    transition: all var(--duration-normal) ease;
  }

  .animation-mode-btn:hover {
    color: white;
  }

  .animation-mode-btn.active {
    background: color-mix(in srgb, var(--theme-text) 20%, transparent);
    color: white;
  }

  @media (prefers-reduced-motion: reduce) {
    .animation-mode-btn {
      transition: none;
    }
  }
</style>
