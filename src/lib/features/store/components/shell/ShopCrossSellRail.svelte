<!--
  "More from the line" — the lateral move every product page was missing. A page
  used to dead-end: buy, or leave. This puts the rest of the catalog at the
  bottom of every product page and the order confirmation, built from the same
  product list the page already loaded, so it costs no extra read.
-->
<script lang="ts">
  import type { CatalogEntry } from "../../domain/catalog-listings";
  import { formatUsd } from "../../domain/preorder-pricing";
  import ShopEntryArt from "../ShopEntryArt.svelte";

  interface Props {
    entries: readonly CatalogEntry[];
    title?: string;
  }

  let { entries, title = "More from the line" }: Props = $props();

  // Column count is a decision, not whatever auto-fill emits: three across at
  // most, and never a wide row holding a single stranded card.
  const columns = $derived(Math.min(entries.length, 3));
</script>

{#if entries.length > 0}
  <section class="rail" aria-labelledby="cross-sell-title">
    <h2 id="cross-sell-title">{title}</h2>
    <div class="rail-grid" style:--cols={columns}>
      {#each entries as entry (entry.href)}
        <a class="rail-card" href={entry.href}>
          <!-- Same art component the front-door tiles use, fed the same
               derived cards, so a product looks like itself wherever it
               appears. The box is a fixed size, so art landing late moves
               nothing in the card. -->
          <div class="art">
            <ShopEntryArt
              cards={entry.artCards}
              product={entry.product}
              deckName={entry.name}
              cardWidth={72}
              maxCardWidth={150}
              maxCards={3}
              bookWidth="min(40cqi, 72cqh)"
            />
          </div>
          <span class="shelf">{entry.shelf}</span>
          <span class="name">{entry.name}</span>
          <span class="blurb">{entry.blurb}</span>
          <span class="foot">
            <span class="price">
              {#if entry.priceIsFrom}from&nbsp;{/if}{formatUsd(
                entry.priceCents
              )}
            </span>
            <span class="go"
              >View <i class="fas fa-arrow-right" aria-hidden="true"></i></span
            >
          </span>
        </a>
      {/each}
    </div>
  </section>
{/if}

<style>
  .rail {
    container-type: inline-size;
    container-name: cross-sell;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  h2 {
    margin: 0;
    font-family: var(--page-title-font, "Fraunces", Georgia, serif);
    font-style: italic;
    font-weight: 700;
    font-variation-settings:
      "opsz" 144,
      "wght" 700,
      "SOFT" 0,
      "WONK" 1;
    font-size: clamp(1.35rem, 2vw, 1.9rem);
    letter-spacing: -0.015em;
  }

  .rail-grid {
    display: grid;
    grid-template-columns: repeat(var(--cols, 3), minmax(0, 1fr));
    gap: clamp(1rem, 1.6vw, 1.75rem);
  }

  /* One column on a phone. No two-column tier: with three cards it strands the
     third on a row of its own. */
  @container cross-sell (max-width: 40rem) {
    .rail-grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  .rail-card {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: clamp(1rem, 1.4vw, 1.5rem);
    border-radius: 1.25rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: inherit;
    text-decoration: none;
    transition:
      transform var(--duration-normal) var(--ease-out),
      border-color var(--duration-normal);
  }
  .rail-card:hover {
    transform: translateY(-0.25rem);
    border-color: var(--theme-border-strong, rgba(255, 255, 255, 0.3));
  }
  .rail-card:focus-visible {
    outline: 2px solid #fff;
    outline-offset: 2px;
  }

  /* Fixed art box: the fan and the book cover both load async, and a reserved
     height means neither reflows the card when it lands. */
  .art {
    height: clamp(8rem, 11vw, 13rem);
    /* A size container so the printed guide's cover can be measured against
       the box's HEIGHT — a wide, short art box crops it otherwise. */
    container-type: size;
    display: grid;
    place-items: center;
    border-radius: 1rem;
    overflow: hidden;
    background: radial-gradient(
      circle at 50% 42%,
      rgba(255, 255, 255, 0.05),
      rgba(255, 255, 255, 0.015)
    );
  }

  .shelf {
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #b8a6ff;
  }

  .name {
    font-size: clamp(1.05rem, 1.3vw, 1.35rem);
    font-weight: 800;
  }

  .blurb {
    font-size: var(--font-size-min, 14px);
    line-height: 1.55;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.66));
    /* Two lines, always: descriptions vary wildly in length and an unclamped
       one makes its card taller than its neighbours. */
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
    /* Two lines' worth of reserved height, so a one-line description doesn't
       make its card shorter than the card beside it. */
    min-height: 3.1em;
  }

  .foot {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.75rem;
    margin-top: auto;
    padding-top: 0.5rem;
  }

  .price {
    font-size: 1.15rem;
    font-weight: 800;
    color: var(--theme-accent, #60a5fa);
    font-variant-numeric: tabular-nums;
  }

  .go {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-size: var(--font-size-min, 14px);
    font-weight: 700;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.75));
  }

  @media (prefers-reduced-motion: reduce) {
    .rail-card {
      transition: none;
    }
    .rail-card:hover {
      transform: none;
    }
  }
</style>
