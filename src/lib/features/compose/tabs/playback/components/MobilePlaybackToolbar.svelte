<!--
  MobilePlaybackToolbar.svelte

  Mobile toolbar for playback panel.
  Layout: [View Toggle] ... [Play Button] ... [Close Button]
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { MobileToolView } from "../state/playback-state.svelte";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import MobileToolViewToggle from "../../../components/inputs/MobileToolViewToggle.svelte";
  import ShareButton from "#lib/features/create/shared/workspace-panel/shared/components/buttons/ShareButton.svelte";

  let {
    isPlaying = false,
    activeView = "controls" as MobileToolView,
    sequence = null,
    onPlayPause,
    onToggleView,
    onClose,
  }: {
    isPlaying: boolean;
    activeView: MobileToolView;
    sequence?: SequenceData | null;
    onPlayPause: () => void;
    onToggleView: () => void;
    onClose: () => void;
  } = $props();
</script>

<div class="mobile-toolbar">
  <div class="toolbar-left">
    <MobileToolViewToggle {activeView} onToggle={onToggleView} />
  </div>

  <div class="toolbar-center">
    <button
      class="play-btn"
      class:playing={isPlaying}
      onclick={onPlayPause}
      aria-label={isPlaying ? "Pause" : "Play"}
    >
      <i class="fas fa-{isPlaying ? 'pause' : 'play'}" aria-hidden="true"></i>
    </button>
  </div>

  <div class="toolbar-right">
    <ShareButton {sequence} useMobileSheet />
    <button
      class="close-btn"
      onclick={onClose}
      aria-label={t("compose_ui_close_playback")}
    >
      <i class="fas fa-chevron-down" aria-hidden="true"></i>
    </button>
  </div>
</div>

<style>
  .mobile-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    background: var(--theme-panel-bg);
    border-bottom: 1px solid var(--theme-stroke);
  }

  .toolbar-left,
  .toolbar-center,
  .toolbar-right {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .toolbar-left,
  .toolbar-right {
    flex: 1;
  }

  .toolbar-left {
    justify-content: flex-start;
  }

  .toolbar-right {
    justify-content: flex-end;
    gap: 0.625rem;
  }

  .toolbar-center {
    flex: 0 0 auto;
  }

  .play-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--theme-accent, #8b5cf6) 30%, transparent) 0%,
      color-mix(in srgb, var(--theme-accent-strong, #7c3aed) 25%, transparent)
        100%
    );
    border: 2px solid
      color-mix(in srgb, var(--theme-accent, #8b5cf6) 50%, transparent);
    color: var(--theme-accent, #c4b5fd);
    font-size: 1.25rem;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
    -webkit-tap-highlight-color: transparent;
  }

  .play-btn:hover {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--theme-accent, #8b5cf6) 40%, transparent) 0%,
      color-mix(in srgb, var(--theme-accent-strong, #7c3aed) 35%, transparent)
        100%
    );
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 70%,
      transparent
    );
    transform: scale(1.05);
  }

  .play-btn:active {
    transform: scale(0.95);
  }

  .play-btn.playing {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--semantic-success, #22c55e) 30%, transparent) 0%,
      color-mix(in srgb, var(--semantic-success, #16a34a) 25%, transparent) 100%
    );
    border-color: color-mix(
      in srgb,
      var(--semantic-success, #22c55e) 60%,
      transparent
    );
    color: var(--semantic-success, #86efac);
  }

  .close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    border-radius: 50%;
    background: var(--theme-card-bg);
    border: 1.5px solid var(--theme-stroke-strong);
    color: var(--theme-text-dim);
    font-size: 1rem;
    cursor: pointer;
    transition: all var(--duration-normal) cubic-bezier(0.4, 0, 0.2, 1);
    -webkit-tap-highlight-color: transparent;
  }

  .close-btn:hover {
    background: color-mix(in srgb, var(--theme-text, #ffffff) 12%, transparent);
    border-color: var(--theme-stroke-strong);
    color: var(--theme-text);
    transform: scale(1.05);
  }

  .close-btn:active {
    transform: scale(0.95);
  }

  /* Safe area support */
  @supports (padding-top: env(safe-area-inset-top)) {
    .mobile-toolbar {
      padding-top: calc(0.75rem + env(safe-area-inset-top));
    }
  }
</style>
