<!--
  The Chirality part of the Buugeng panel (2026-10-15). The Change Prop
  picker's "What's this?" chip lands here (#buugeng-chirality).

  The four tiles are the same pairs the picker offers, drawn the same way, and
  picking one plays the page's demo with that pair. The pick is page-local: it
  never writes the visitor's own prop settings. It starts on both A, the app's
  default.
-->
<script lang="ts">
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import BuugengPairPreview from "#lib/shared/settings/components/tabs/prop-type/BuugengPairPreview.svelte";
  import {
    BUUGENG_PAIRS,
    buugengPair,
    buugengPairFor,
    chiralityLetter,
    type BuugengPair,
    type BuugengPairId,
  } from "#lib/shared/settings/components/tabs/prop-type/buugeng-pair";

  let {
    leftFlipped,
    rightFlipped,
    onchange,
  }: {
    leftFlipped: boolean;
    rightFlipped: boolean;
    onchange: (leftFlipped: boolean, rightFlipped: boolean) => void;
  } = $props();

  function name(pair: BuugengPair): string {
    return pair.kind === "mirrored" ? "Mirrored" : "Matching";
  }

  function letters(pair: BuugengPair): string {
    return pair.kind === "mirrored"
      ? `Left ${chiralityLetter(pair.leftFlipped)}, right ${chiralityLetter(pair.rightFlipped)}`
      : `Both ${chiralityLetter(pair.leftFlipped)}`;
  }

  const options = BUUGENG_PAIRS.map((pair) => ({
    value: pair.id,
    label: `${name(pair)}, ${letters(pair)}`,
  }));

  const value = $derived(buugengPairFor(leftFlipped, rightFlipped).id);

  function choose(id: BuugengPairId) {
    const pair = buugengPair(id);
    onchange(pair.leftFlipped, pair.rightFlipped);
  }
</script>

<div class="chirality" id="buugeng-chirality">
  <h3>Chirality</h3>
  <p>
    A buugeng is an S, and an S has a handedness: its mirror is a different
    shape. The notation calls the drawn shape A and its mirror B, and each hand
    holds one or the other. When both hands meet at the same point, the pair
    decides what you see. A mirrored pair, one A and one B, stacks into a
    single figure eight. A matching pair, both A or both B, cannot stack, so
    the notation sets the props side by side. In Flow Arts Composer you set this under
    Buugeng pair when you change props. Pick a pair to play it in the demo.
  </p>
  <SegmentedControl
    {options}
    {value}
    onchange={choose}
    color="accent"
    columns={4}
    semantics="radiogroup"
    ariaLabel="Buugeng pair"
  >
    {#snippet optionContent(id: BuugengPairId)}
      {@const pair = buugengPair(id)}
      <span class="pair-tile">
        <BuugengPairPreview
          propType={PropType.BUUGENG}
          leftFlipped={pair.leftFlipped}
          rightFlipped={pair.rightFlipped}
        />
        <span class="pair-name">{name(pair)}</span>
        <span class="pair-letters">{letters(pair)}</span>
      </span>
    {/snippet}
  </SegmentedControl>
</div>

<style>
  .chirality {
    margin-top: 1.75rem;
    scroll-margin-top: 6rem;
  }
  .chirality h3 {
    margin: 0 0 0.5rem;
  }
  .chirality :global(.segment-label) {
    display: block;
    width: 100%;
    min-width: 0;
  }
  .pair-tile {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.3rem;
    width: 100%;
    padding: 0.3rem 0;
  }
  .pair-tile :global(.pair-crop) {
    max-width: 8rem;
  }
  .pair-name {
    font-weight: 700;
    line-height: 1.2;
  }
  .pair-letters {
    font-size: 0.8rem;
    line-height: 1.2;
    opacity: 0.75;
    white-space: normal;
    text-align: center;
  }
</style>
