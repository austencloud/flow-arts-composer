<!--
  One CombinationResult, rendered as a header plus the sequence itself.

  The strip is the point: block PROVENANCE is what a combination result is
  about, so every cell carries the colour of the source it came from (card A,
  card B, ambient bridge) and the first cell of each block carries a heavier
  edge. `sequence.steps` is exactly the concatenation of `blocks[].steps` in
  order (splice-builder flattens them and renumbers), so cumulative block
  lengths are a sound index into the rendered steps.

  Cell geometry is fixed and the row's height is reserved, because pictographs
  prepare asynchronously — a strip that grew as they arrived would shove every
  result below it (`no-layout-shift.md`).
-->
<script lang="ts">
  import type {
    CombinationResult,
    VariantDescriptor,
    WalkBlock,
  } from "$lib/shared/combination/domain/types";
  import { simplifyRepeatedWord } from "$lib/shared/foundation/utils/word-simplifier";
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";

  interface Props {
    result: CombinationResult;
    rank: number;
  }

  let { result, rank }: Props = $props();

  const word = $derived(simplifyRepeatedWord(result.sequence.word ?? ""));
  const stepCount = $derived(result.sequence.steps.length);

  /** Per-step provenance, by walking the block lengths. */
  const cells = $derived.by(() => {
    const out: {
      step: (typeof result.sequence.steps)[number];
      kind: WalkBlock["kind"];
      sourceId: string;
      blockStart: boolean;
    }[] = [];
    let index = 0;
    for (const block of result.blocks) {
      for (let i = 0; i < block.steps.length; i++) {
        const step = result.sequence.steps[index];
        index++;
        if (!step) break;
        out.push({
          step,
          kind: block.kind,
          sourceId: block.sourceId,
          blockStart: i === 0,
        });
      }
    }
    return out;
  });

  function describeVariant(variant: VariantDescriptor): string {
    const parts: string[] = [];
    if (variant.rotation !== 0) parts.push(`r${variant.rotation}`);
    if (variant.mirrored) parts.push("mirror");
    if (variant.handsSwapped) parts.push("swap");
    if (variant.rotationFaithful) parts.push("twin");
    return parts.length > 0 ? parts.join("+") : "identity";
  }

  const variantSummary = $derived(
    result.variantsB.map(describeVariant).join(", ")
  );

  const sharePercent = (share: number) => `${Math.round(share * 100)}%`;
</script>

<article class="result">
  <header class="head">
    <span class="rank">{rank}</span>
    <span class="verdict verdict-{result.verdict.toLowerCase()}"
      >{result.verdict}</span
    >
    <span class="word">{word}</span>
    <span class="derivation">{result.derivation}</span>

    <span class="spacer"></span>

    <span class="meta" title="steps in the combination">{stepCount} steps</span>
    <span class="meta" title="card A share / card B share"
      >{sharePercent(result.cardAShare)} A · {sharePercent(result.cardBShare)} B</span
    >
    {#if result.sequence.period !== undefined}
      <span
        class="meta"
        title="orientation period — passes before the loop closes"
        >period {result.sequence.period}</span
      >
    {/if}
    {#if result.sequence.isCircular}
      <span class="badge circular" title="closes seamlessly in one pass"
        >seamless</span
      >
    {/if}
    {#if result.variantsB.length > 0}
      <span class="badge variant" title="card-B variants this result draws on"
        >B: {variantSummary}</span
      >
    {/if}
    {#if result.rotationFaithfulBlocks > 0}
      <span
        class="badge twin"
        title="blocks taken from a rotation-faithful twin (traversed backwards, prop rotation preserved)"
        >{result.rotationFaithfulBlocks} twin</span
      >
    {/if}
    {#each result.ambientWords as ambientWord (ambientWord)}
      <span class="badge ambient" title="ambient bridge material"
        >{ambientWord}</span
      >
    {/each}
  </header>

  <div class="strip" role="list" aria-label="Steps of {word}">
    <!-- Keyed on POSITION as well as id. Step ids reaching here are derived
         from pasted card material, which may carry duplicates. -->
    {#each cells as cell, i (`${cell.step.id ?? "s"}-${i}`)}
      <div
        class="cell kind-{cell.kind}"
        class:block-start={cell.blockStart}
        role="listitem"
        title="{cell.sourceId} · {cell.step.letter ?? '?'} {cell.step
          .startPlacement}>{cell.step.endPlacement}"
      >
        <div class="picto">
          <PictographContainer pictographData={cell.step} />
        </div>
        <span class="step-no">{i + 1}</span>
      </div>
    {/each}
  </div>
</article>

<style>
  .result {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.75rem;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 0.75rem;
    background: rgba(255, 255, 255, 0.03);
  }

  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    min-height: 2rem;
  }

  .spacer {
    flex: 1 1 auto;
  }

  .rank {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.75rem;
    height: 1.75rem;
    padding: 0 0.35rem;
    border-radius: 0.5rem;
    background: rgba(255, 255, 255, 0.06);
    color: rgba(255, 255, 255, 0.55);
    font-size: 0.8rem;
    font-variant-numeric: tabular-nums;
  }

  .verdict {
    padding: 0.2rem 0.55rem;
    border-radius: 0.4rem;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.06em;
  }
  .verdict-sequential {
    background: rgba(148, 163, 184, 0.18);
    color: #cbd5e1;
  }
  .verdict-fused {
    background: rgba(96, 165, 250, 0.18);
    color: #93c5fd;
  }
  .verdict-braided {
    background: rgba(167, 139, 250, 0.2);
    color: #c4b5fd;
  }
  .verdict-hybrid {
    background: rgba(52, 211, 153, 0.18);
    color: #6ee7b7;
  }

  .word {
    font-size: 1.05rem;
    font-weight: 700;
    color: #fff;
  }

  .derivation {
    font-size: 0.8rem;
    color: rgba(255, 255, 255, 0.55);
  }

  .meta {
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.45);
    font-variant-numeric: tabular-nums;
  }

  .badge {
    padding: 0.15rem 0.45rem;
    border-radius: 0.7rem;
    font-size: 0.7rem;
    font-weight: 600;
  }
  .badge.circular {
    background: rgba(52, 211, 153, 0.16);
    color: #6ee7b7;
  }
  .badge.variant {
    background: rgba(248, 113, 113, 0.16);
    color: #fca5a5;
  }
  .badge.twin {
    background: rgba(251, 191, 36, 0.16);
    color: #fcd34d;
  }
  .badge.ambient {
    background: rgba(167, 139, 250, 0.16);
    color: #c4b5fd;
  }

  /* Reserved: cell (9rem) + its border + the step number row. Pictographs
     prepare async; the row must be its final height from first paint. */
  .strip {
    display: flex;
    gap: 0.35rem;
    height: 10.75rem;
    padding-bottom: 0.35rem;
    overflow-x: auto;
    overflow-y: hidden;
  }

  .cell {
    position: relative;
    flex: 0 0 auto;
    width: 9rem;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    border-left: 3px solid transparent;
    padding-left: 0.25rem;
  }
  .cell.kind-cardA {
    border-left-color: rgba(96, 165, 250, 0.35);
  }
  .cell.kind-cardB {
    border-left-color: rgba(248, 113, 113, 0.35);
  }
  .cell.kind-ambient {
    border-left-color: rgba(167, 139, 250, 0.35);
  }
  .cell.block-start.kind-cardA {
    border-left-color: #60a5fa;
  }
  .cell.block-start.kind-cardB {
    border-left-color: #f87171;
  }
  .cell.block-start.kind-ambient {
    border-left-color: #a78bfa;
  }

  .picto {
    width: 100%;
    aspect-ratio: 1;
    background: #fff;
    border-radius: 0.4rem;
    overflow: hidden;
  }

  .step-no {
    font-size: 0.7rem;
    color: rgba(255, 255, 255, 0.35);
    font-variant-numeric: tabular-nums;
    text-align: center;
  }
</style>
