<script lang="ts">
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import InlineAnimationPlayer from "$lib/features/browse/sequences/display/components/media-viewer/InlineAnimationPlayer.svelte";
  import StepStrip from "$lib/shared/timeline/StepStrip.svelte";
  import {
    createEffectsConfigState,
    type EffectsConfigState,
  } from "$lib/shared/effects/state/effects-config-state.svelte";
  import { getAnimationVisibilityManager } from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";

  let {
    sequence,
    active,
    run,
    onready,
    onerror,
    onStepChange,
    onPlaybackChange,
    onclose,
  }: {
    sequence: SequenceData;
    active: boolean;
    /** Advances for every explicit Play so a retained engine restarts cleanly. */
    run: number;
    /** Fires only after the retained canvas has painted its first frame. */
    onready: (run: number) => void;
    /** Cancels a pending Play when the animation engine cannot load its data. */
    onerror: (run: number) => void;
    onStepChange?: (step: number) => void;
    onPlaybackChange?: (run: number, step: number, playing: boolean) => void;
    /** Returns the workspace to the editable card. Rendered as a corner X so
     *  the preview carries its own exit instead of relying on Stop or Escape. */
    onclose?: () => void;
  } = $props();

  let currentStep = $state(0);
  let playing = $state(false);
  let startedRun = $state<number | null>(null);
  let seek: ((step: number) => void) | null = null;
  // CanvasSurface reports its first painted frame once for this retained
  // component. Subsequent Play runs only need their new sequence data loaded.
  let canvasInitialized = $state(false);
  let loadedRun = $state<number | null>(null);
  const visibilityManager = getAnimationVisibilityManager();
  let effectsConfigState = $state<EffectsConfigState>(
    visibilityManager.effectsConfigState ?? createEffectsConfigState()
  );
  const loadIdentity = $derived(`${sequence.id}:${run}`);

  $effect(() => {
    const syncEffectsConfig = () => {
      effectsConfigState =
        visibilityManager.effectsConfigState ?? effectsConfigState;
    };
    visibilityManager.registerObserver(syncEffectsConfig);
    syncEffectsConfig();
    return () => visibilityManager.unregisterObserver(syncEffectsConfig);
  });

  function confirmReady() {
    if (canvasInitialized && loadedRun === run) onready(run);
  }

  $effect(() => {
    if (!active || startedRun === run) return;
    startedRun = run;
    playing = true;
  });

  $effect(() => {
    onPlaybackChange?.(run, currentStep, playing);
  });
</script>

<div class="workspace-playback" data-testid="workspace-playback">
  <div class="playback-layout">
    <div class="playback-media">
      <div class="player-stage">
        <InlineAnimationPlayer
          {sequence}
          sequenceLoadKey={loadIdentity}
          chrome="minimal"
          fill
          scrubbable
          showScrubberPlaybackControl
          hoverHint="none"
          autoPlay={active}
          autoPlayDelay={0}
          playbackAllowed={active}
          resumeWhenPlaybackAllowed
          externalPlaying={active ? playing : false}
          {effectsConfigState}
          onReady={(loadedIdentity) => {
            if (loadedIdentity !== loadIdentity) return;
            loadedRun = run;
            confirmReady();
          }}
          onCanvasInitialized={() => {
            canvasInitialized = true;
            confirmReady();
          }}
          onLoadError={(_message, failedIdentity) => {
            if (failedIdentity === loadIdentity) onerror(run);
          }}
          onExternalPlayingChange={(nextPlaying) => {
            playing = nextPlaying;
          }}
          onStepChange={(step) => {
            currentStep = step;
            onStepChange?.(step);
          }}
          onSeekRef={(callback) => (seek = callback)}
        />
        {#if onclose}
          <button
            type="button"
            class="close-preview"
            onclick={onclose}
            aria-label="Close preview"
            title="Close preview"
          >
            <i class="fas fa-times" aria-hidden="true"></i>
          </button>
        {/if}
      </div>
      <div class="notation-rail" role="group" aria-label="Sequence pictographs">
        <StepStrip
          {sequence}
          {currentStep}
          bpm={60}
          density="compact"
          presentation="strip"
          fillHeight
          onCellClick={(step) => seek?.(step)}
        />
      </div>
    </div>
  </div>
</div>

<style>
  .workspace-playback {
    position: relative;
    width: 100%;
    height: 100%;
    container-type: size;
  }
  .playback-layout {
    --notation-height: 0px;
    --sequence-seek-target-size: var(--min-touch-target, 44px);
    position: absolute;
    inset: 4px 12px 8px;
    container-type: size;
  }
  .playback-media {
    /* The seek target has its own reserved row; the canvas stays square. */
    --canvas-size: min(
      100cqw,
      calc(100cqh - var(--notation-height) - var(--sequence-seek-target-size))
    );
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: var(--canvas-size);
    height: calc(
      var(--canvas-size) + var(--sequence-seek-target-size) +
        var(--notation-height)
    );
  }
  .player-stage {
    position: relative;
    width: 100%;
    height: calc(100% - var(--notation-height));
  }
  /* Corner exit. Sits over the canvas's empty top-right, matching the quiet
     chrome of the rest of the preview: a translucent disc that only firms up
     on hover. */
  .close-preview {
    position: absolute;
    top: 8px;
    right: 8px;
    /* The animator canvas is position:relative at z-index 3; sit above it or
       taps fall through to its tap-to-pause handler. */
    z-index: 4;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: color-mix(in srgb, var(--theme-text, #fff) 12%, transparent);
    color: var(--theme-text, #fff);
    font-size: var(--font-size-sm, 14px);
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition:
      background var(--duration-fast) ease-out,
      opacity var(--duration-fast) ease-out;
  }
  @media (hover: hover) and (pointer: fine) {
    .close-preview:hover {
      background: color-mix(in srgb, var(--theme-text, #fff) 24%, transparent);
    }
  }
  .close-preview:active {
    opacity: 0.6;
  }
  .close-preview:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }
  .notation-rail {
    display: none;
    height: var(--notation-height);
    overflow: hidden;
  }
  @container (min-width: 520px) and (min-height: 360px) {
    .playback-layout {
      --notation-height: clamp(72px, 14cqh, 104px);
    }
    .notation-rail {
      display: block;
    }
  }
</style>
