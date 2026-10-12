<!--
  VideoReadyNotification.svelte

  Notification banner that appears when a video is ready for playback.
  Allows user to switch from live preview to video mode.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  let {
    onSwitchToVideo,
  }: {
    onSwitchToVideo: () => void;
  } = $props();
</script>

<div class="video-ready-notification">
  <span>{t("compose_ui_video_ready")}</span>
  <button
    class="switch-btn"
    onclick={onSwitchToVideo}
    type="button"
    aria-label={t("compose_ui_switch_to_video_playback_mode")}
  >
    Switch to Video
  </button>
</div>

<style>
  .video-ready-notification {
    position: absolute;
    top: 12px;
    right: 12px;
    background: linear-gradient(
      135deg,
      var(--semantic-success),
      var(--semantic-success-strong, #16a34a)
    );
    color: white;
    padding: 10px 16px;
    border-radius: 10px;
    font-size: var(--font-size-compact);
    z-index: 20;
    display: flex;
    align-items: center;
    gap: 12px;
    animation: slideIn var(--duration-emphasis) ease;
  }

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .switch-btn {
    background: color-mix(in srgb, var(--theme-text) 25%, transparent);
    border: none;
    color: white;
    padding: 12px 16px;
    min-height: var(--min-touch-target);
    border-radius: 8px;
    cursor: pointer;
    font-size: var(--font-size-compact);
    font-weight: 500;
  }

  .switch-btn:hover {
    background: color-mix(in srgb, var(--theme-text) 40%, transparent);
  }

  .switch-btn:focus-visible {
    outline: 2px solid white;
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .video-ready-notification {
      animation: none;
    }
  }
</style>
