<script lang="ts">
  import * as singleBuyCheckoutCreator from "#lib/features/store/services/single-buy-checkout-creator.js";
  import { getProductLoader } from "#lib/features/store/get-product-loader.js";
  import { createStoreState } from "./state/store-state.svelte";
  import { setStoreContext } from "./context/store-context";
  import BookCoverArt from "./components/BookCoverArt.svelte";
  import DeckFanCover from "./components/DeckFanCover.svelte";
  import LoopChips from "./components/LoopChips.svelte";
  import { prewarmCovers } from "./services/cover-front-renderer";
  import { activePriceCents, formatUsd } from "./domain/preorder-pricing";

  // Read once — the preorder→regular boundary is a fixed instant, no ticking.
  const now = Date.now();

  // showDrafts: the admin "play with it" view loads every product including
  // drafts and sold-out. Public buyers get active-only.
  let { showDrafts = false }: { showDrafts?: boolean } = $props();

  const state = createStoreState(getProductLoader(), singleBuyCheckoutCreator);

  setStoreContext({ state });

  // Prime synchronously (cache-first) so a back-navigation paints the grid on the
  // first frame — the view-transition reverse morph needs the target cards present
  // at the moment SvelteKit snapshots the new page. The first visit still fetches.
  state.loadProducts(showDrafts);

  // Backing SKUs of the configurable listings. Each family surfaces as ONE tile
  // (a configurator entry), never as a wall of near-identical products.
  const deckSkus = $derived(
    state.products.filter(
      (p) => p.listing === "loop-deck" && p.status === "active"
    )
  );
  const tndSkus = $derived(
    state.products.filter(
      (p) => p.listing === "tnd-trilogy" && p.status === "active"
    )
  );
  // Flat $30 lives on the single purchasable custom SKU (dial funnel v2).
  const loopCustomSku = $derived(
    state.products.find(
      (p) => p.listing === "loop-deck-custom" && p.status === "active"
    ) ?? null
  );
  const deckPrice = $derived(
    loopCustomSku ? formatUsd(activePriceCents(loopCustomSku, now)) : "$30"
  );
  const tndPrice = $derived(
    tndSkus.length
      ? formatUsd(Math.min(...tndSkus.map((p) => activePriceCents(p, now))))
      : "$30"
  );
  // Hero fan: the first cover of each LOOP flavor — a varied hand, one card per family.
  const heroCards = $derived(
    deckSkus
      .map((p) => p.coverCards?.[0])
      .filter((c): c is NonNullable<typeof c> => c != null)
  );
  const tileCards = $derived(deckSkus[0]?.coverCards ?? []);
  // TnD tile fan: one card per element family from the trilogy's first volume.
  const tndTileCards = $derived(tndSkus[0]?.coverCards ?? []);
  const allComponents = $derived([
    ...new Set(deckSkus.flatMap((p) => p.loopComponents ?? [])),
  ]);

  // ONE worker seed for the whole page's covers (union signature), so every fan
  // composes with arrow/prop/glyph assets present instead of bare grids.
  $effect(() => {
    const all = state.products.flatMap((p) => p.coverCards ?? []);
    if (all.length) prewarmCovers(all);
  });

  // The starter pack: the flagship bundle listing. Its fan is a mixed hand of
  // LOOP flavors + trilogy elements pulled from the other products' covers.
  const starterPack = $derived(
    state.products.find(
      (p) => p.listing === "starter-pack" && p.status === "active"
    ) ?? null
  );
  const starterPrice = $derived(
    starterPack ? formatUsd(starterPack.price) : ""
  );
  // Deliberately half LOOP, half color-coded trilogy: the mix is the message.
  const starterCards = $derived([
    ...heroCards.slice(0, 3),
    ...tndTileCards.slice(0, 3),
  ]);

  // The companion book: the only non-deck product on offer. Everything the shop
  // sells sits above the fold (two deck lines + the book) — no catch-all grid.
  const book = $derived(
    state.products.find((p) => p.type === "guide" && p.status === "active") ??
      null
  );
  const bookPrice = $derived(book ? formatUsd(book.price) : "");

  // First-load frame ONLY: fetching with nothing to show yet. Cache hits paint
  // synchronously (products present frame one), so this is true first visit only.
  // While true, the hero fan + every product band are empty, which lets the
  // always-rendered info bands float up into the gap (and recompose into the
  // ultrawide bottom-zone grid). Reserve the region with skeleton tiles that
  // mirror the real layout so the loading frame matches the loaded one.
  const firstLoad = $derived(
    state.isLoading && state.products.length === 0 && !state.error
  );
</script>

<!-- Skeleton for one product tile (fan/art box + text lines + buy row). Reused
     for the starter, both deck lines, and the book during first load. Mirrors the
     real .deck-tile geometry so swapping to real content shifts nothing. -->
{#snippet skTile()}
  <div class="sk-box"></div>
  <div class="sk-info">
    <div class="sk-line sk-eyebrow"></div>
    <div class="sk-line sk-title"></div>
    <div class="sk-line sk-meta"></div>
    <div class="sk-line"></div>
    <div class="sk-line sk-short"></div>
    <div class="sk-buy">
      <div class="sk-line sk-price"></div>
      <div class="sk-pill"></div>
    </div>
  </div>
{/snippet}

<div class="store-page">
  <main class="store-content">
    <!-- ============ HERO: the product IS the art ============ -->
    <section class="hero">
      <div class="hero-fan" aria-hidden="true">
        {#if heroCards.length}
          <DeckFanCover
            cards={heroCards}
            deckName="TKA Shop"
            cardWidth={148}
            maxCardWidth={250}
          />
        {:else if firstLoad}
          <div class="sk-hero-fan">
            {#each [0, 1, 2, 3, 4] as i (i)}
              <div
                class="sk-hero-card"
                style:transform="rotate({-12 + 6 * i}deg)"
              ></div>
            {/each}
          </div>
        {/if}
      </div>
      <h1>Choreography you can shuffle</h1>
      <p class="hero-subtitle">
        Real flow sequences, printed as playing cards. Every card holds a
        complete eight-count LOOP: read it, drill it, run it forever.
      </p>
      <div class="hero-actions">
        <a class="hero-cta" href="/shop/loop-deck">
          Build your deck <i class="fas fa-arrow-right" aria-hidden="true"></i>
        </a>
        <a class="hero-cta secondary" href="/shop/loop-deck">
          See what's on a card
        </a>
      </div>
    </section>

    {#if state.error}
      <div class="error">{state.error}</div>
    {:else}
      <!-- ============ THE STARTER PACK ============
           Flagship bundle band under the hero: newcomers start here, before
           the individual deck lines. -->
      {#if firstLoad}
        <!-- Reserve the starter band so the info bands below stay pinned to the
             bottom (and the ultrawide bottom-zone grid stays filled). Same
             geometry as the real tiles → no shift when products land. -->
        <section class="starter-band">
          <div class="sk-tile">{@render skTile()}</div>
        </section>
      {/if}
      {#if starterPack}
        <section class="starter-band">
          <a class="starter-tile" href="/shop/starter-pack">
            <div class="starter-fan-box">
              <DeckFanCover
                cards={starterCards}
                deckName={starterPack.name}
                cardWidth={128}
                maxCardWidth={230}
                exactCount={Math.min(6, starterCards.length)}
              />
            </div>
            <div class="deck-info">
              <span class="eyebrow">Start here</span>
              <h2>{starterPack.name}</h2>
              <p class="deck-meta">
                Trilogy · mixed LOOP deck · the book · waterproof card holder
              </p>
              <p class="deck-desc">{starterPack.description}</p>
              <div class="deck-buy-row">
                <span class="deck-price">{starterPrice}</span>
                <span class="deck-cta">
                  Get the pack <i class="fas fa-arrow-right" aria-hidden="true"
                  ></i>
                </span>
              </div>
            </div>
          </a>
        </section>
      {/if}

      <!-- ============ THE TWO DECK LINES ============ -->
      {#if deckSkus.length > 0 || tndSkus.length > 0}
        <section class="deck-listing" id="deck">
          {#if deckSkus.length > 0}
            <div class="tile-shell">
              <a class="deck-tile" href="/shop/loop-deck">
                <div class="deck-fan-box">
                  <DeckFanCover
                    cards={tileCards}
                    deckId={deckSkus[0]?.deckId}
                    deckName="LOOP Deck"
                    cardWidth={132}
                    maxCardWidth={235}
                    viewTransitionName="shop-fan-loop-deck"
                  />
                </div>
                <div class="deck-info">
                  <span class="eyebrow">The deck</span>
                  <h2>LOOP Deck</h2>
                  <p class="deck-meta">
                    built to your dials · 54 cards · poker size
                  </p>
                  <LoopChips components={allComponents} />
                  <p class="deck-desc">
                    Pick a level, a length, and a flavor, or let the Variety
                    Pack blend them. Every sequence ends exactly where it began.
                  </p>
                  <div class="deck-buy-row">
                    <span class="deck-price">{deckPrice}</span>
                    <span class="deck-cta">
                      Build your deck <i
                        class="fas fa-arrow-right"
                        aria-hidden="true"
                      ></i>
                    </span>
                  </div>
                </div>
              </a>
            </div>
          {/if}

          {#if tndSkus.length > 0}
            <div class="tile-shell">
              <a class="deck-tile" href="/shop/tnd-trilogy">
                <div class="deck-fan-box">
                  <!-- Always all six element families in the fan. -->
                  <DeckFanCover
                    cards={tndTileCards}
                    deckName="Timing & Direction"
                    cardWidth={110}
                    maxCardWidth={235}
                    exactCount={Math.min(6, tndTileCards.length)}
                    viewTransitionName="shop-fan-tnd-trilogy"
                  />
                </div>
                <div class="deck-info">
                  <span class="eyebrow">The trilogy</span>
                  <h2>Timing &amp; Direction</h2>
                  <p class="deck-meta">
                    {tndSkus.length} volumes · color-coded by element · poker size
                  </p>
                  <span class="element-swatches" aria-hidden="true">
                    {#each tndTileCards.slice(0, 6) as card (card.footerCenter ?? card.accentColor)}
                      {#if card.accentColor}
                        <span class="swatch" style:--c={card.accentColor}
                        ></span>
                      {/if}
                    {/each}
                  </span>
                  <p class="deck-desc">
                    The teaching line: base motions, then one-turn, then
                    half-turn variations. Every card wears its timing and
                    direction family's element color.
                  </p>
                  <div class="deck-buy-row">
                    <span class="deck-price">{tndPrice}</span>
                    <span class="deck-cta">
                      Pick a volume <i
                        class="fas fa-arrow-right"
                        aria-hidden="true"
                      ></i>
                    </span>
                  </div>
                </div>
              </a>
            </div>
          {/if}
        </section>
      {:else if firstLoad}
        <section class="deck-listing" id="deck">
          <div class="tile-shell">{@render skTile()}</div>
          <div class="tile-shell">{@render skTile()}</div>
        </section>
      {/if}

      <!-- ============ BOTTOM ZONE ============
           Book + info bands. Stacked strips normally; on ultrawide they compose
           into one dense grid (book+story row, how+box row) so a 4K viewport
           carries density instead of short strips with dead sides. -->
      <div class="bottom-zone">
        <!-- ============ THE BOOK ============
           The one non-deck product: the printed guide, front and center with
           the deck lines. Typographic cover panel, no fake product photo. -->
        {#if firstLoad}
          <!-- Fills the ultrawide bottom-zone "book" grid-area during load so the
             how/box/story bands don't recompose around an empty slot. -->
          <section class="book-band">
            <div class="sk-tile sk-tile--book">{@render skTile()}</div>
          </section>
        {/if}
        {#if book}
          <section class="book-band">
            <a class="book-tile" href="/shop/{book.id}">
              <div class="book-art" aria-hidden="true">
                <BookCoverArt viewTransitionName="shop-book-cover" />
              </div>
              <div class="deck-info">
                <span class="eyebrow">The guide</span>
                <h2>{book.name}</h2>
                {#if book.preorder}
                  <p class="deck-meta">
                    Preorder{book.shipBy ? ` · ships ${book.shipBy}` : ""}
                  </p>
                {/if}
                <p class="deck-desc">{book.description}</p>
                <p class="deck-desc">
                  The decks teach you sequences. The book teaches you the system
                  behind them, so you can write your own.
                </p>
                <div class="deck-buy-row">
                  <span class="deck-price">{bookPrice}</span>
                  <span class="deck-cta">
                    Preorder the book <i
                      class="fas fa-arrow-right"
                      aria-hidden="true"
                    ></i>
                  </span>
                </div>
              </div>
            </a>
          </section>
        {/if}

        <!-- ============ INFO BANDS ============
           Stacked strips on normal screens; on ultrawide they compose into ONE
           side-by-side band (how / box / story), so the width carries density
           instead of stretched one-line cards. -->
        <div class="info-bands">
          <section class="band band-how">
            <h2 class="section-title">How it works</h2>
            <div class="steps-grid">
              <div class="step">
                <i class="fas fa-layer-group" aria-hidden="true"></i>
                <h3>Draw a card</h3>
                <p>
                  Shuffle, draw, and you've got your next eight counts. 54
                  sequences per deck means practice never repeats itself.
                </p>
              </div>
              <div class="step">
                <i class="fas fa-book-open" aria-hidden="true"></i>
                <h3>Read the pattern</h3>
                <p>
                  Each card is TKA notation: a grid, two colors, one path per
                  hand. Learn to read it once and every card opens up.
                </p>
              </div>
              <div class="step">
                <i class="fas fa-play" aria-hidden="true"></i>
                <h3>Watch it move</h3>
                <p>
                  The same decks live in the app's deck browser. Pull up any
                  sequence and watch it animated before you drill it.
                </p>
              </div>
            </div>
          </section>

          <section class="band band-box">
            <h2 class="section-title">What's in the box</h2>
            <ul class="box-list">
              <li>
                <i class="fas fa-clone" aria-hidden="true"></i> 54 sequence cards,
                poker size (2.5" × 3.5")
              </li>
              <li>
                <i class="fas fa-circle-info" aria-hidden="true"></i> 1 explainer
                card: what this deck is and where it sits in the full system
              </li>
              <li>
                <i class="fas fa-file-lines" aria-hidden="true"></i> Free laminated
                quick-reference sheet
              </li>
              <li>
                <i class="fas fa-box-open" aria-hidden="true"></i> Foldable deck box
              </li>
              <li>
                <i class="fas fa-gift" aria-hidden="true"></i> 59 cards in a 54-card
                box. We count generously.
              </li>
            </ul>
          </section>

          <section class="band story band-story">
            <h2 class="section-title">First run, made by hand</h2>
            <div class="story-card">
              <i class="fas fa-scissors" aria-hidden="true"></i>
              <p>
                Every beta deck is printed, guillotine-cut, and packed in
                Chicago by the person who built the system. Small batches,
                shipped fast. When the beta run sells through, the finished
                edition goes to professional printing.
              </p>
            </div>
          </section>
        </div>
      </div>

      {#if state.isLoading && state.products.length === 0}
        <div class="loading">Loading products...</div>
      {/if}
    {/if}
  </main>
</div>

<style>
  .store-page {
    min-height: 100vh;
    padding-top: 64px; /* clear the fixed SiteHeader */
    /* Transparent so the /shop cosmic BackgroundHost shows through. */
    background: transparent;
    color: var(--theme-text, #ffffff);
  }

  .store-content {
    /* Fill big screens intelligently: a wide fluid band (up to 2400px) instead of
       a 1200px column that miniaturized the grid on 4K. */
    max-width: min(2400px, 94vw);
    margin: 0 auto;
    padding: 40px clamp(24px, 4vw, 64px) 80px;
  }

  .hero {
    text-align: center;
    margin-bottom: 72px;
  }

  /* Reserved box: the fan streams in without shoving the headline (no-layout-shift).
     Scales with the viewport so the auto-scaled fan has room on 4K. Top padding
     keeps the rotated card corners off the fixed header on wide screens. */
  .hero-fan {
    min-height: clamp(250px, 15.5vw, 410px);
    display: grid;
    place-items: center;
    margin-bottom: 8px;
    padding-top: 24px;
  }

  .hero h1 {
    /* Brand Fraunces wonky italic — same page-title voice as every other public
       page (token set by MarketingChrome; /shop lives under that chrome). */
    font-family: var(--page-title-font, "Fraunces", Georgia, serif);
    font-style: italic;
    font-weight: 700;
    font-variation-settings:
      "opsz" 144,
      "wght" 700,
      "SOFT" 0,
      "WONK" 1;
    font-size: clamp(2.2rem, 3.2vw, 4.2rem);
    letter-spacing: -0.015em;
    margin: 0 0 14px;
  }

  .hero-subtitle {
    font-size: clamp(1rem, 1.2vw, 1.35rem);
    line-height: 1.6;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.66));
    max-width: 68ch;
    margin: 0 auto 26px;
  }

  .hero-cta {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    min-height: var(--min-touch-target, 44px);
    padding: 14px 30px;
    border-radius: 999px;
    background: linear-gradient(135deg, #6f8cff, #8b6cff);
    color: #fff;
    font-size: var(--font-size-md, 1rem);
    font-weight: 700;
    text-decoration: none;
    transition:
      filter 0.18s ease,
      transform 0.18s ease;
  }
  .hero-cta:hover {
    filter: brightness(1.08);
    transform: translateY(-2px);
  }

  .hero-actions {
    display: flex;
    justify-content: center;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
  }

  /* Newcomer on-ramp: the anatomy explainer. Same pill shape, quiet fill. */
  .hero-cta.secondary {
    background: rgba(111, 140, 255, 0.12);
    border: 1px solid rgba(139, 108, 255, 0.45);
    color: var(--text-primary, #e8e8f2);
    font-weight: 600;
  }
  .hero-cta.secondary:hover {
    background: rgba(111, 140, 255, 0.2);
  }

  /* ---------- the starter pack (flagship band) ---------- */
  .starter-band {
    margin-bottom: 28px;
  }

  .starter-tile {
    /* One wide featured tile: caps and centers on ultrawide like the book. */
    max-width: 1700px;
    margin: 0 auto;
    display: grid;
    grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
    gap: clamp(20px, 3vw, 48px);
    align-items: center;
    padding: clamp(20px, 3vw, 40px);
    border-radius: 24px;
    border: 1px solid rgba(139, 108, 255, 0.35);
    background: linear-gradient(
      135deg,
      rgba(139, 108, 255, 0.1),
      rgba(111, 140, 255, 0.04) 55%,
      rgba(255, 255, 255, 0.03)
    );
    color: inherit;
    text-decoration: none;
    transition:
      transform 0.2s cubic-bezier(0.16, 1, 0.3, 1),
      border-color 0.2s;
  }
  .starter-tile:hover {
    transform: translateY(-4px);
    border-color: rgba(139, 108, 255, 0.7);
  }

  .starter-fan-box {
    min-height: clamp(240px, 15vw, 400px);
    display: grid;
    place-items: center;
    border-radius: 16px;
    background: radial-gradient(
      circle at 50% 42%,
      rgba(255, 255, 255, 0.05),
      rgba(255, 255, 255, 0.015)
    );
  }

  @media (max-width: 820px) {
    .starter-tile {
      grid-template-columns: 1fr;
    }
  }

  .deck-listing {
    margin-bottom: 72px;
    display: grid;
    grid-template-columns: 1fr;
    gap: 28px;
  }

  /* Two lines sit side by side from laptop width up (1366 is the most common
     desktop and used to get the stacked layout). Below ~640px of TILE width
     the tile's own container query stacks its internals, so narrow side-by-side
     tiles stay clean. */
  @media (min-width: 1200px) {
    .deck-listing {
      grid-template-columns: repeat(auto-fit, minmax(540px, 1fr));
    }
  }

  /* Each tile measures itself; internals stack when the tile (not the
     viewport) is narrow. */
  .tile-shell {
    container-type: inline-size;
    min-width: 0;
  }

  .element-swatches {
    display: inline-flex;
    gap: 6px;
  }
  .swatch {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--c);
    border: 1px solid rgba(255, 255, 255, 0.35);
  }

  .deck-tile {
    display: grid;
    grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
    gap: clamp(20px, 3vw, 48px);
    align-items: center;
    padding: clamp(20px, 3vw, 40px);
    border-radius: 24px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: inherit;
    text-decoration: none;
    transition:
      transform 0.2s cubic-bezier(0.16, 1, 0.3, 1),
      border-color 0.2s;
  }
  .deck-tile:hover {
    transform: translateY(-4px);
    border-color: var(--theme-border-strong, rgba(255, 255, 255, 0.3));
  }

  .deck-fan-box {
    min-height: clamp(240px, 15vw, 420px);
    display: grid;
    place-items: center;
    border-radius: 16px;
    background: radial-gradient(
      circle at 50% 42%,
      rgba(255, 255, 255, 0.05),
      rgba(255, 255, 255, 0.015)
    );
  }

  .deck-info {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
  }

  .eyebrow {
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #b8a6ff;
  }

  .deck-info h2 {
    font-size: clamp(1.6rem, 2.4vw, 2.2rem);
    font-weight: 800;
    margin: 0;
  }

  .deck-meta {
    font-size: var(--font-size-min, 14px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
    margin: 0;
  }

  .deck-desc {
    font-size: var(--font-size-min, 14px);
    line-height: 1.6;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.75));
    margin: 0;
    max-width: 46ch;
  }

  .deck-buy-row {
    display: flex;
    align-items: center;
    gap: 20px;
    margin-top: 6px;
  }

  .deck-price {
    font-size: 1.8rem;
    font-weight: 800;
    color: var(--theme-accent, #60a5fa);
    font-variant-numeric: tabular-nums;
  }

  .deck-cta {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: var(--min-touch-target, 44px);
    padding: 10px 22px;
    border-radius: 999px;
    background: linear-gradient(135deg, #6f8cff, #8b6cff);
    color: #fff;
    font-weight: 700;
    font-size: var(--font-size-min, 14px);
  }

  @container (max-width: 639px) {
    .deck-tile {
      grid-template-columns: 1fr;
    }
  }

  .book-band {
    margin-bottom: 72px;
  }

  .book-tile {
    /* One product, not a full-bleed band: cap and center so ultrawide doesn't
       leave a half-empty tile trailing off to the right. */
    max-width: 1240px;
    margin: 0 auto;
    display: grid;
    grid-template-columns: minmax(220px, 340px) minmax(0, 1fr);
    gap: clamp(20px, 3vw, 48px);
    align-items: center;
    padding: clamp(20px, 3vw, 40px);
    border-radius: 24px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: inherit;
    text-decoration: none;
    transition:
      transform 0.2s cubic-bezier(0.16, 1, 0.3, 1),
      border-color 0.2s;
  }
  .book-tile:hover {
    transform: translateY(-4px);
    border-color: var(--theme-border-strong, rgba(255, 255, 255, 0.3));
  }

  .book-art {
    display: grid;
    place-items: center;
    min-height: clamp(240px, 15vw, 360px);
    border-radius: 16px;
    background: radial-gradient(
      circle at 50% 42%,
      rgba(255, 255, 255, 0.05),
      rgba(255, 255, 255, 0.015)
    );
  }

  @media (max-width: 820px) {
    .book-tile {
      grid-template-columns: 1fr;
    }
  }

  .band {
    margin-bottom: 72px;
  }

  .section-title {
    font-size: var(--font-size-lg, 18px);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.7));
    margin: 0 0 20px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .steps-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 24px;
  }

  .step {
    padding: 24px;
    border-radius: 16px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
  }
  .step i {
    font-size: 1.4rem;
    color: #8b6cff;
  }
  .step h3 {
    font-size: var(--font-size-md, 1rem);
    font-weight: 700;
    margin: 12px 0 8px;
  }
  .step p {
    font-size: var(--font-size-min, 14px);
    line-height: 1.6;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.66));
    margin: 0;
  }

  .box-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 14px;
  }
  .box-list li {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px 18px;
    border-radius: 14px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    font-size: var(--font-size-min, 14px);
  }
  .box-list i {
    color: #8b6cff;
    flex: 0 0 auto;
  }

  .story-card {
    padding: 24px;
    border-radius: 16px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    max-width: 78ch;
  }
  .story-card i {
    font-size: 1.4rem;
    color: #8b6cff;
    margin-bottom: 12px;
    display: block;
  }
  .story-card p {
    font-size: var(--font-size-min, 14px);
    line-height: 1.7;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.75));
    margin: 0;
  }

  /* ---------- ultrawide composition (4K+) ----------
     Don't stretch the strips: recompose them. The book tile spans two thirds
     with the beta-run story filling the third beside it; below, "how it works"
     spans two thirds next to "what's in the box". One dense zone, no short
     strips with dead sides. */
  @media (min-width: 1800px) {
    .bottom-zone {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      grid-template-areas:
        "book book story"
        "how how box";
      gap: 28px;
      align-items: stretch;
      margin-bottom: 72px;
    }
    /* Children of .info-bands join the zone grid directly. */
    .info-bands {
      display: contents;
    }
    .bottom-zone .book-band {
      grid-area: book;
      margin-bottom: 0;
    }
    .bottom-zone .book-tile {
      max-width: none;
      height: 100%;
    }
    .band-how {
      grid-area: how;
    }
    .band-box {
      grid-area: box;
    }
    .band-story {
      grid-area: story;
      display: flex;
      flex-direction: column;
    }
    .band-story .story-card {
      max-width: none;
      flex: 1;
      display: grid;
      align-content: center;
    }
    .bottom-zone .band {
      margin-bottom: 0;
    }
    .band-box .box-list {
      grid-template-columns: 1fr;
    }
  }

  .loading,
  .error {
    text-align: center;
    padding: 48px;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
  }

  .error {
    color: var(--semantic-error, #ef4444);
  }

  @media (prefers-reduced-motion: reduce) {
    .hero-cta,
    .deck-tile,
    .book-tile {
      transition: none;
    }
    .hero-cta:hover,
    .deck-tile:hover,
    .book-tile:hover {
      transform: none;
    }
  }

  /* ---------- first-load skeletons ----------
     Reserve the hero fan + each product band so the always-rendered info bands
     stay pinned to the bottom and nothing recomposes while products fetch.
     Geometry matches the real tiles → zero shift when real content lands. */
  .sk-hero-fan {
    display: flex;
    justify-content: center;
    align-items: flex-end;
    padding: 18px 0 10px;
  }
  .sk-hero-card {
    width: clamp(90px, 9vw, 150px);
    aspect-ratio: 5 / 7;
    border-radius: 6px;
    transform-origin: bottom center;
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.35);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
  }
  .sk-hero-card + .sk-hero-card {
    margin-left: calc(-1 * clamp(45px, 4.5vw, 70px));
  }

  /* Product-tile skeleton: same grid as .deck-tile (fan/art box + info column). */
  .sk-tile {
    display: grid;
    grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
    gap: clamp(20px, 3vw, 48px);
    align-items: center;
    padding: clamp(20px, 3vw, 40px);
    border-radius: 24px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
  }
  .sk-tile--book {
    grid-template-columns: minmax(220px, 340px) minmax(0, 1fr);
  }
  @media (max-width: 820px) {
    .sk-tile {
      grid-template-columns: 1fr;
    }
  }

  .sk-box {
    min-height: clamp(240px, 15vw, 420px);
    border-radius: 16px;
    background: radial-gradient(
      circle at 50% 42%,
      rgba(255, 255, 255, 0.05),
      rgba(255, 255, 255, 0.015)
    );
  }

  .sk-info {
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-width: 0;
  }

  .sk-line {
    height: 14px;
    border-radius: 6px;
    background: linear-gradient(
      110deg,
      rgba(255, 255, 255, 0.05) 40%,
      rgba(255, 255, 255, 0.11) 50%,
      rgba(255, 255, 255, 0.05) 60%
    );
    background-size: 220% 100%;
    animation: sk-shimmer 1.4s linear infinite;
  }
  .sk-eyebrow {
    width: 90px;
    height: 10px;
  }
  .sk-title {
    width: 60%;
    height: 30px;
  }
  .sk-meta {
    width: 42%;
  }
  .sk-short {
    width: 78%;
  }
  .sk-price {
    width: 74px;
    height: 30px;
  }

  .sk-buy {
    display: flex;
    align-items: center;
    gap: 20px;
    margin-top: 6px;
  }
  .sk-pill {
    width: 160px;
    height: 44px;
    border-radius: 999px;
    background: linear-gradient(
      110deg,
      rgba(255, 255, 255, 0.05) 40%,
      rgba(255, 255, 255, 0.11) 50%,
      rgba(255, 255, 255, 0.05) 60%
    );
    background-size: 220% 100%;
    animation: sk-shimmer 1.4s linear infinite;
  }

  @keyframes sk-shimmer {
    from {
      background-position: 130% 0;
    }
    to {
      background-position: -90% 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .sk-line,
    .sk-pill {
      animation: none;
    }
  }
</style>
