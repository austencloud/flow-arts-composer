<script lang="ts">
  import LessonStageHeading from "../LessonStageHeading.svelte";
  import type {
    GridPhase,
    PointTypePhase,
  } from "./grid-experience-state.svelte";

  let { step, gridPhase, pointTypePhase } = $props<{
    step: number;
    gridPhase: GridPhase;
    pointTypePhase: PointTypePhase;
  }>();

  const copyKey = $derived(`${step}-${gridPhase}-${pointTypePhase}`);
  const title = $derived.by(() => {
    if (step === 0) return "The Grid";
    if (step === 1) {
      if (gridPhase === "split") return "Two Grid Modes";
      if (gridPhase === "diamond-labels") return "Diamond Mode";
      if (gridPhase === "box-labels") return "Box Mode";
      return "The 8-Point Grid";
    }
    if (pointTypePhase === "center") return "The Center Point";
    if (pointTypePhase === "hand") return "Hand Points";
    return "Outer Points";
  });
</script>

<LessonStageHeading key={copyKey} {title}>
  <p>
    {#if step === 0}
      The Kinetic Alphabet is based on a <strong>4-point grid</strong>.
    {:else if step === 1}
      {#if gridPhase === "split"}
        There are two types of grids: <strong>Diamond</strong> and
        <strong>Box</strong>.
      {:else if gridPhase === "diamond-labels"}
        <strong>Diamond</strong> points are labeled with cardinal directions.
      {:else if gridPhase === "box-labels"}
        <strong>Box</strong> points are labeled with intercardinal directions.
      {:else}
        <strong>Diamond + Box</strong> together create the full 8-point grid.
      {/if}
    {:else if pointTypePhase === "center"}
      The <strong>center point</strong> is the hub of all movement.
    {:else if pointTypePhase === "hand"}
      <strong>Hand points</strong> are halfway between center and outer.
    {:else}
      <strong>Outer points</strong> define the grid's boundary.
    {/if}
  </p>

  {#if step === 1 && gridPhase === "merged"}
    <p class="secondary">We'll use this grid to learn hand placements.</p>
  {/if}
</LessonStageHeading>

<style>
  .secondary {
    margin-top: 0.2rem;
    color: var(--theme-text-dim);
    font-size: 0.9em;
  }
</style>
