<script lang="ts">
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import InlineAnimationPlayer from "$lib/features/browse/sequences/display/components/media-viewer/InlineAnimationPlayer.svelte";
  import StepStrip from "$lib/shared/timeline/StepStrip.svelte";

  let {
    sequence,
    active,
    run,
    onready,
    onStepChange,
  }: {
    sequence: SequenceData;
    active: boolean;
    /** Advances for every explicit Play so a retained engine restarts cleanly. */
    run: number;
    onready: (run: number) => void;
    onStepChange?: (step: number) => void;
  } = $props();

  let currentStep = $state(0);
  let seek: ((step: number) => void) | null = null;
</script>

<div class="workspace-playback" data-testid="workspace-playback">
  <div class="playback-layout">
    <div class="playback-media">
      <div class="player-stage">
        <InlineAnimationPlayer
          {sequence}
          sequenceLoadKey={`${sequence.id}:${run}`}
          chrome="minimal"
          fill
          scrubbable
          autoPlay={active}
          autoPlayDelay={0}
          playbackAllowed={active}
          resumeWhenPlaybackAllowed
          onCanvasInitialized={() => onready(run)}
          onReady={() => onready(run)}
          onLoadError={() => onready(run)}
          onStepChange={(step) => {
            currentStep = step;
            onStepChange?.(step);
          }}
          onSeekRef={(callback) => (seek = callback)}
        />
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
    --sequence-seek-target-size: 32px;
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
    width: 100%;
    height: calc(100% - var(--notation-height));
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
