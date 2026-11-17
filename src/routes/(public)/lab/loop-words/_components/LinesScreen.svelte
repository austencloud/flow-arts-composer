<!--
  Screen 5: the four lines a Reflected LOOP can reflect across. The same step
  reflected across each line, in sync, the line drawn over its player.
-->
<script lang="ts">
  import CopyText from "#lib/shared/copy-edit/CopyText.svelte";
  import type { PageCopy } from "#lib/shared/copy-edit/page-copy.svelte";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import { REFLECTION_AXES, type ReflectionLine } from "../_data/loop-words-examples";
  import { stepAt, walk } from "./clock";
  import Player from "./Player.svelte";

  let {
    copy,
    lines,
    elapsed,
    still,
  }: {
    copy: PageCopy;
    lines: Record<ReflectionLine, SequenceData> | null;
    elapsed: number;
    still: boolean;
  } = $props();

  const CAPTION_KEY: Record<ReflectionLine, string> = {
    "north-south": "lines-left-right",
    "east-west": "lines-top-bottom",
    "northeast-southwest": "lines-diagonal",
    "northwest-southeast": "lines-diagonal",
  };

  const at = $derived(walk(elapsed, 1, still));
  const step = $derived(stepAt(0, at.frac));
</script>

<section class="screen">
  <h1><CopyText {copy} key="lines-title" /></h1>
  <p class="line"><CopyText {copy} key="lines-line" /></p>

  <div class="picture">
    <div class="grid">
      {#each REFLECTION_AXES as axis (axis)}
        {#snippet caption()}<CopyText {copy} key={CAPTION_KEY[axis]} />{/snippet}
        <Player
          sequence={lines?.[axis] ?? null}
          {step}
          moving={at.moving}
          label={copy.text[CAPTION_KEY[axis]] ?? ""}
          line={axis}
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
