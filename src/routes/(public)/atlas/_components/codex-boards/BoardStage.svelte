<!--
  Direction C - Index and Stage.

  The rejected board put a 26rem detail panel beside the letters and then
  rendered the detail's variation cells SMALLER than the index cells they came
  from, which makes selecting a letter a downgrade. This fixes that: the index
  is complete - all 47 - and the chosen letter is always on screen beside it at
  several times index size, with no overlay to open and dismiss.

  The index takes the LARGER share on purpose. A first pass gave the stage 78%
  of the band and the index cells measured 46px - a thumbnail nobody can read,
  which is the exact defect this redesign exists to remove. Ten across in 58% of
  the band is legible, packs the 47 into five rows (9+9+10+10+9), and still
  leaves the hero roughly three times any index cell.

  That is the trade: index cells smaller than Atlas's, in exchange for never
  leaving the page to inspect one.
-->
<script lang="ts">
  import CodexFlow from "./CodexFlow.svelte";
  import CodexInspector from "./CodexInspector.svelte";
  import type { CodexLetterInfo } from "./codex-letters";
  import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";

  let {
    onSelect,
    info,
    variations,
    isLoading,
    loadError,
    onRetry,
  }: {
    onSelect: (id: string) => void;
    info: CodexLetterInfo;
    variations: PictographData[];
    isLoading: boolean;
    loadError: boolean;
    onRetry: () => void;
  } = $props();

  let stageEl = $state<HTMLDivElement>();

  /** Stacked layouts put the stage below a full-height index, so a tap on a
   *  letter would otherwise change something the reader cannot see. The host
   *  calls this after a selection; when the two are side by side the stage is
   *  already in view and this is a no-op. */
  export function revealStage(): void {
    if (!stageEl) return;
    if (window.matchMedia("(min-width: 62rem)").matches) return;
    stageEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
</script>

<!-- Outer element is the query container; the split grid is inside it. -->
<div class="board-stage">
  <div class="stage-split">
    <div class="index">
      <CodexFlow {onSelect} />
    </div>

    <div class="stage" bind:this={stageEl}>
      <CodexInspector {info} {variations} {isLoading} {loadError} {onRetry} />
    </div>
  </div>
</div>

<style>
  .board-stage {
    container-type: inline-size;
  }

  .stage-split {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 1.5rem;
    align-items: start;
  }

  /* stretch, not start: the stage panel's content is shorter than five rows of
     index, so a start-aligned panel ends two thirds of the way down and leaves
     a hole beside the last index rows. Stretched, the panel is a full-height
     column and its spare room reads as balanced padding around the hero. */
  @container (min-width: 62rem) {
    .stage-split {
      grid-template-columns: minmax(0, 58fr) minmax(0, 42fr);
      align-items: stretch;
    }
  }

  .index {
    container-type: inline-size;
    min-width: 0;
    --abox-gap: 0.3rem;
    --codex-flow-row-gap: 0.4rem;
    --codex-flow-justify: center;
    --codex-picto-size: calc((100cqi - 3 * var(--abox-gap)) / 6);
  }

  /* Side by side: ten across, five rows, all 47 on the screen with no scroll.
     Whichever binds first - the index column's width, or the five rows' share
     of what is left of the screen below the page chrome (20rem; it was 34rem
     when the drilled view still stacked a back link, an h1, a subtitle and a
     toolbar above the board). At desktop the width term binds either way. */
  @container (min-width: 62rem) {
    .index {
      /* The subtrahend is the gap budget for one row, not a guess at chrome:
         ten cells span three or four boxes, so at most four --abox-gap gaps.
         6.5rem was roughly eight times that and cost the index 90px of width
         it could have spent on the pictographs. */
      --codex-picto-size: clamp(
        3rem,
        min(calc((100cqi - 2rem) / 10), calc((100dvh - 20rem) / 5)),
        9rem
      );
    }
  }
  /* Stacked, the index has the whole band, so it runs wider and shorter. */
  @container (max-width: 61.999rem) {
    .index {
      --codex-picto-size: calc((100cqi - 4 * var(--abox-gap)) / 8);
    }
  }
  @container (max-width: 33.999rem) {
    .index {
      --codex-picto-size: calc((100cqi - 3 * var(--abox-gap)) / 5);
    }
  }

  .stage {
    container-type: inline-size;
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 1.25rem;
    border: 1px solid var(--theme-stroke, oklch(0.42 0.04 270 / 0.22));
    border-radius: 0.9rem;
    background: color-mix(
      in srgb,
      var(--theme-panel-bg, oklch(0.16 0.02 270)) 65%,
      transparent
    );

    /* The hero is capped by whichever runs out first: the panel's own width, or
       the height the screen has left under the page chrome. Without the height
       term a 4K panel gives the hero 750px and pushes the variations off the
       fold; without the width term a narrow panel overflows sideways. The floor
       keeps a 1440x900 laptop's hero meaningfully larger than its index cells.

       The subtrahend is 26rem, not the 40rem this started at: 40rem was
       measured against the old drilled chrome - a back link, an h1, a subtitle
       and a toolbar row that no longer exist. With 234px of that returned to
       the page the old constant left the hero at 400px inside a panel with room
       for 500, and a quarter of the screen empty under the board.

       Eight variation columns, not four: a letter carries 8 or 16 variations,
       so eight lands them in one clean row or two with nothing stranded, and in
       a stacked column that is the row width the panel actually has. */
    --codex-hero-size: clamp(11rem, min(74cqi, calc(100dvh - 26rem)), 46rem);
    --codex-var-cols: 8;
    --codex-var-size: calc((100cqi - 8px) / 8);
    --codex-var-justify: center;
  }

  /* Stacked: the panel is the whole band, so four across keeps each variation
     cell large enough to read on a phone. */
  @container (max-width: 61.999rem) {
    .stage {
      --codex-hero-size: clamp(8rem, 46cqi, 20rem);
      --codex-var-cols: 4;
      --codex-var-size: calc((100cqi - 4px) / 4);
    }
  }
</style>
