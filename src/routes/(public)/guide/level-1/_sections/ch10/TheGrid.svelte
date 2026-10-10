<script lang="ts">
  import GuideSection from "../../_components/GuideSection.svelte";
  import LessonGridDisplay from "#lib/shared/pictograph/grid/components/LessonGridDisplay.svelte";
</script>

<GuideSection id="the-grid" title="The Grid">
  <p>
    The Kinetic Alphabet is based on a 4-point grid.
  </p>
  <p>
    There are two 4-point grids: box mode and diamond mode.
    This guide is written in diamond, but everything translates to box.
  </p>

  <div class="grid-pair">
    <figure class="grid-figure">
      <LessonGridDisplay type="diamond" showLabels size="medium" />
      <figcaption>Diamond mode</figcaption>
    </figure>
    <figure class="grid-figure">
      <LessonGridDisplay type="box" showLabels size="medium" />
      <figcaption>Box mode</figcaption>
    </figure>
  </div>

  <p>On this grid, there are three types of points:</p>
  <ul>
    <li><strong>The center point</strong> is the hub that everything revolves around.</li>
    <li><strong>The four hand points</strong> are halfway between the center point and the outer points.</li>
    <li><strong>The outer points</strong> depict the outer edges of the grid.</li>
  </ul>

  <p>
    Together, diamond and box form an 8-point grid.
    We'll use diamond mode to learn each concept.
  </p>

  <div class="grid-merged">
    <LessonGridDisplay type="merged" showLabels size="large" />
  </div>
</GuideSection>

<style>
  .grid-pair {
    display: flex;
    gap: 2rem;
    justify-content: center;
    flex-wrap: wrap;
    margin: 1.5rem 0;
  }

  .grid-figure {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    flex: 1;
    min-width: 200px;
    max-width: 300px;
    margin: 0;
  }

  .grid-figure figcaption {
    font-size: 0.9rem;
    color: var(--theme-text-dim, #666);
    font-weight: 500;
    text-align: center;
  }

  .grid-merged {
    display: flex;
    justify-content: center;
    margin: 1.5rem 0;
    max-width: 380px;
    margin-left: auto;
    margin-right: auto;
  }
</style>
