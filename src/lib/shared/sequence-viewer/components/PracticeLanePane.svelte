<!--
  PracticeLanePane.svelte

  The read-ahead lane shown in place of the side-by-side preview during focused
  practice. Pure wrapper: derives cells from the sequence and renders the shared
  StepStrip with prefs-driven zoom + step-pulse + tap-to-seek. No playback ownership
  (the viewer orchestrator owns currentStep/bpm and the seek).
-->
<script lang="ts">
  import StepStrip from "$lib/shared/timeline/StepStrip.svelte";
  import { buildNotationCells } from "$lib/shared/timeline/notation-cell";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

  let {
    sequence,
    currentStep,
    bpm,
    cellSize,
    leftPropType = null,
    rightPropType = null,
    onSeek = null,
    showStartCell = false,
  }: {
    sequence: SequenceData | null | undefined;
    /** Float step from playback (integer step + fractional progress). */
    currentStep: number;
    bpm: number;
    cellSize: number;
    leftPropType?: PropType | null;
    rightPropType?: PropType | null;
    /** Jump playback to a step (0 = start position, 1..N = steps). */
    onSeek?: ((stepNumber: number) => void) | null;
    /** Pre-roll count-in: include + focus the start-placement tile so the lane
     *  matches the start pose parked on the canvas. Off during the running loop. */
    showStartCell?: boolean;
  } = $props();

  // Practice loops continuously, so during the running loop we drop the
  // start-placement cell: its pose equals the sequence's end, and the lane
  // shouldn't travel back through it each loop. Steps only, cycled; currentStep
  // is shifted −1 so step k focuses its own cell.
  //
  // Exception — the pre-roll count-in (showStartCell): the canvas is parked at
  // the start pose, so the lane shows the start tile focused to match. Step 1
  // would show its props at the END of the step, a different place. No −1 shift
  // then, so step 0 focuses the start cell at index 0.
  const cells = $derived(
    showStartCell
      ? buildNotationCells(sequence)
      : buildNotationCells(sequence).filter((c) => !c.isStart)
  );
  const shiftedStep = $derived(showStartCell ? (currentStep ?? 0) : (currentStep ?? 0) - 1);

  // Wide aspect → side-by-side tall column → fill its height with a big focus
  // pictograph (a fixed px reads tiny on a large monitor). Portrait foot keeps
  // the fixed cellSize. Matches the ViewerSplitPane side-by-side breakpoint.
  let wide = $state(false);
  $effect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(min-width: 768px), (orientation: landscape)");
    wide = mq.matches;
    const on = () => (wide = mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  });

  // Defer the read-ahead strip's pictograph render until after the enter slide
  // settles. The lane is parked off-screen during setup, so rendering all its
  // cells up front only blocks the enter transition (measured ~116ms). 360ms is
  // past the 300ms deck slide and well before a user finishes the setup screen,
  // so the strip is populated by the time they hit Start.
  let laneReady = $state(false);
  $effect(() => {
    const id = setTimeout(() => (laneReady = true), 360);
    return () => clearTimeout(id);
  });
</script>

<div class="practice-lane">
  {#if laneReady}
    <StepStrip
      {cells}
      currentStep={shiftedStep}
      {bpm}
      {cellSize}
      {leftPropType}
      {rightPropType}
      stepPulse={true}
      onCellClick={onSeek}
      anchor="start"
      fillHeight={wide}
      loop={true}
    />
  {/if}
</div>

<style>
  /* height:100% serves both layouts via the parent grid row:
       - foot (portrait, `auto` row): the row is content-sized, so 100% resolves
         to `auto` → the strip's intrinsic height; the carousel sits as a foot.
       - side-by-side (wide, `1fr` row): the row is definite, so 100% fills the
         tall column and the carousel centres vertically in it.
     Vertical padding gives breathing room; border-box keeps it inside the fill. */
  .practice-lane {
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: center;
    padding-block: 16px;
    overflow: hidden;
    background: rgba(0, 0, 0, 0.25);
  }
</style>
