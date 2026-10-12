<!--
  One item on the shelf. Every tile in the grid is built from this, so the five
  products read as one line instead of five layouts: same art box, same kicker,
  same two lines of description, same price row.

  The status chip and the button wording come from the shared purchase-state
  resolver, so a tile can never promise a checkout the shop can't take.
-->
<script lang="ts">
  import type { CatalogEntry } from "../../domain/catalog-listings";
  import { formatUsd } from "../../domain/preorder-pricing";
  import {
    resolvePurchaseState,
    SALES_LIVE,
  } from "../../domain/purchase-state";
  import ShopEntryArt from "../ShopEntryArt.svelte";

  interface Props {
    entry: CatalogEntry;
  }

  let { entry }: Props = $props();

  // The offer SKU, not the art lead: a cover-only row leads the LOOP group on
  // sortOrder, and reading availability off it labelled a tile "In stock"
  // beside a price that came from the SKU behind it.
  //
  // NOT named `state`: this component also uses the `$state` rune below, and
  // Svelte 5 reads the token `$state` as a store auto-subscription of a
  // variable called `state` rather than as the rune (`store_rune_conflict`).
  const purchase = $derived(resolvePurchaseState(entry.offer, SALES_LIVE));

  // What the shopper can do with this today, said plainly.
  const statusLabel = $derived(
    purchase === "buy"
      ? "In stock"
      : purchase === "preorder"
        ? "Pre-order"
        : "Not on sale yet"
  );
  const ctaLabel = $derived(
    purchase === "preorder"
      ? "Pre-order"
      : purchase === "buy"
        ? "View"
        : "See details"
  );

  // The art box reserves its height in CSS from its own width (see the .art
  // rule), which pins what a card in the fan may be: the box width over the
  // fan's span pitch, `cardW · (1 + 0.82(n-1)) · 1.05`.
  //
  // That number is passed as BOTH the floor and the ceiling, so every tile
  // draws the SAME card whatever it has to fan. Left to itself DeckFanCover
  // spreads whatever it's given across the whole box: the trilogy ships three
  // cover cards where the decks ship five, and its three came out a third
  // bigger than everyone else's and 40px taller than the box reserved for
  // them. The floor is also what drops a narrow tile from four cards to three
  // (DeckFanCover reduces the count while a card would fall below it).
  const FOUR_CARD_MIN = 448; // in step with the @container tier in the styles
  const PITCH_4 = 3.633;
  const PITCH_3 = 2.772;

  let artW = $state(0);
  const cardPx = $derived(
    artW
      ? Math.max(
          64,
          Math.floor(artW / (artW >= FOUR_CARD_MIN ? PITCH_4 : PITCH_3))
        )
      : 105
  );
</script>

<a class="tile" href={entry.href}>
  <div class="art" bind:clientWidth={artW}>
    <!-- Four cards on a desktop tile, three once the tile is narrow — and the
         card itself grows with the box instead of stopping at the 150px cap
         that left a 438×238 fan in a 733×432 panel at 4K. -->
    <ShopEntryArt
      cards={entry.artCards}
      product={entry.product}
      deckName={entry.name}
      cardWidth={cardPx}
      maxCardWidth={cardPx}
      maxCards={4}
      bookWidth="min(48cqi, 76cqh)"
    />
  </div>
  <span class="shelf">{entry.shelf}</span>
  <h3>{entry.name}</h3>
  <p class="blurb">{entry.blurb}</p>
  <div class="foot">
    <span class="price">
      {#if entry.priceIsFrom}<span class="from">from</span>{/if}{formatUsd(
        entry.priceCents
      )}
    </span>
    <span class="status" class:live={purchase !== "notify"}>{statusLabel}</span>
    <span class="cta">
      {ctaLabel}
      <i class="fas fa-arrow-right" aria-hidden="true"></i>
    </span>
  </div>
</a>

<style>
  .tile {
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    padding: clamp(1rem, 1.4vw, 1.6rem);
    border-radius: 1.25rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: inherit;
    text-decoration: none;
    transition:
      transform var(--duration-normal) var(--ease-out),
      border-color var(--duration-normal);
  }
  .tile:hover {
    transform: translateY(-0.25rem);
    border-color: var(--theme-border-strong, rgba(255, 255, 255, 0.3));
  }
  .tile:focus-visible {
    outline: 2px solid #fff;
    outline-offset: 2px;
  }

  /* Reserved art box, sized to the art it holds instead of a clamp that had no
     relationship to it. The old `clamp(11rem, 15vw, 18rem)` grew with the
     viewport while the fan stayed capped at 150px, so at 4K a 438×238 fan sat
     in a 733×432 panel — 40% of the box, "content that isn't the size of the
     container it's in". At 820 the same clamp went the other way and CLIPPED
     the fan's outer corners.

     The fan's geometry is arithmetic, so the box can be derived from it. A fan
     of n cards spans `cardW · (1 + 0.82(n-1)) · 1.05` (DeckFanCover's rest
     pitch and tilt slack) — 3.633 for four cards, 2.772 for three — and the
     script above hands the fan `boxW / pitch` as its card size. A card's
     visible height, the ±12° rotated bounding box of a 5:7 card, is
     1.577·cardW; 1.65 leaves the outer cards' bottom corners the room the
     fan's own 10px of bottom padding doesn't cover. Height is therefore
     `boxW · 1.65 / pitch`, and `100cqi` is the tile container's CONTENT
     width — which is this box's own width — so it resolves at first layout:
     no measurement, no shift, and the art scales with the tile at every tier
     instead of floating in it. */
  .art {
    height: calc(100cqi * 0.5952 + 12px);
    /* A size container so the book cover can be measured against the box's
       HEIGHT — a wide, short art box cropped it when it only knew the width. */
    container-type: size;
    display: grid;
    place-items: center;
    border-radius: 1rem;
    overflow: hidden;
    background: radial-gradient(
      circle at 50% 42%,
      rgba(255, 255, 255, 0.055),
      rgba(255, 255, 255, 0.015)
    );
  }

  /* Four-card pitch, at the same 448px the script switches on. */
  @container (min-width: 448px) {
    .art {
      height: calc(100cqi * 0.4542 + 12px);
    }
  }

  .shelf {
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #b8a6ff;
  }

  h3 {
    margin: 0;
    font-family: var(--page-title-font, "Fraunces", Georgia, serif);
    font-style: italic;
    font-weight: 700;
    font-variation-settings:
      "opsz" 144,
      "wght" 700,
      "SOFT" 0,
      "WONK" 1;
    font-size: clamp(1.25rem, 1.5vw, 1.75rem);
    line-height: 1.1;
    letter-spacing: -0.015em;
  }

  .blurb {
    margin: 0;
    font-size: var(--font-size-min, 14px);
    line-height: 1.55;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.66));
    /* Two lines, always: descriptions run from one line to five, and an
       unclamped one makes its tile taller than the tile beside it. */
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
    min-height: 3.1em;
  }

  .foot {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    flex-wrap: wrap;
    margin-top: auto;
    padding-top: 0.75rem;
  }

  .price {
    font-size: clamp(1.15rem, 1.2vw, 1.45rem);
    font-weight: 800;
    color: var(--theme-accent, #60a5fa);
    /* Prices change between tiles and between shelves; fixed-width digits keep
       the row from twitching as they do. */
    font-variant-numeric: tabular-nums;
  }
  .from {
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
    margin-right: 0.35rem;
  }

  .status {
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    padding: 0.35rem 0.6rem;
    border-radius: 999px;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.66));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.14));
  }
  .status.live {
    color: #7ee0ff;
    border-color: rgba(126, 224, 255, 0.4);
    background: rgba(126, 224, 255, 0.08);
  }

  /* Reads as the button it is, even though the whole tile is the link. */
  .cta {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.45rem;
    min-height: var(--min-touch-target, 44px);
    padding: 0 1.1rem;
    border-radius: 999px;
    border: 1px solid var(--theme-border, rgba(255, 255, 255, 0.18));
    background: var(--theme-card-bg-hover, rgba(255, 255, 255, 0.08));
    font-size: var(--font-size-min, 14px);
    font-weight: 700;
    white-space: nowrap;
  }
  .tile:hover .cta {
    border-color: var(--theme-border-strong, rgba(255, 255, 255, 0.35));
  }

  /* Narrow tile: the price row runs out of width before the button does, so
     the button takes its own line instead of squeezing the price. */
  @container (max-width: 20rem) {
    .cta {
      margin-left: 0;
      width: 100%;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .tile,
    .tile:hover {
      transition: none;
      transform: none;
    }
  }
</style>
