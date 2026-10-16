<script lang="ts">
  /**
   * BrowsePreviewCard
   *
   * One sequence card in a Browse home preview: a gallery card in small, its
   * pictograph drawn by Create's preview pictograph (the real
   * PictographContainer with glyphs off) and its word under it when the card
   * has room. Decorative, like every preview scene: no buttons or links. The
   * scene positions it; the card fills the rect it is given.
   */
  import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
  import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
  import MethodPreviewPictograph from "#lib/features/create/shared/components/method-previews/MethodPreviewPictograph.svelte";
  import type { PreviewCard } from "./browse-home-preview-layout";
  import { CARD_PAD } from "./browse-home-preview-layout";

  let {
    card,
    data,
    word = "",
    motionStartData = null,
    motionProgress = null,
    readyEpoch = 0,
    onReady,
  }: {
    card: PreviewCard;
    data: StepData | PictographData | null;
    /** The sequence's display word, already simplified. */
    word?: string;
    motionStartData?: StepData | PictographData | null;
    motionProgress?: number | null;
    readyEpoch?: number;
    onReady?: () => void;
  } = $props();
</script>

<span
  class="card"
  style:width="{card.width}px"
  style:height="{card.height}px"
  style:--pad="{CARD_PAD}px"
>
  <span class="art" style:width="{card.art}px" style:height="{card.art}px">
    <MethodPreviewPictograph
      {data}
      {motionStartData}
      {motionProgress}
      arrowOpacity={motionProgress ?? 1}
      {readyEpoch}
      {onReady}
    />
  </span>
  {#if card.word && word}
    <span
      class="word"
      style:font-size="{Math.max(9, Math.round(card.art * 0.12))}px"
      >{word}</span
    >
  {/if}
</span>

<style>
  .card {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    box-sizing: border-box;
    padding: var(--pad);
    border: 1px solid var(--theme-stroke);
    border-radius: 8px;
    background: var(--theme-card-bg);
    overflow: hidden;
  }

  .art {
    display: block;
    flex: 0 0 auto;
    border-radius: 5px;
    overflow: hidden;
  }

  .word {
    flex: 1 1 auto;
    display: grid;
    place-items: center;
    max-width: 100%;
    color: var(--theme-text);
    font-weight: 680;
    line-height: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
