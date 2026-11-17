<!--
  Screen 2: one step and that same step under each of the five changes, in a
  three by two grid with the step in the first cell, all playing together. The twins come from Create's own
  transforms; until they are ready their squares hold their places.
-->
<script lang="ts">
  import CopyText from "#lib/shared/copy-edit/CopyText.svelte";
  import type { PageCopy } from "#lib/shared/copy-edit/page-copy.svelte";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import { TYPE_ORDER, type TypeKind } from "../_data/loop-words-examples";
  import { stepAt, walk } from "./clock";
  import Player from "./Player.svelte";

  let {
    copy,
    base,
    twins,
    elapsed,
    still,
  }: {
    copy: PageCopy;
    base: SequenceData;
    twins: Record<TypeKind, SequenceData> | null;
    elapsed: number;
    still: boolean;
  } = $props();

  const at = $derived(walk(elapsed, 1, still));
  const step = $derived(stepAt(0, at.frac));
</script>

{#snippet stepCaption()}<CopyText {copy} key="five-step" />{/snippet}

<section class="screen">
  <h1><CopyText {copy} key="five-title" /></h1>
  <p class="line"><CopyText {copy} key="five-line" /></p>

  <div class="picture">
    <div class="grid">
      <div class="original">
        <Player
          sequence={base}
          {step}
          moving={at.moving}
          label={copy.text["five-step"] ?? ""}
          caption={stepCaption}
        />
      </div>
      {#each TYPE_ORDER as kind (kind)}
        {#snippet caption()}<CopyText {copy} key={`name-${kind}`} />{/snippet}
        <Player
          sequence={twins?.[kind] ?? null}
          {step}
          moving={at.moving}
          label={copy.text[`name-${kind}`] ?? kind}
          {caption}
        />
      {/each}
    </div>
  </div>
</section>

<style>
  .screen {
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-height: 0;
  }

  h1 {
    margin: 0;
    font-size: var(--font-size-xl);
    font-weight: 700;
    line-height: 1.2;
  }

  .line {
    margin: 0;
    font-size: var(--font-size-base);
    line-height: 1.35;
  }

  /* Three across, two down, as large as the space allows. Captions take
     about 1.5rem under each square. */
  .picture {
    flex: 1 1 0;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    container-type: size;
  }

  .grid {
    --side: min(
      calc((100cqw - 2 * 0.625rem) / 3),
      calc((100cqh - 0.875rem - 2 * 1.5rem) / 2)
    );
    display: grid;
    grid-template-columns: repeat(3, var(--side));
    gap: 0.875rem 0.625rem;
  }

  /* The step itself reads as the source: a brighter frame. */
  .original :global(.square) {
    border-color: var(--theme-text, #fff);
  }

  .original :global(figcaption) {
    color: var(--theme-text, #fff);
    font-weight: 600;
  }
</style>
