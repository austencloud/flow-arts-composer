<!--
  The Buugeng pairs part of the Buugeng panel (2026-10-15; app words 2026-11-15). The Change Prop
  picker's "What's this?" chip lands here (#buugeng-chirality).

  The four tiles are the same pairs the picker offers, drawn the same way, and
  picking one plays the page's demo with that pair. The pick is page-local: it
  never writes the visitor's own prop settings. It starts on both A, the app's
  default.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import BuugengPairPreview from "#lib/shared/settings/components/tabs/prop-type/BuugengPairPreview.svelte";
  import {
    BUUGENG_PAIRS,
    buugengPair,
    buugengPairFor,
    type BuugengPairId,
  } from "#lib/shared/settings/components/tabs/prop-type/buugeng-pair.js";
  import {
    buugengPairLetters,
    buugengPairName,
    buugengPairWords,
  } from "#lib/shared/settings/components/tabs/prop-type/buugeng-pair-words.js";

  let {
    leftFlipped,
    rightFlipped,
    onchange,
  }: {
    leftFlipped: boolean;
    rightFlipped: boolean;
    onchange: (leftFlipped: boolean, rightFlipped: boolean) => void;
  } = $props();

  const options = $derived(
    BUUGENG_PAIRS.map((pair) => ({
      value: pair.id,
      label: buugengPairWords(pair),
    })),
  );

  const value = $derived(buugengPairFor(leftFlipped, rightFlipped).id);

  function choose(id: BuugengPairId) {
    const pair = buugengPair(id);
    onchange(pair.leftFlipped, pair.rightFlipped);
  }
</script>

<div class="chirality" id="buugeng-chirality">
  <h3>{t("settings_buugeng_pairs_title")}</h3>
  <p>
    {t("settings_buugeng_pairs_explain")}
    {t("settings_buugeng_pairs_pick")}
  </p>
  <SegmentedControl
    {options}
    {value}
    onchange={choose}
    color="accent"
    columns={4}
    semantics="radiogroup"
    ariaLabel={t("settings_buugeng_pair")}
  >
    {#snippet optionContent(id: BuugengPairId)}
      {@const pair = buugengPair(id)}
      <span class="pair-tile">
        <BuugengPairPreview
          propType={PropType.BUUGENG}
          leftFlipped={pair.leftFlipped}
          rightFlipped={pair.rightFlipped}
        />
        <span class="pair-name">{buugengPairName(pair)}</span>
        <span class="pair-letters">{buugengPairLetters(pair)}</span>
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
