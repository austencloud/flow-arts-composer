<!--
  The art inside any storefront art box — the catalog front door's tiles, its
  hero, and the cross-sell rail on every product page all render through this
  one component, so an entry looks the same wherever it appears: a fan of real
  printed card fronts, the printed guide's real cover, or the product's cover
  image.

  The fan and the book cover both pull in the print pipeline, which is browser
  work (canvas, workers, Firebase). /shop renders on the server for crawlers, so
  those two load through a browser-gated dynamic import and the server sends the
  text and the reserved box. The box is sized by the host, so art landing late
  moves nothing.
-->
<script lang="ts">
  import { browser } from "$app/environment";
  import { onMount } from "svelte";
  import { runAfterNamedRouteMorphIdle } from "$lib/shared/transitions/named-route-morph-state.svelte";
  import type { CoverCard, Product } from "../domain/models/product";

  interface Props {
    /** Real printed card fronts to fan. Empty falls through to the cover image. */
    cards: readonly CoverCard[];
    product: Product;
    /** QR attribution, same as the print path. */
    deckName: string;
    /** Minimum rest width of one card, px. */
    cardWidth?: number;
    maxCardWidth?: number;
    maxCards?: number;
    /** Show exactly this many cards regardless of width (1 = a single card). */
    exactCount?: number;
    freshFront?: boolean;
    qrUrl?: string;
    onCoverResolved?: (card: CoverCard, url: string) => void;
    /** How wide the printed guide's cover renders. Hosts whose art box is
     *  short and wide pass a height-aware value so the cover isn't cropped. */
    bookWidth?: string;
  }

  let {
    cards,
    product,
    deckName,
    cardWidth = 88,
    maxCardWidth = 150,
    maxCards = 5,
    exactCount,
    freshFront = false,
    qrUrl,
    onCoverResolved,
    bookWidth = "clamp(6rem, 42%, 11rem)",
  }: Props = $props();

  // The launchpad's Choreo Cards tile morphs into this page, and the print
  // pipeline (canvas + workers) is exactly the work that stutters a morph's
  // final frame. Hold it until the transition and one idle turn have cleared.
  // Until then the page renders what the server sent, so nothing moves.
  let artReady = $state(false);
  onMount(() => runAfterNamedRouteMorphIdle(() => (artReady = true)));
  const ready = $derived(browser && artReady);
</script>

{#if cards.length && ready}
  {#await import("./DeckFanCover.svelte") then { default: DeckFanCover }}
    <DeckFanCover
      {cards}
      deckId={product.deckId}
      {deckName}
      {cardWidth}
      {maxCardWidth}
      {maxCards}
      {exactCount}
      {freshFront}
      {qrUrl}
      {onCoverResolved}
    />
  {/await}
{:else if product.type === "guide" && ready}
  {#await import("./BookCoverArt.svelte") then { default: BookCoverArt }}
    <BookCoverArt width={bookWidth} />
  {/await}
{:else if product.coverImageUrl}
  <img src={product.coverImageUrl} alt="" loading="lazy" />
{:else}
  <span class="mark" aria-hidden="true">
    <i class="fas fa-layer-group"></i>
  </span>
{/if}

<style>
  img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }

  .mark {
    font-size: 1.75rem;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.35));
  }
</style>
