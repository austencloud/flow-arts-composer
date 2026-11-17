<!--
  Screen 10: the words on one card. The sentence from screen 1, then each
  type's icon, name and line beside a small player of screen 2's step under
  that type's change, all in step.
-->
<script lang="ts">
  import CopyText from "#lib/shared/copy-edit/CopyText.svelte";
  import type { PageCopy } from "#lib/shared/copy-edit/page-copy.svelte";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import { TYPE_ORDER, type TypeKind } from "../_data/loop-words-examples";
  import { stepAt, walk } from "./clock";
  import Player from "./Player.svelte";
  import TypeHeader from "./TypeHeader.svelte";

  let {
    copy,
    twins,
    elapsed,
    still,
  }: {
    copy: PageCopy;
    twins: Record<TypeKind, SequenceData> | null;
    elapsed: number;
    still: boolean;
  } = $props();

  const at = $derived(walk(elapsed, 1, still));
  const step = $derived(stepAt(0, at.frac));
</script>

<section class="screen">
  <h1><CopyText {copy} key="words-title" /></h1>
  <p class="line"><CopyText {copy} key="what-line" /></p>

  <ul class="list">
    {#each TYPE_ORDER as kind (kind)}
      <li>
        <div class="words">
          <TypeHeader {copy} {kind} size={14} level={0} />
          <p><CopyText {copy} key={`line-${kind}`} /></p>
        </div>
        <Player
          sequence={twins?.[kind] ?? null}
          {step}
          moving={at.moving}
          label={copy.text[`name-${kind}`] ?? kind}
        />
      </li>
    {/each}
  </ul>
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

  .list {
    flex: 1 1 0;
    min-height: 0;
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    grid-template-rows: repeat(5, minmax(0, 1fr));
    gap: 0.375rem;
    container-type: size;
  }

  li {
    --side: min(calc((100cqh - 4 * 0.375rem) / 5 - 0.375rem), 6rem);
    display: grid;
    grid-template-columns: minmax(0, 1fr) var(--side);
    align-items: center;
    gap: 0.75rem;
    min-height: 0;
    padding-block-end: 0.375rem;
    border-bottom: 1px solid var(--theme-stroke, rgb(255 255 255 / 0.1));
  }

  li:last-child {
    border-bottom: 0;
    padding-block-end: 0;
  }

  .words {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
  }

  .words p {
    margin: 0;
    font-size: var(--font-size-sm);
    line-height: 1.3;
    color: var(--theme-text-dim, rgb(255 255 255 / 0.8));
  }
</style>
