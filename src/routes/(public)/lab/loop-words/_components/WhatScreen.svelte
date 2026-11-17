<!--
  Screen 1: one real LOOP played all the way through, on repeat. The strip
  under it fills in two halves: the steps a person makes, then the same steps
  changed. When it lands on its start, a short "Back where you started".
-->
<script lang="ts">
  import CopyText from "#lib/shared/copy-edit/CopyText.svelte";
  import type { PageCopy } from "#lib/shared/copy-edit/page-copy.svelte";
  import { opaqueFade } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import { LOOP_ICON_COLORS } from "@tka/render-composition";
  import type { LoopExample } from "../_data/loop-words-examples";
  import { through } from "./clock";
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

  const count = $derived(example.sequence.steps.length);
  const at = $derived(through(elapsed, count, still));
  // Each half of the strip fills with its half of the LOOP.
  const firstHalf = $derived(Math.min(1, at.progress * 2));
  const secondHalf = $derived(Math.max(0, at.progress * 2 - 1));
</script>

<section class="screen" style:--rotated-color={LOOP_ICON_COLORS.rotated}>
  <h1><CopyText {copy} key="what-title" /></h1>
  <p class="line"><CopyText {copy} key="what-line" /></p>

  <div class="picture">
    <div class="stage">
      <Player
        sequence={example.sequence}
        step={at.step}
        moving={at.moving}
        label={copy.text["what-title"] ?? ""}
      />
      {#if at.landed}
        <p
          class="landed"
          transition:opaqueFade={{ duration: DURATION.normal }}
        >
          <CopyText {copy} key="what-back" />
        </p>
      {/if}
    </div>

    <div class="strip">
      <div class="half">
        <div class="bar"><span style:--fill={firstHalf}></span></div>
        <p><CopyText {copy} key="what-your-steps" /></p>
      </div>
      <div class="half changed">
        <div class="bar"><span style:--fill={secondHalf}></span></div>
        <p><CopyText {copy} key="what-changed-steps" /></p>
      </div>
    </div>
  </div>

  <p class="small"><CopyText {copy} key="what-small" /></p>
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
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    container-type: size;
  }

  .stage {
    --side: min(100cqw, calc(100cqh - 3.5rem));
    position: relative;
  }

  .landed {
    position: absolute;
    left: 50%;
    bottom: 0.75rem;
    translate: -50% 0;
    margin: 0;
    padding: 0.25rem 0.75rem;
    border-radius: 999px;
    background: var(--theme-panel-bg, rgb(20 22 30 / 0.92));
    border: 1px solid var(--theme-stroke, rgb(255 255 255 / 0.14));
    font-size: var(--font-size-sm);
    white-space: nowrap;
  }

  .strip {
    width: min(100cqw, calc(100cqh - 3.5rem));
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.375rem;
  }

  .half p {
    margin: 0.25rem 0 0;
    font-size: var(--font-size-sm);
    color: var(--theme-text-dim, rgb(255 255 255 / 0.72));
    text-align: center;
    white-space: nowrap;
  }

  .bar {
    height: 0.375rem;
    border-radius: 999px;
    background: var(--theme-stroke, rgb(255 255 255 / 0.14));
    overflow: hidden;
  }

  .bar span {
    display: block;
    height: 100%;
    width: 100%;
    transform-origin: left center;
    transform: scaleX(var(--fill));
    background: var(--theme-text, #fff);
  }

  .changed .bar span {
    background: var(--rotated-color);
  }
</style>
