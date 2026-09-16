<!--
  SpinnerStepLane.svelte

  The read-ahead lane for the spinner stage: the shared StepStrip carousel,
  sized to HUG its cells.

  Why this exists instead of PracticeLanePane (the other StepStrip wrapper):
  PracticeLanePane pins `fillHeight` on at `(min-width: 768px), (orientation:
  landscape)` — Practice mode's split seam. In fillHeight mode StepStrip caps
  its focus cell at HALF the container height, which is right for a tall
  practice column but means the lane box is always twice its visible band. On
  this page every desktop and landscape viewport hit that branch, so the lane
  read as a filmstrip stranded in an empty box no matter what height it was
  given. Driving cellSize explicitly (fillHeight off) makes the strip report its
  own hugging height instead, which is what lets the stage compose tightly.

  Pure view, same as its sibling: notation cells in, seek callback out. No
  playback ownership.
-->
<script lang="ts">
  import StepStrip from "$lib/shared/timeline/StepStrip.svelte";
  import { buildNotationCells } from "$lib/shared/timeline/notation-cell";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

  let {
    sequence,
    currentStep,
    bpm,
    cellSize,
    orientation = "horizontal",
    anchor = "start",
    onSeek = null,
  }: {
    sequence: SequenceData | null | undefined;
    /** Float step from playback (integer step + fractional progress). */
    currentStep: number;
    bpm: number;
    /** Cell width/height in px. The lane's height follows from it. Ignored in
     *  vertical mode, where StepStrip derives the cell from its container. */
    cellSize: number;
    /** Vertical fills a tall column beside the stage (side-by-side tiers);
     *  horizontal is the foot under a stacked canvas. */
    orientation?: "horizontal" | "vertical";
    /** Where the focus cell sits. The stacked foot centers it under the
     *  canvas (the playing step lives directly beneath the stage); the
     *  vertical rail keeps it near the top. */
    anchor?: "start" | "center";
    /** Jump playback to a step (0 = start position, 1..N = steps). */
    onSeek?: ((stepNumber: number) => void) | null;
  } = $props();

  // StepStrip only honours `height: 100%` for its viewport when fillHeight is
  // set, and the vertical rail must fill its column — so the flag tracks the
  // orientation rather than being a caller choice. Horizontal stays off, which
  // is the whole point of this wrapper (see the header comment).
  const fillHeight = $derived(orientation === "vertical");

  // The spinner loops forever, so the start-placement cell is dropped: its pose
  // equals the sequence's end and the lane shouldn't travel back through it on
  // every repeat. currentStep is shifted −1 so step k focuses its own cell.
  const cells = $derived(
    buildNotationCells(sequence).filter((cell) => !cell.isStart)
  );
  const shiftedStep = $derived((currentStep ?? 0) - 1);
</script>

<div class="spinner-lane" class:vertical={orientation === "vertical"}>
  <StepStrip
    {cells}
    currentStep={shiftedStep}
    {bpm}
    {cellSize}
    {orientation}
    {fillHeight}
    stepPulse={true}
    onCellClick={onSeek}
    {anchor}
    loop={true}
  />
</div>

<style>
  /* Horizontal is content-sized: the strip reports its own height (focus frame
     + headroom) and the page's pane matches it, so nothing stretches. */
  .spinner-lane {
    width: 100%;
    min-width: 0;
  }

  .spinner-lane.vertical {
    height: 100%;
    min-height: 0;
  }
</style>
