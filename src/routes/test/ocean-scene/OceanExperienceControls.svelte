<script lang="ts">
  import SceneControlWorkspace from "#lib/shared/3d/components/controls/SceneControlWorkspace.svelte";

  let {
    isPlaying,
    compactControls,
    bpm,
    onPlaybackToggle,
    onStepForward,
    onStepBackward,
  } = $props<{
    isPlaying: boolean;
    compactControls: boolean;
    bpm: number;
    onPlaybackToggle: () => void;
    onStepForward: () => void;
    onStepBackward: () => void;
  }>();
</script>

<div class="experience-label" class:compact={compactControls}>
  <span>Standalone 3D</span>
  <strong>Ocean Stage</strong>
  <small>Drag to orbit. Scroll to zoom.</small>
</div>

<div class="experience-controls">
  <SceneControlWorkspace
    {bpm}
    showCompactPlayback={compactControls}
    {isPlaying}
    {onPlaybackToggle}
    {onStepForward}
    {onStepBackward}
  />
</div>

<style>
  .experience-label {
    position: fixed;
    top: max(1rem, env(safe-area-inset-top));
    left: max(5rem, calc(env(safe-area-inset-left) + 5rem));
    z-index: 30;
    display: grid;
    gap: 0.15rem;
    padding: 0.75rem 0.9rem;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 0.9rem;
    background: rgba(6, 20, 31, 0.88);
    box-shadow: 0 0.5rem 2rem rgba(0, 0, 0, 0.32);
    color: rgba(255, 255, 255, 0.94);
    pointer-events: none;
  }

  .experience-label span {
    color: #7dd3fc;
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .experience-label strong {
    font-size: clamp(1rem, 0.9rem + 0.2vw, 1.35rem);
    line-height: 1.1;
  }

  .experience-label small {
    color: rgba(255, 255, 255, 0.62);
    font-size: var(--font-size-compact, 0.75rem);
  }

  .experience-label.compact {
    left: max(1rem, env(safe-area-inset-left));
  }

  .experience-controls {
    position: absolute;
    inset: 0;
    z-index: 30;
    pointer-events: none;
  }

  .experience-controls :global(button),
  .experience-controls :global([role="button"]),
  .experience-controls :global([role="dialog"]) {
    pointer-events: auto;
  }

  @media (max-width: 520px) {
    .experience-label {
      padding: 0.55rem 0.7rem;
    }

    .experience-label small {
      display: none;
    }
  }

  @media (max-height: 520px) {
    .experience-label small,
    .experience-label span {
      display: none;
    }

    .experience-label {
      padding: 0.5rem 0.7rem;
    }
  }

  @media (min-width: 2600px) {
    .experience-label {
      padding: 1rem 1.2rem;
      border-radius: 1.2rem;
    }

    .experience-label span,
    .experience-label small {
      font-size: 1rem;
    }

    .experience-label strong {
      font-size: 1.75rem;
    }
  }
</style>
