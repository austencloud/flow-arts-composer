<script lang="ts">
  interface Props {
    currentFrame: number;
    totalFrames: number;
    slowPlaying: boolean;
    onStepBack1: () => void;
    onStepBack10: () => void;
    onStepForward1: () => void;
    onStepForward10: () => void;
    onToggleSlowPlay: () => void;
  }

  const {
    currentFrame,
    totalFrames,
    slowPlaying,
    onStepBack1,
    onStepBack10,
    onStepForward1,
    onStepForward10,
    onToggleSlowPlay,
  }: Props = $props();
</script>

<div class="frame-stepper">
  <div class="nav-buttons">
    <button
      class="step-btn"
      onclick={onStepBack10}
      aria-label="Back 10 frames"
      disabled={currentFrame < 10}
    >
      <i class="fas fa-angles-left" aria-hidden="true"></i>
    </button>
    <button
      class="step-btn"
      onclick={onStepBack1}
      aria-label="Back 1 frame"
      disabled={currentFrame === 0}
    >
      <i class="fas fa-chevron-left" aria-hidden="true"></i>
    </button>

    <span class="frame-display">
      Frame <strong>{currentFrame + 1}</strong>
      <span class="separator">/</span>
      {totalFrames}
    </span>

    <button
      class="step-btn"
      onclick={onStepForward1}
      aria-label="Forward 1 frame"
      disabled={currentFrame >= totalFrames - 1}
    >
      <i class="fas fa-chevron-right" aria-hidden="true"></i>
    </button>
    <button
      class="step-btn"
      onclick={onStepForward10}
      aria-label="Forward 10 frames"
      disabled={currentFrame >= totalFrames - 10}
    >
      <i class="fas fa-angles-right" aria-hidden="true"></i>
    </button>
  </div>

  <button
    class="slow-play-btn"
    class:active={slowPlaying}
    onclick={onToggleSlowPlay}
    aria-label={slowPlaying ? "Pause slow playback" : "Start slow playback"}
  >
    <i class="fas {slowPlaying ? 'fa-pause' : 'fa-play'}" aria-hidden="true"
    ></i>
    {slowPlaying ? "Pause" : "Slow Play"}
  </button>

  <div class="shortcuts-hint">
    <span class="key-hint"><kbd>&larr;</kbd><kbd>&rarr;</kbd> ±1</span>
    <span class="key-hint"
      ><kbd>Shift</kbd>+<kbd>&larr;</kbd><kbd>&rarr;</kbd> ±10</span
    >
  </div>
</div>

<style>
  .frame-stepper {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
    flex-wrap: wrap;
    justify-content: center;
  }

  .nav-buttons {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .step-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 6px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text, #ffffff);
    font-size: var(--font-size-min, 14px);
    cursor: pointer;
    transition:
      border-color var(--duration-fast),
      background var(--duration-fast);
  }

  .step-btn:hover:not(:disabled) {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    background: var(--theme-card-bg-hover, rgba(255, 255, 255, 0.08));
  }

  .step-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .frame-display {
    font-size: var(--font-size-min, 14px);
    color: var(--theme-text, #ffffff);
    font-variant-numeric: tabular-nums;
    min-width: 120px;
    text-align: center;
    user-select: none;
  }

  .frame-display strong {
    font-weight: 700;
    font-size: 16px;
  }

  .separator {
    opacity: 0.4;
    margin: 0 2px;
  }

  .slow-play-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 6px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text, #ffffff);
    font-size: var(--font-size-compact, 12px);
    cursor: pointer;
    transition:
      border-color var(--duration-fast),
      background var(--duration-fast);
  }

  .slow-play-btn:hover {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    background: var(--theme-card-bg-hover, rgba(255, 255, 255, 0.08));
  }

  .slow-play-btn.active {
    border-color: var(--theme-accent, #f43f5e);
    background: color-mix(
      in srgb,
      var(--theme-accent, #f43f5e) 15%,
      transparent
    );
    color: var(--theme-accent, #f43f5e);
  }

  .shortcuts-hint {
    display: flex;
    gap: 10px;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
  }

  .key-hint {
    display: flex;
    align-items: center;
    gap: 3px;
  }

  kbd {
    display: inline-block;
    padding: 1px 5px;
    background: var(--theme-card-bg-hover, rgba(255, 255, 255, 0.06));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 3px;
    font-family: inherit;
    font-size: var(--font-size-compact, 12px);
    line-height: 1.4;
  }
</style>
