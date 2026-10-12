<!--
	ControlBar.svelte - Playback and keyframe controls

	Provides frame-by-frame navigation, keyframe jumping, and keyframe marking.
-->
<script lang="ts">
  let {
    currentFrameIndex,
    totalFrames,
    keyframeCount,
    isKeyframe,
    confidence,
    onPrevFrame,
    onNextFrame,
    onPrevKeyframe,
    onNextKeyframe,
    onToggleKeyframe,
    onSeek,
  }: {
    currentFrameIndex: number;
    totalFrames: number;
    keyframeCount: number;
    isKeyframe: boolean;
    confidence: number;
    onPrevFrame: () => void;
    onNextFrame: () => void;
    onPrevKeyframe: () => void;
    onNextKeyframe: () => void;
    onToggleKeyframe: () => void;
    onSeek: (index: number) => void;
  } = $props();

  function handleSliderChange(event: Event) {
    const target = event.target as HTMLInputElement;
    onSeek(parseInt(target.value, 10));
  }

  function handleKeydown(event: KeyboardEvent) {
    switch (event.key) {
      case "ArrowLeft":
        event.shiftKey ? onPrevKeyframe() : onPrevFrame();
        event.preventDefault();
        break;
      case "ArrowRight":
        event.shiftKey ? onNextKeyframe() : onNextFrame();
        event.preventDefault();
        break;
      case " ":
      case "k":
        onToggleKeyframe();
        event.preventDefault();
        break;
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="control-bar">
  <!-- Timeline slider -->
  <div class="timeline">
    <input
      type="range"
      min="0"
      max={totalFrames - 1}
      value={currentFrameIndex}
      oninput={handleSliderChange}
      class="timeline-slider"
      aria-label="Frame position"
    />
    <div
      class="confidence-indicator"
      style="background: {confidence > 0.7
        ? 'var(--semantic-success)'
        : confidence > 0.4
          ? 'var(--semantic-warning)'
          : 'var(--semantic-error)'}"
    ></div>
  </div>

  <!-- Navigation buttons -->
  <div class="nav-buttons">
    <button
      class="nav-btn"
      onclick={onPrevKeyframe}
      disabled={currentFrameIndex === 0}
      title="Previous keyframe (Shift+←)"
      aria-label="Previous keyframe"
    >
      <i class="fa fa-step-backward" aria-hidden="true"></i>
    </button>

    <button
      class="nav-btn"
      onclick={onPrevFrame}
      disabled={currentFrameIndex === 0}
      title="Previous frame (←)"
      aria-label="Previous frame"
    >
      <i class="fa fa-chevron-left" aria-hidden="true"></i>
    </button>

    <button
      class="keyframe-btn"
      class:is-keyframe={isKeyframe}
      onclick={onToggleKeyframe}
      title="Toggle keyframe (Space or K)"
      aria-label="Toggle keyframe"
      aria-pressed={isKeyframe}
    >
      <i class="fa fa-bookmark{isKeyframe ? '' : '-o'}" aria-hidden="true"></i>
    </button>

    <button
      class="nav-btn"
      onclick={onNextFrame}
      disabled={currentFrameIndex >= totalFrames - 1}
      title="Next frame (→)"
      aria-label="Next frame"
    >
      <i class="fa fa-chevron-right" aria-hidden="true"></i>
    </button>

    <button
      class="nav-btn"
      onclick={onNextKeyframe}
      disabled={currentFrameIndex >= totalFrames - 1}
      title="Next keyframe (Shift+→)"
      aria-label="Next keyframe"
    >
      <i class="fa fa-step-forward" aria-hidden="true"></i>
    </button>
  </div>

  <!-- Keyboard shortcuts hint -->
  <div class="shortcuts-hint">
    <span><kbd>←</kbd><kbd>→</kbd> Frame</span>
    <span><kbd>Shift</kbd>+<kbd>←</kbd><kbd>→</kbd> Keyframe</span>
    <span><kbd>Space</kbd> Mark</span>
  </div>
</div>

<style>
  .control-bar {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1rem;
    background: var(--theme-card-bg);
    border-radius: 12px;
  }

  /* Timeline */
  .timeline {
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .timeline-slider {
    flex: 1;
    height: 8px;
    -webkit-appearance: none;
    appearance: none;
    background: var(--theme-stroke);
    border-radius: 4px;
    cursor: pointer;
  }

  .timeline-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 16px;
    height: 16px;
    background: var(--theme-accent);
    border-radius: 50%;
    cursor: grab;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  }

  .timeline-slider::-webkit-slider-thumb:active {
    cursor: grabbing;
  }

  .confidence-indicator {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  /* Navigation buttons */
  .nav-buttons {
    display: flex;
    justify-content: center;
    gap: 0.5rem;
  }

  .nav-btn,
  .keyframe-btn {
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 50%;
    cursor: pointer;
    font-size: 1rem;
    transition: transform var(--duration-normal);
  }

  .nav-btn {
    background: var(--theme-stroke);
    color: var(--theme-text);
  }

  .nav-btn:hover:not(:disabled) {
    background: var(--theme-stroke-strong);
  }

  .nav-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .keyframe-btn {
    background: var(--theme-stroke);
    color: var(--theme-text-dim);
    width: 56px;
    height: 56px;
    font-size: 1.25rem;
  }

  .keyframe-btn.is-keyframe {
    background: var(--semantic-warning);
    color: white;
  }

  .keyframe-btn:hover {
    transform: scale(1.05);
  }

  /* Shortcuts hint */
  .shortcuts-hint {
    display: flex;
    justify-content: center;
    gap: 1rem;
    font-size: var(--font-size-compact);
    opacity: 0.5;
  }

  .shortcuts-hint span {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  kbd {
    padding: 0.125rem 0.375rem;
    background: var(--theme-stroke);
    border-radius: 4px;
    font-family: inherit;
    font-size: 0.75rem;
  }

  @media (max-width: 480px) {
    .shortcuts-hint {
      display: none;
    }
  }
</style>
