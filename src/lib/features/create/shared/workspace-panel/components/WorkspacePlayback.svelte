<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
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
    <!-- Foreground for the workspace's click-background-to-close: taps here
         pause, seek, or scrub instead. -->
    <div class="playback-media" data-playback-foreground>
      <div class="player-stage">
        <InlineAnimationPlayer
          {sequence}
          sequenceLoadKey={loadIdentity}
          chrome="minimal"
          fill
          scrubbable
          videoDownload
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
            aria-label={t("create_ui_close_preview")}
            title={t("create_ui_close_preview")}
          >
            <i class="fas fa-times" aria-hidden="true"></i>
          </button>
        {/if}
      </div>
      <div
        class="notation-rail"
        role="group"
        aria-label={t("create_ui_sequence_pictographs")}
      >
        <!-- Full rail height even while the rail is opening, so the strip
             builds its cells once at their final size. -->
        <div class="rail-content">
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
</div>

<style>
  .workspace-playback {
    position: relative;
    width: 100%;
    height: 100%;
    container-type: size;
  }
  /* How far the notation rail is open, 0 to 1. Registered so it can ease, and
     not inherited so easing it restyles only .playback-media instead of every
     pictograph inside the player. */
  @property --rail-open {
    syntax: "<number>";
    inherits: false;
    initial-value: 0;
  }
  .playback-layout {
    /* Left unresolved here: the container units resolve against this box
       wherever the size is read. */
    --rail-size: clamp(72px, 14cqh, 104px);
    --sequence-seek-target-size: var(--min-touch-target, 44px);
    position: absolute;
    inset: 4px 12px 8px;
    container-type: size;
  }
  .playback-media {
    cursor: default;
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    display: grid;
    /* The canvas stays square in the height the seek target and the open part
       of the rail leave. The sums are written out, not shared through a
       variable: an inherited variable that changes while the rail eases would
       restyle the whole player every frame. */
    grid-template-rows: minmax(0, 1fr) calc(var(--rail-open) * var(--rail-size));
    width: min(
      100cqw,
      calc(
        100cqh - var(--rail-open) * var(--rail-size) -
          var(--sequence-seek-target-size)
      )
    );
    height: calc(
      min(
          100cqw,
          calc(
            100cqh - var(--rail-open) * var(--rail-size) -
              var(--sequence-seek-target-size)
          )
        ) +
        var(--sequence-seek-target-size) + var(--rail-open) * var(--rail-size)
    );
    transition: --rail-open var(--duration-emphasis) var(--ease-out);
  }
  .player-stage {
    position: relative;
    min-height: 0;
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
    min-height: 0;
    overflow: hidden;
    visibility: hidden;
    opacity: 0;
    transition:
      opacity var(--duration-emphasis) var(--ease-out),
      visibility var(--duration-emphasis);
  }
  .rail-content {
    height: var(--rail-size);
  }
  /* Wide enough for a rail: lay it out closed, so its cells are built with
     the player rather than in the middle of Play's growth. Narrower players
     never show it, so it stays out of layout there. */
  @container (min-width: 520px) {
    .notation-rail {
      display: block;
    }
  }
  /* Tall enough as well: the rail eases open while the canvas keeps growing.
     The canvas and the rail read the same container, so the canvas can never
     give up room before the rail is there to fill it. */
  @container (min-width: 520px) and (min-height: 360px) {
    .playback-media {
      --rail-open: 1;
    }
    .notation-rail {
      visibility: visible;
      opacity: 1;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .playback-media,
    .notation-rail {
      transition: none;
    }
  }
</style>
