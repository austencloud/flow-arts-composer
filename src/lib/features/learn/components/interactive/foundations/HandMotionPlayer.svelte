<script lang="ts">
  import InlineAnimationPlayer from "$lib/features/browse/sequences/display/components/media-viewer/InlineAnimationPlayer.svelte";
  import { AnimationVisibilityStateManager } from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { RenderActivityGate } from "$lib/shared/render-gating/render-activity-gate";
  import type { ViewerCustomColorPair } from "$lib/shared/sequence-viewer/domain/viewer-custom-colors";

  let {
    sequence,
    ariaLabel,
    neutralMarkers = false,
    propDisplay = "hands",
    primaryPropColors,
    showElementalGlyph = false,
    interactive = true,
    playbackAllowed = true,
    singlePlay = false,
    externalPlaying = null,
    externalStep = null,
    initialStep = null,
    onExternalSeek = undefined,
    playbackGate = undefined,
    onExternalPlayingChange = undefined,
    onStepChange = undefined,
    onSeekRef = undefined,
    framed = true,
    onCanvasInitialized,
    onLoadError,
  }: {
    sequence: SequenceData;
    ariaLabel: string;
    /** Timing/direction examples compare motions, not a particular body part. */
    neutralMarkers?: boolean;
    /** Public explainers can switch between the hand path and the authored prop. */
    propDisplay?: "hands" | "staff";
    primaryPropColors?: ViewerCustomColorPair;
    showElementalGlyph?: boolean;
    interactive?: boolean;
    playbackAllowed?: boolean;
    /** Rest at the end when a turn adjustment no longer closes the prop loop. */
    singlePlay?: boolean;
    externalPlaying?: boolean | null;
    externalStep?: number | null;
    initialStep?: number | null;
    onExternalSeek?: (step: number) => void;
    playbackGate?: RenderActivityGate;
    onExternalPlayingChange?: (playing: boolean) => void;
    onStepChange?: (currentStep: number, sequenceId: string | null) => void;
    onSeekRef?: (seek: ((step: number) => void) | null) => void;
    framed?: boolean;
    onCanvasInitialized?: () => void;
    onLoadError?: (message: string) => void;
  } = $props();

  const visibility = new AnimationVisibilityStateManager({ ephemeral: true });
  $effect(() => {
    visibility.updateSettings({
      elementalGlyph: showElementalGlyph,
      tkaGlyph: false,
      stepNumbers: false,
      wordHeader: false,
      progressBar: true,
      darkMode: true,
    });
  });
</script>

<div
  class="motion-player"
  class:framed
  role={interactive ? "group" : "img"}
  aria-label={ariaLabel}
>
  <InlineAnimationPlayer
    {sequence}
    {primaryPropColors}
    autoPlay
    chrome="minimal"
    fill
    showWordHeader={false}
    showPlacementGlyph={false}
    scrubbable={interactive}
    beatIndicators={false}
    hideTkaGlyph
    hideStepNumbers
    leftPropType={neutralMarkers
      ? "motion_point"
      : propDisplay === "staff"
        ? "staff"
        : "hand"}
    rightPropType={neutralMarkers
      ? "motion_point_inner"
      : propDisplay === "staff"
        ? "staff"
        : "hand"}
    visibilityManagerOverride={visibility}
    hoverHint={interactive ? "badge" : "none"}
    glyphFrame="stage"
    backgroundAlpha={0}
    {interactive}
    {playbackAllowed}
    {singlePlay}
    resumeWhenPlaybackAllowed
    {externalPlaying}
    {externalStep}
    {initialStep}
    {onExternalSeek}
    {playbackGate}
    {onExternalPlayingChange}
    {onStepChange}
    {onSeekRef}
    {onCanvasInitialized}
    {onLoadError}
  />
</div>

<style>
  .motion-player {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: transparent;
  }

  .motion-player.framed {
    border: 1px solid var(--theme-stroke);
    border-radius: var(--radius-lg, 0.75rem);
    background: var(--theme-card-bg);
  }

  .motion-player :global(.inline-animation-player),
  .motion-player :global(.canvas-container) {
    height: 100%;
  }
</style>
