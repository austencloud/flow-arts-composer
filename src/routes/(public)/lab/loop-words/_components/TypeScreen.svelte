<!--
  Screens 3 to 8: one LOOP type. Left, step k of the first pass; right, the
  same step as the second pass plays it. Under them the two passes as real
  pictographs, the playing pair ringed. A Rewound second pass plays the
  first backwards, so its row runs in the opposite order and the ring sits
  on the true twin, not the same column.
-->
<script lang="ts">
  import CopyText from "#lib/shared/copy-edit/CopyText.svelte";
  import type { PageCopy } from "#lib/shared/copy-edit/page-copy.svelte";
  import PictographContainer from "#lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
  import { LOOP_ICON_COLORS } from "@tka/render-composition";
  import {
    passSteps,
    twinIndex,
    type LoopExample,
    type TypeKind,
  } from "../_data/loop-words-examples";
  import { stepAt, walk } from "./clock";
  import Player from "./Player.svelte";
  import TypeHeader from "./TypeHeader.svelte";

  let {
    copy,
    kind,
    example,
    elapsed,
    still,
  }: {
    copy: PageCopy;
    kind: TypeKind;
    example: LoopExample;
    elapsed: number;
    still: boolean;
  } = $props();

  const n = $derived(example.seedLength);
  const at = $derived(walk(elapsed, n, still));
  const twin = $derived(twinIndex(example, at.index));
  const first = $derived(passSteps(example, 0));
  const second = $derived(passSteps(example, 1));
  // The column the twin sits in on the lower row.
  const twinColumn = $derived(twin - n);
  const name = $derived(copy.text[`name-${kind}`] ?? kind);
</script>

{#snippet cell(step: StepData, ringed: boolean)}
  <div class="cell" class:ringed>
    <PictographContainer
      pictographData={step}
      ariaLabel={name}
      gridMode={GridMode.DIAMOND}
      showTKA={false}
      showPlacements={false}
      showElemental={false}
      showReversals={false}
      showTnD={false}
      showNonRadialPoints={false}
      darkMode={true}
      transparentBackground={true}
    />
  </div>
{/snippet}

{#snippet firstCaption()}<CopyText {copy} key="type-first" />{/snippet}
{#snippet secondCaption()}<CopyText {copy} key="type-second" />{/snippet}

<section class="screen" style:--type-color={LOOP_ICON_COLORS[kind === "reflected" ? "mirrored" : kind]}>
  <TypeHeader {copy} {kind} />
  <p class="line"><CopyText {copy} key={`line-${kind}`} /></p>

  <div class="picture" style:--n={n}>
    <div class="duo">
      <Player
        sequence={example.sequence}
        step={stepAt(at.index, at.frac)}
        moving={at.moving}
        label={`${name}: first time`}
        caption={firstCaption}
        line={kind === "reflected" ? "north-south" : undefined}
      />
      <Player
        sequence={example.sequence}
        step={stepAt(twin, at.frac)}
        moving={at.moving}
        label={`${name}: second time`}
        caption={secondCaption}
        line={kind === "reflected" ? "north-south" : undefined}
      />
    </div>

    <div class="rows">
      {#each first as step, k (step.id)}
        {@render cell(step, k === at.index)}
      {/each}
      {#each second as step, k (step.id)}
        {@render cell(step, k === twinColumn)}
      {/each}
    </div>
  </div>

  <p class="foot"><CopyText {copy} key="type-foot" /></p>
</section>

<style>
  .screen {
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-height: 0;
  }

  .line {
    margin: 0;
    font-size: var(--font-size-base);
    line-height: 1.35;
  }

  .picture {
    flex: 1 1 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 0.75rem;
    container-type: size;
  }

  /* Two players side by side, as large as the space left after the two
     pictograph rows (cells up to 8rem, or 22% of the height) and the
     captions. What is left over sits evenly above and below. */
  .picture > * {
    --cell: min(calc((100cqw - (var(--n) - 1) * 0.5rem) / var(--n)), 8rem, 22cqh);
  }

  .duo {
    --side: min(
      calc((100cqw - 0.75rem) / 2),
      calc(100cqh - 2 * var(--cell) - 0.5rem - 0.75rem - 1.5rem)
    );
    display: flex;
    justify-content: center;
    gap: 0.75rem;
  }

  .rows {
    display: grid;
    grid-template-columns: repeat(var(--n), var(--cell));
    justify-content: center;
    gap: 0.5rem;
  }

  .cell {
    width: var(--cell);
    aspect-ratio: 1;
    border-radius: var(--radius-md, 0.5rem);
    background: var(--theme-card-bg, rgb(255 255 255 / 0.04));
    outline: 2px solid transparent;
    outline-offset: 1px;
    transition: outline-color var(--duration-normal) var(--ease-standard);
  }

  .cell.ringed {
    outline-color: color-mix(in oklch, var(--type-color), white 30%);
  }

  .foot {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--theme-text-dim, rgb(255 255 255 / 0.72));
    text-align: center;
  }

  @media (prefers-reduced-motion: reduce) {
    .cell {
      transition: none;
    }
  }
</style>
