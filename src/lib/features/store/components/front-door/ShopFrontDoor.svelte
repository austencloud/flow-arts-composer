<!--
  /shop — the catalog front door.

  It replaced a locked "Coming soon" panel that everyone except an admin saw.
  The shop can't take money yet, so the page is honest about that in two places
  (every tile's status chip and the band near the bottom) and shows the whole
  line to everyone in between.

  Top to bottom: the hero teaches what a card does, the shelf filter narrows the
  grid, the grid is the catalog, then the two exits — leave an email, or go use
  the free Composer.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { browser } from "$app/env";
  import ShimmerBlock from "#lib/shared/components/loading/ShimmerBlock.svelte";
  import type { Product } from "../../domain/models/product";
  import { SALES_LIVE } from "../../domain/purchase-state";
  import WaitlistForm from "../WaitlistForm.svelte";
  import ShopFrontDoorHero from "./ShopFrontDoorHero.svelte";
  import ShopShelfFilter from "./ShopShelfFilter.svelte";
  import ShopCatalogTile from "./ShopCatalogTile.svelte";
  import { deriveCatalogEntries } from "../../domain/catalog-listings";
  import { allCoverCards, heroCoverPool } from "./front-door-catalog";

  interface Props {
    /** Server-rendered catalog: everything a tile needs except the cover cards,
     *  which are too heavy to ship in the HTML. */
    products: readonly Product[];
  }

  let { products }: Props = $props();

  const CATALOG_ID = "catalog";

  // The full catalog, cover cards included, fetched once the page is up. Until
  // it lands the tiles show their text and prices from the server list and
  // their art boxes sit empty — reserved, so nothing moves when the art
  // arrives. A failed fetch simply leaves the server list in place.
  let fullProducts = $state<Product[] | null>(null);
  const catalog = $derived(fullProducts ?? products);
  // An empty shelf and a broken fetch look identical from the grid's side, and
  // they are not the same message: one asks the reader to retry, the other
  // tells them there is nothing to retry for.
  let loadFailed = $state(false);
  // Server data normally paints the catalog immediately. When that read falls
  // back to an empty list, keep the page in an honest pending state until the
  // browser gets an answer instead of calling a request in flight "restocking."
  let catalogLoading = $state(products.length === 0);

  onMount(async () => {
    try {
      const { getProductLoader } = await import("../../get-product-loader");
      fullProducts = await getProductLoader().loadActiveProducts();
    } catch (e) {
      loadFailed = true;
      console.error("[shop] catalog load failed:", e);
    } finally {
      catalogLoading = false;
    }
  });

  const entries = $derived(deriveCatalogEntries(catalog));

  let shelf = $state("all");
  // A shelf can empty out between loads (a product goes draft). Fall back to
  // All rather than showing a filter that matches nothing.
  const shelves = $derived(new Set(entries.map((e) => e.shelf)));
  const activeShelf = $derived(shelf !== "all" && !shelves.has(shelf) ? "all" : shelf);
  const visible = $derived(
    activeShelf === "all" ? entries : entries.filter((e) => e.shelf === activeShelf)
  );

  // Column counts are PINNED per tier — 1, then 2, then 3 — never auto-fill,
  // which emits more and thinner tiles as the screen grows and orphans the
  // last one. What varies is the final row: with 5 products a three-across
  // grid ends on two tiles and a two-across grid ends on one, and a shelf
  // filter can narrow the catalog to a single item. Those remainders are
  // CENTRED under the row above (the grid runs on double tracks so a row of
  // two or one can sit half a tile in) rather than left stranded against an
  // empty track — or, as the single tile used to, stretched across the band.
  const remWide = $derived(visible.length % 3);
  const remMid = $derived(visible.length % 2);
  // Mirrors today's five-item catalog during the rare SSR-fallback load. The
  // real grid replaces like-for-like without pulling the exit cards upward.
  const SKELETON_TILE_COUNT = 5;

  // The hero deals from this, so it is the whole pool rather than one pick.
  const heroPool = $derived(heroCoverPool(catalog));

  // One worker seed for every fan on the page. Without it the print pipeline
  // composes cards with no arrow, prop, or glyph assets loaded and they come
  // out as bare grids.
  $effect(() => {
    if (!browser) return;
    const cards = allCoverCards(catalog);
    if (!cards.length) return;
    void import("../../services/cover-front-renderer")
      .then(({ prewarmCovers }) => prewarmCovers(cards))
      .catch((e) => console.error("[shop] cover prewarm failed:", e));
  });
</script>

<div class="front-door">
  <div class="band">
    <ShopFrontDoorHero pool={heroPool} catalogId={CATALOG_ID} />
  </div>

  {#if entries.length > 0}
    <div class="band filter-band">
      <ShopShelfFilter {entries} value={activeShelf} onchange={(next) => (shelf = next)} />
    </div>
  {:else if catalogLoading}
    <div class="band filter-band" aria-hidden="true">
      <div class="filter-placeholder">
        <div class="filter-shell-placeholder">
          <ShimmerBlock
            height="max(var(--min-touch-target, 44px), calc(1.4em + 1.1rem))"
            borderRadius="7px"
          />
        </div>
      </div>
    </div>
  {/if}

  <div class="band">
    <section
      class="catalog"
      id={CATALOG_ID}
      aria-labelledby="shop-catalog-title"
      aria-busy={catalogLoading}
    >
      <h2 id="shop-catalog-title" class="sr-only">Catalog</h2>
      {#if catalogLoading}
        <div class="catalog-loading" role="status" aria-live="polite">
          <p>Loading the catalog.</p>
          <div class="wide-rem2 mid-rem1 grid" aria-hidden="true">
            {#each Array(SKELETON_TILE_COUNT) as _, index}
              <div class="catalog-skeleton">
                <div class="skeleton-art">
                  <ShimmerBlock
                    height="100%"
                    borderRadius="1rem"
                    delay={index * 70}
                  />
                </div>
                <ShimmerBlock
                  width="24%"
                  height="0.75rem"
                  delay={index * 70 + 20}
                />
                <ShimmerBlock
                  width="58%"
                  height="1.65rem"
                  delay={index * 70 + 40}
                />
                <ShimmerBlock height="1rem" delay={index * 70 + 60} />
                <ShimmerBlock
                  width="82%"
                  height="1rem"
                  delay={index * 70 + 80}
                />
                <div class="skeleton-foot">
                  <ShimmerBlock
                    width="4rem"
                    height="1.45rem"
                    delay={index * 70 + 100}
                  />
                  <ShimmerBlock
                    width="7rem"
                    height="2.75rem"
                    borderRadius="999px"
                    delay={index * 70 + 120}
                  />
                </div>
              </div>
            {/each}
          </div>
        </div>
      {:else if entries.length === 0 && loadFailed}
        <p class="empty">The catalog isn't loading right now. Try again in a moment.</p>
      {:else if entries.length === 0}
        <p class="empty">
          The shop is being restocked. Leave an email below and you'll hear when products
          land.
        </p>
      {:else}
        <div
          class="grid"
          class:wide-rem1={remWide === 1}
          class:wide-rem2={remWide === 2}
          class:mid-rem1={remMid === 1}
        >
          {#each visible as entry (entry.href)}
            <ShopCatalogTile {entry} />
          {/each}
        </div>
      {/if}
    </section>

    <!-- The two ways off this page for someone who can't or won't buy today.
         They were consecutive full-width bands: two rows of mostly-empty dark
         panel, a paragraph at one end and a control at the other, with the
         whole content band between them. They're a PAIR, so they sit side by
         side as one row of two cards, and stack only when a half-band is too
         narrow to hold one. -->
    <div class="exits">
      <section class="notify" aria-labelledby="shop-notify-title">
        <div class="exit-copy">
          <h2 id="shop-notify-title">
            {SALES_LIVE ? "New in the line" : "The shop isn't open yet"}
          </h2>
          <p>
            {SALES_LIVE
              ? "Leave an email and you'll hear when something new ships."
              : "Orders aren't running yet. Leave an email and you'll hear when they are."}
          </p>
        </div>
        <!-- Pushed to the foot of the card so both cards' controls line up
             across the row however the copy above them wraps. -->
        <div class="exit-action">
          <WaitlistForm source="shop-front-door" compact />
        </div>
      </section>

      <section class="onward" aria-labelledby="shop-onward-title">
        <div class="exit-copy">
          <h2 id="shop-onward-title">Not buying today?</h2>
          <p>
            Everything on the cards is free in the Composer. Build sequences, watch them
            move, share a link anyone can scan.
          </p>
        </div>
        <!-- Two ways out for a non-buyer: the tool, and the free reading path the
             retired explainer page used to point at. Both are buttons, not text
             links (clickables-look-like-buttons.md). -->
        <div class="exit-action onward-actions">
          <!-- /create, not /composer. The button says OPEN, so it opens the tool;
               /composer is the page that describes it. Same destination the
               header, the footer and the home hero send this label to. -->
          <a class="onward-cta" href="/create">
            Open the Composer
            <i class="fas fa-arrow-right" aria-hidden="true"></i>
          </a>
          <a class="onward-cta secondary" href="/guide">Read the free guide</a>
        </div>
      </section>
    </div>
  </div>
</div>

<style>
  .front-door {
    min-height: 100svh;
    /* px, not rem: this clears the fixed-height SiteHeader, which does not ramp. */
    --shop-header-h: 64px;
    /* Everything between the bottom of the hero and the first tile: the shelf
       filter's own band (0.75rem top and bottom around a ~52px control) plus
       the catalog's top padding. The hero reads it to decide where the fold
       lands — see ShopFrontDoorHero's fold rule — so the two have to agree,
       and both are declared here rather than guessed there. */
    --shop-fold-reserve: calc(1.5rem + 52px + clamp(1.5rem, 2.5vw, 2.5rem));
    padding-top: var(--shop-header-h);
    background: transparent; /* the cosmic background shows through */
    color: var(--theme-text, #ffffff);
  }

  /* The one content band every /shop route shares: floor 1720px, fluid, ceiling
     2600px. The header, the footer, and each product page line up with it. */
  .band {
    max-width: var(--shell-w, min(1720px, 92vw));
    margin: 0 auto;
    padding: 0 1.5rem;
    display: flex;
    flex-direction: column;
    gap: clamp(2.5rem, 4vw, 4.5rem);
  }

  /* The filter's own band carries no gap or vertical padding — it has to sit
     tight against the grid it drives. */
  .filter-band {
    gap: 0;
    position: relative;
    z-index: 20;
  }

  /* ShopShelfFilter is 50px tall inside 0.75rem vertical padding. Reserving
     the same 74px band keeps the catalog fixed when the real options arrive. */
  .filter-placeholder {
    display: flex;
    justify-content: center;
    width: 100%;
    padding: 0.75rem 0;
  }

  .filter-shell-placeholder {
    box-sizing: border-box;
    width: 100%;
    max-width: 38rem;
    padding: 3px;
    border: 1px solid transparent;
    border-radius: 10px;
    font-size: var(--font-size-compact, 0.7rem);
  }

  .catalog {
    /* The marketing root's scroll padding clears the site header; this adds
       the sticky filter under it for the hero button's jump down here. */
    scroll-margin-top: 3.5rem;
    padding-top: clamp(1.5rem, 2.5vw, 2.5rem);
  }

  .grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: clamp(1rem, 1.8vw, 2rem);
  }

  /* Two across. Four tracks, two per tile: the doubled track is what lets a
     lone trailing tile sit centred on half-track boundaries instead of
     stretching across the band. */
  @media (min-width: 48rem) {
    .grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
    .grid > :global(*) {
      grid-column: span 2;
    }
  }

  /* Bounded so it can't leak into the three-across tier, where the trailing
     row is placed by the rules below instead. */
  @media (min-width: 48rem) and (max-width: 87.4375rem) {
    .grid.mid-rem1 > :global(:last-child) {
      grid-column: 2 / span 2;
    }
  }

  /* Three across, six tracks. A remainder of one centres under the middle
     tile; a remainder of two steps in by half a tile so the pair straddles
     the centre. */
  @media (min-width: 87.5rem) {
    .grid {
      grid-template-columns: repeat(6, minmax(0, 1fr));
    }
    .grid.wide-rem1 > :global(:last-child) {
      grid-column: 3 / span 2;
    }
    .grid.wide-rem2 > :global(:nth-last-child(2)) {
      grid-column: 2 / span 2;
    }
  }

  .empty {
    margin: 0;
    padding: 3rem 0;
    text-align: center;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.66));
  }

  /* Same grid grammar and card geometry as the loaded catalog. The server
     fallback can therefore resolve without the exit cards jumping several
     rows down the page when the client catalog arrives. */
  .catalog-loading > p {
    margin: 0 0 1rem;
    text-align: center;
  }

  .catalog-skeleton {
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    padding: clamp(1rem, 1.4vw, 1.6rem);
    border-radius: 1.25rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
  }

  .skeleton-art {
    height: calc(100cqi * 0.5952 + 12px);
  }

  @container (min-width: 448px) {
    .skeleton-art {
      height: calc(100cqi * 0.4542 + 12px);
    }
  }

  .skeleton-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    margin-top: auto;
    padding-top: 0.75rem;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  /* One row of two cards. 60rem is where a half-band still holds an email
     field beside its button without the form wrapping. */
  .exits {
    display: grid;
    gap: clamp(1rem, 1.8vw, 2rem);
    margin-bottom: clamp(1.5rem, 3vh, 3rem);
  }

  @media (min-width: 60rem) {
    .exits {
      grid-template-columns: 1fr 1fr;
    }
  }

  /* Deliberately quiet: it's the fallback for people the shop can't sell to
     yet, not the point of the page. Stacked rather than a copy-left /
     control-right row — at half a band that row wraps at some widths and not
     others, and stacking makes the two cards read as a matched pair. */
  .notify,
  .onward {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: clamp(0.9rem, 1.4vw, 1.5rem);
    padding: clamp(1.25rem, 1.8vw, 2rem);
    border-radius: 1.25rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .notify {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
  }

  /* Both cards stretch to the taller of the two, so pinning the control to the
     foot lands the email field and the CTA row on the same line. */
  .exit-action {
    margin-top: auto;
    width: 100%;
  }

  .onward {
    background: linear-gradient(
      120deg,
      rgba(255, 122, 184, 0.08),
      rgba(126, 224, 255, 0.06)
    );
    border-color: var(--theme-border, rgba(255, 255, 255, 0.16));
  }

  h2 {
    margin: 0 0 0.4rem;
    font-family: var(--page-title-font, "Fraunces", Georgia, serif);
    font-style: italic;
    font-weight: 700;
    font-variation-settings: "opsz" 144, "wght" 700, "SOFT" 0, "WONK" 1;
    font-size: clamp(1.35rem, 2vw, 2rem);
    letter-spacing: -0.015em;
  }

  /* No `ch` reading cap: these are one-sentence lines inside a card that is
     already half a band, and the cap only forced them to wrap early and made
     the card taller than it needed to be (4k-native-layout.md, rule 3). */
  p {
    margin: 0;
    font-size: var(--font-size-min, 14px);
    line-height: 1.6;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.68));
  }

  .onward-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .onward-cta {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.6rem;
    min-height: var(--min-touch-target, 44px);
    padding: 0 1.6rem;
    border-radius: 999px;
    border: 1px solid var(--theme-border, rgba(255, 255, 255, 0.22));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.07));
    color: inherit;
    text-decoration: none;
    font-size: var(--font-size-min, 14px);
    font-weight: 700;
    white-space: nowrap;
    transition: background 0.2s, border-color 0.2s;
  }
  .onward-cta:hover {
    background: var(--theme-card-bg-hover, rgba(255, 255, 255, 0.13));
    border-color: var(--theme-border-strong, rgba(255, 255, 255, 0.38));
  }
  .onward-cta:focus-visible {
    outline: 2px solid #fff;
    outline-offset: 2px;
  }

  /* The second path is real, not the headline one: same shape, less weight. */
  .onward-cta.secondary {
    background: transparent;
    font-weight: 600;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.78));
  }
  .onward-cta.secondary:hover {
    color: inherit;
  }

  @media (prefers-reduced-motion: reduce) {
    .onward-cta {
      transition: none;
    }
  }
</style>
