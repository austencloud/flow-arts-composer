<!--
  Screen 9: a Rotated LOOP that turns a quarter each time. Four players, one
  per time through, each on the same step a quarter turn further on.
-->
<script lang="ts">
  import CopyText from "#lib/shared/copy-edit/CopyText.svelte";
  import type { PageCopy } from "#lib/shared/copy-edit/page-copy.svelte";
  import { twinIndex, type LoopExample } from "../_data/loop-words-examples";
  import { stepAt, walk } from "./clock";
  import Player from "./Player.svelte";

  let {
    copy,
    example,
    elapsed,
    still,
  }: {
    copy: PageCopy;
    example: LoopExample;
    elapsed: number;
    still: boolean;
  } = $props();

  const at = $derived(walk(elapsed, example.seedLength, still));
  const PASSES = [0, 1, 2, 3] as const;
</script>

<section class="screen">
  <h1><CopyText {copy} key="times-title" /></h1>
  <p class="line"><CopyText {copy} key="times-line" /></p>

  <div class="picture">
    <div class="grid">
      {#each PASSES as pass (pass)}
        {#snippet caption()}<CopyText {copy} key={`times-${pass + 1}`} />{/snippet}
        <Player
          sequence={example.sequence}
          step={stepAt(twinIndex(example, at.index, pass), at.frac)}
          moving={at.moving}
          label={copy.text[`times-${pass + 1}`] ?? ""}
          {caption}
        />
      {/each}
    </div>
  </div>

  <p class="small"><CopyText {copy} key="times-small" /></p>
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

  .small {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--theme-text-dim, rgb(255 255 255 / 0.72));
  }

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
      calc((100cqw - 0.75rem) / 2),
      calc((100cqh - 0.75rem - 2 * 1.5rem) / 2)
    );
    display: grid;
    grid-template-columns: repeat(2, var(--side));
    gap: 0.75rem;
  }
</style>
