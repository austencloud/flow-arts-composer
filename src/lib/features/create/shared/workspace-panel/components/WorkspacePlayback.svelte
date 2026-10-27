<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import InlineAnimationPlayer from "#lib/features/browse/sequences/display/components/media-viewer/InlineAnimationPlayer.svelte";
  import StepStrip from "#lib/shared/timeline/StepStrip.svelte";
  import EffectQuickSwitch from "#lib/shared/animation-engine/components/effects-panel/EffectQuickSwitch.svelte";
  import {
    createEffectsConfigState,
    type EffectsConfigState,
  } from "#lib/shared/effects/state/effects-config-state.svelte.js";
  import { getAnimationVisibilityManager } from "#lib/shared/animation-engine/state/animation-visibility-state.svelte.js";

  let {
    sequence,
    active,
    run,
    onready,
    onerror,
    onStepChange,
    onPlaybackChange,
    onclose,
    onExpand,
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
    /** Hands the running playback to the full Sequence Viewer. Rendered at
     *  the end of the scrubber row, after the effect button, where video
     *  players put fullscreen; hidden when no handler is passed. */
    onExpand?: () => void;
  } = $props();

  let currentStep = $state(0);
  let playing = $state(false);
  let startedRun = $state<number | null>(null);
  let seek: ((step: number) => void) | null = null;
  // CanvasSurface reports its first painted frame once for this retained
  // component. Subsequent Play runs only need their new sequence data loaded.
  let canvasInitialized = $state(false);
  let loadedRun = $state<number | null>(null);
  let playerStage = $state<HTMLElement | null>(null);
  let playbackArea = $state<HTMLElement | null>(null);
  let playbackLayout = $state<HTMLElement | null>(null);
  let playbackMedia = $state<HTMLElement | null>(null);
  let notationRail = $state<HTMLElement | null>(null);
  /** Where the open effect picker sits, or null while it is closed. */
  let effectPickerArrangement = $state<string | null>(null);
  /** How far the open effect picker lifts the player, in px, and shrinks it
   *  from its top edge. */
  let effectPickerLift = $state(0);
  let effectPickerScale = $state(1);
  const visibilityManager = getAnimationVisibilityManager();
  let effectsConfigState = $state<EffectsConfigState>(
    visibilityManager.effectsConfigState ?? createEffectsConfigState()
  );
  const loadIdentity = $derived(`${sequence.id}:${run}`);

  /** Where the effect picker may sit: the app's content area, so it can cover
   *  the settings panel beside the player or the idle toolbar under it, but
   *  never the app's sidebar or bottom navigation. */
  const effectPickerBounds = $derived(
    playbackArea?.closest<HTMLElement>("#main-content") ?? playbackArea
  );

  /** The player where it rests, centred in its layout at its own size, so
   *  the effect picker's fit gives the same answer while the player is lifted
   *  or shrunk for it, or easing back. The lift and the shrink are a
   *  transform: the layout's box and the transform on screen (mid-transition
   *  included) say where the rest is. */
  function playerAtRest() {
    if (!playbackLayout || !playbackMedia || !playerStage) return null;
    const layout = playbackLayout.getBoundingClientRect();
    const media = playbackMedia.getBoundingClientRect();
    const stage = playerStage.getBoundingClientRect();
    const transform = getComputedStyle(playbackMedia).transform;
    const scale =
      transform && transform !== "none" ? new DOMMatrix(transform).a || 1 : 1;
    // It shrinks from its top centre.
    const centre = media.left + media.width / 2;
    const top = layout.top + (layout.height - media.height / scale) / 2;
    return {
      room: Math.max(0, top - layout.top),
      stage: new DOMRect(
        centre + (stage.left - centre) / scale,
        top + (stage.top - media.top) / scale,
        stage.width / scale,
        stage.height / scale
      ),
      scale,
    };
  }

  /** The empty room above the player, which the effect picker's docked
   *  sheet may lift it into, and the player's box at rest. */
  function effectPickerRoomAbove() {
    const rest = playerAtRest();
    return { room: rest?.room ?? 0, rest: rest?.stage ?? null };
  }

  /** What the effect picker may cover under the player's controls, with the
   *  player at rest: the notation rail when it is open, whole (it lifts with
   *  the player), otherwise the empty space down to the workspace's toolbar. */
  function effectPickerRoomBelow() {
    const rest = playerAtRest();
    if (!playbackArea || !playerStage || !rest) return 0;
    const rail = notationRail?.getBoundingClientRect();
    if (rail && rail.height > 1) {
      return (
        (rail.bottom - playerStage.getBoundingClientRect().bottom) / rest.scale
      );
    }
    return playbackArea.getBoundingClientRect().bottom - rest.stage.bottom;
  }

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

<!-- The scrubber row's trailing controls, left to right after the scrubber:
     the effect button, then open-in-viewer. -->
{#snippet scrubberEnd()}
  <EffectQuickSwitch
    {effectsConfigState}
    player={playerStage}
    bounds={effectPickerBounds}
    roomBelow={effectPickerRoomBelow}
    roomAbove={effectPickerRoomAbove}
    onLift={(px, scale) => {
      effectPickerLift = px;
      effectPickerScale = scale;
    }}
    onArrange={(arrangement) => (effectPickerArrangement = arrangement)}
  />
  {#if onExpand}
    <button
      type="button"
      class="expand-viewer"
      onclick={onExpand}
      aria-label={t("create_workspace_expand_viewer")}
      title={t("create_workspace_expand_viewer")}
    >
      <i class="fas fa-expand" aria-hidden="true"></i>
    </button>
  {/if}
{/snippet}

<div
  class="workspace-playback"
  data-testid="workspace-playback"
  bind:this={playbackArea}
>
  <div class="playback-layout" bind:this={playbackLayout}>
    <!-- Foreground for the workspace's click-background-to-close: taps here
         pause, seek, or scrub instead. -->
    <div
      class="playback-media"
      data-playback-foreground
      bind:this={playbackMedia}
      style:--picker-lift="{effectPickerLift}px"
      style:--picker-scale={effectPickerScale}
    >
      <div class="player-stage" bind:this={playerStage}>
        <InlineAnimationPlayer
          {sequence}
          sequenceLoadKey={loadIdentity}
          chrome="minimal"
          fill
          scrubbable
          videoDownload
          showScrubberPlaybackControl
          scrubberTrailing={scrubberEnd}
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
        class:under-picker={effectPickerArrangement === "below" ||
          effectPickerArrangement === "dock"}
        bind:this={notationRail}
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
  /* How far the notation rail is open, 0 to 1. Registered so it can var(--ease-standard), and
     not inherited so easing it restyles only .playback-media instead of every
     pictograph inside the player. */
  @property --rail-open {
    syntax: "<number>";
    inherits: false;
    initial-value: 0;
  }
  /* How far the effect picker's docked sheet lifts the player into the empty
     room above it, and shrinks it from its top edge where that is not enough.
     Not inherited, so setting them restyles only .playback-media. */
  @property --picker-lift {
    syntax: "<length>";
    inherits: false;
    initial-value: 0px;
  }
  @property --picker-scale {
    syntax: "<number>";
    inherits: false;
    initial-value: 1;
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
    /* Centred, and lifted while the effect picker's docked sheet needs the
       room above (shrunk from its top edge where even that is short): the
       player slides up as the sheet rises under it, and back down as it
       closes, the whole animation always above the sheet. A transform, so the
       canvas keeps its size and buffer and only the compositor scales it. */
    transform: translate(-50%, calc(-50% - var(--picker-lift)))
      scale(var(--picker-scale));
    transform-origin: top center;
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
    transition:
      --rail-open var(--duration-emphasis) var(--ease-out),
      transform var(--duration-normal) var(--ease-standard);
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
      background var(--duration-fast) var(--ease-standard-out),
      opacity var(--duration-fast) var(--ease-standard-out);
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
  /* Open in viewer: the scrubber row's own control idiom, matching the inline
     play/pause toggle at the row's start. A bare glyph in a full 44px target
     that shares the row's background, with a round tint on hover. */
  .expand-viewer {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--theme-text);
    font-size: var(--font-size-sm, 14px);
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition:
      background var(--duration-fast) var(--ease-standard-out),
      opacity var(--duration-fast) var(--ease-standard-out);
  }
  @media (hover: hover) and (pointer: fine) {
    .expand-viewer:hover {
      background: color-mix(in srgb, currentColor 14%, transparent);
    }
  }
  .expand-viewer:active {
    opacity: 0.6;
  }
  .expand-viewer:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: -4px;
  }
  /* Always laid out, closed until there is height for it, so its cells are
     built with the player rather than in the middle of Play's growth. Phones
     get the rail too: it sits under the canvas at every width. */
  .notation-rail {
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
  /* Tall enough: the rail eases open while the canvas keeps growing. The
     canvas and the rail read the same container, so the canvas can never give
     up room before the rail is there to fill it. */
  @container (min-height: 360px) {
    .playback-media {
      --rail-open: 1;
    }
    .notation-rail {
      visibility: visible;
      opacity: 1;
    }
  }
  /* The effect picker's row floats over the rail, or docks over the toolbar
     across the rail's lower edge on a short phone: the rail fades out behind
     it, so pictographs do not show through or get cut off by the row. */
  .notation-rail.under-picker {
    opacity: 0;
    pointer-events: none;
  }
  @media (prefers-reduced-motion: reduce) {
    .playback-media,
    .notation-rail,
    .expand-viewer {
      transition: none;
    }
  }
</style>
