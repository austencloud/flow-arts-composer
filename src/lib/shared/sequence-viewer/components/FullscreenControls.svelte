<!--
  FullscreenControls.svelte

  Floating overlay controls for fullscreen mode.
  Auto-hides after 3 seconds and shows on tap.
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import TransportControls from "$lib/shared/animation-engine/components/controls/TransportControls.svelte";
  import TempoControl from "$lib/shared/animation-panel/components/TempoControl.svelte";

  interface Props {
    visible: boolean;
    viewMode: "animation" | "image" | "split";
    isPlaying: boolean;
    bpm: number;
    onExit: () => void;
    onPlaybackToggle: () => void;
    onStepHalfBeatBackward: () => void;
    onStepHalfBeatForward: () => void;
    onStepFullBeatBackward: () => void;
    onStepFullBeatForward: () => void;
    onRestartToStart?: () => void;
    onBpmChange: (bpm: number) => void;
  }

  let {
    visible,
    viewMode,
    isPlaying,
    bpm,
    onExit,
    onPlaybackToggle,
    onStepHalfBeatBackward,
    onStepHalfBeatForward,
    onStepFullBeatBackward,
    onStepFullBeatForward,
    onRestartToStart,
    onBpmChange,
  }: Props = $props();
</script>

<div class="fullscreen-overlay-controls" class:visible>
  <button
    type="button"
    class="fs-close-btn"
    onclick={(e) => { e.stopPropagation(); onExit(); }}
    aria-label={t("viewer_ui_exit_fullscreen")}
  >
    <i class="fas fa-compress" aria-hidden="true"></i>
  </button>

  {#if viewMode !== "image"}
    <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
    <div class="fs-transport" role="presentation" onclick={(e) => e.stopPropagation()}>
      <TransportControls
        {isPlaying}
        onPlaybackToggle={onPlaybackToggle}
        onStepHalfBeatBackward={onStepHalfBeatBackward}
        onStepHalfBeatForward={onStepHalfBeatForward}
        onStepFullBeatBackward={onStepFullBeatBackward}
        onStepFullBeatForward={onStepFullBeatForward}
        onRestartToStart={onRestartToStart}
      />
      <TempoControl
        {bpm}
        onBpmChange={onBpmChange}
        showPresets={false}
        showPractice={false}
      />
    </div>
  {/if}
</div>

<style>
  .fullscreen-overlay-controls {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
    padding: 16px;
    pointer-events: none;
    opacity: 0;
    transition: opacity var(--duration-normal, 200ms) var(--ease-out, ease-out);
    z-index: 10;
  }

  .fullscreen-overlay-controls.visible {
    opacity: 1;
  }

  .fullscreen-overlay-controls.visible > * {
    pointer-events: auto;
  }

  .fs-close-btn {
    align-self: flex-end;
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    border: none;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.6);
    color: white;
    font-size: 20px;
    cursor: pointer;
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    transition: all var(--duration-fast, 150ms) var(--ease-out, ease-out);
  }

  .fs-close-btn:hover {
    background: rgba(0, 0, 0, 0.8);
    transform: scale(1.05);
  }

  .fs-close-btn:active {
    transform: scale(0.95);
  }

  .fs-transport {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 16px 24px;
    background: rgba(0, 0, 0, 0.6);
    border-radius: 16px;
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }

  /* Responsive */
  @media (max-width: 767px) {
    .fullscreen-overlay-controls {
      padding: 12px;
    }

    .fs-close-btn {
      width: 44px;
      height: 44px;
      font-size: 18px;
    }

    .fs-transport {
      padding: 12px 16px;
      gap: 8px;
    }
  }
</style>
