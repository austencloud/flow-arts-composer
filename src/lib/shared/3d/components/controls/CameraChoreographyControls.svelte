<script lang="ts">
  /**
   * CameraChoreographyControls - Camera choreography mode toggle and keyframe controls
   *
   * Compact control bar for enabling choreographed camera and managing keyframes.
   * Shows keyframe count, recording state, and quick add/clear actions.
   */

  import type { CameraChoreographyState } from "../../state/camera-choreography-state.svelte";
  import type { CameraPosition } from "@austencloud/scene-3d";

  interface Props {
    /** Camera choreography state */
    choreographyState: CameraChoreographyState;
    /** Current beat number for keyframe placement */
    currentStep: number;
    /** Current camera position for capturing */
    currentCameraPosition?: CameraPosition;
    /** Current camera target for capturing */
    currentCameraTarget?: CameraPosition;
    /** Whether a sequence is loaded */
    hasSequence?: boolean;
  }

  let {
    choreographyState,
    currentStep,
    currentCameraPosition,
    currentCameraTarget,
    hasSequence = false,
  }: Props = $props();

  function handleAddKeyframe() {
    if (!currentCameraPosition || !currentCameraTarget) return;
    choreographyState.addKeyframe(
      currentStep,
      currentCameraPosition,
      currentCameraTarget
    );
  }

  function handleToggleRecording() {
    if (choreographyState.isRecording) {
      choreographyState.stopRecording();
    } else {
      choreographyState.startRecording();
    }
  }
</script>

<div class="choreography-controls" class:enabled={choreographyState.isEnabled}>
  <!-- Mode Toggle -->
  <button
    class="mode-toggle"
    class:active={choreographyState.isEnabled}
    onclick={() => choreographyState.toggle()}
    aria-label={choreographyState.isEnabled
      ? "Switch to orbit camera"
      : "Enable choreographed camera"}
    title={choreographyState.isEnabled
      ? "Switch to orbit camera"
      : "Enable choreographed camera"}
    disabled={!hasSequence}
  >
    <i class="fas fa-video" aria-hidden="true"></i>
    <span class="label">Choreo</span>
  </button>

  {#if choreographyState.isEnabled}
    <!-- Keyframe Count -->
    <div class="keyframe-count" title="Keyframes">
      <i class="fas fa-key" aria-hidden="true"></i>
      <span>{choreographyState.keyframeCount}</span>
    </div>

    <!-- Add Keyframe -->
    <button
      class="action-btn"
      onclick={handleAddKeyframe}
      aria-label="Add keyframe at current step"
      title="Add keyframe at current step"
      disabled={!currentCameraPosition}
    >
      <i class="fas fa-plus" aria-hidden="true"></i>
    </button>

    <!-- Recording Toggle -->
    <button
      class="action-btn"
      class:recording={choreographyState.isRecording}
      onclick={handleToggleRecording}
      aria-label={choreographyState.isRecording
        ? "Stop recording"
        : "Start recording"}
      title={choreographyState.isRecording
        ? "Stop recording"
        : "Start recording"}
    >
      <i class="fas fa-circle" aria-hidden="true"></i>
    </button>

    <!-- Clear -->
    {#if choreographyState.keyframeCount > 0}
      <button
        class="action-btn danger"
        onclick={() => choreographyState.clearChoreography()}
        aria-label="Clear all keyframes"
        title="Clear all keyframes"
      >
        <i class="fas fa-trash" aria-hidden="true"></i>
      </button>
    {/if}
  {/if}
</div>

<style>
  .choreography-controls {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 10px;
  }

  .choreography-controls.enabled {
    border-color: var(--theme-accent, #8b5cf6);
  }

  .mode-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    background: transparent;
    border: none;
    border-radius: 8px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-compact, 12px);
    cursor: pointer;
    transition:
      background var(--duration-fast),
      color var(--duration-fast),
      opacity var(--duration-fast);
  }

  .mode-toggle:hover:not(:disabled) {
    color: var(--theme-text, #ffffff);
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
  }

  .mode-toggle.active {
    color: white;
    background: var(--theme-accent, #8b5cf6);
  }

  .mode-toggle:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .mode-toggle i {
    font-size: 14px;
  }

  .label {
    font-weight: 500;
  }

  .keyframe-count {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 10px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border-radius: 6px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-compact, 12px);
  }

  .keyframe-count i {
    font-size: var(--font-size-compact, 12px);
    opacity: 0.7;
  }

  .action-btn {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: 8px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: 12px;
    cursor: pointer;
    transition:
      background var(--duration-fast),
      color var(--duration-fast),
      opacity var(--duration-fast);
  }

  .action-btn:hover:not(:disabled) {
    color: var(--theme-text, #ffffff);
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
  }

  .action-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .action-btn.recording {
    color: var(--semantic-error, #ef4444);
    animation: pulse 1s ease-in-out infinite;
  }

  .action-btn.danger:hover:not(:disabled) {
    color: var(--semantic-error, #ef4444);
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .action-btn.recording {
      animation: none;
    }
  }
</style>
