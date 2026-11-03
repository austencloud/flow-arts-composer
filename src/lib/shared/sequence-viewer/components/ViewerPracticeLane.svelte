<script lang="ts">
  import type {
    PropRenderingProps,
    ViewerPlaybackState,
  } from "../domain/viewer-prop-groups";
  import PracticeLanePane from "./PracticeLanePane.svelte";

  let {
    playback,
    propRendering,
    bpm,
    cellSize,
    running,
    countdown,
    orientation = "horizontal",
    onSeek,
  }: {
    playback: ViewerPlaybackState;
    propRendering: PropRenderingProps;
    bpm: number;
    cellSize: number;
    running: boolean;
    countdown: number;
    /** Vertical on a phone held sideways, where the lane is a narrow column. */
    orientation?: "horizontal" | "vertical";
    onSeek?: (targetStep: number) => void;
  } = $props();

  // The lane stays on the start tile until the canvas actually reaches beat 1.
  // It deliberately does not reset on a loop wrap, where start and end coincide.
  let laneAtStart = $state(true);
  $effect(() => {
    if (countdown > 0) {
      laneAtStart = true;
    } else if (running && playback.currentStep >= 1) {
      laneAtStart = false;
    }
  });
</script>

<div
  class="practice-deck lane"
  class:vertical={orientation === "vertical"}
  class:lane-in={running}
>
  <PracticeLanePane
    sequence={playback.animationState.sequenceData}
    currentStep={playback.currentStep}
    {bpm}
    {cellSize}
    leftPropType={propRendering.leftPropType}
    rightPropType={propRendering.rightPropType}
    onSeek={onSeek ?? null}
    showStartCell={laneAtStart}
    {orientation}
  />
</div>
