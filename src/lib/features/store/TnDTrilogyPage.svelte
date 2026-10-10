<!--
  Timing & Direction trilogy: ONE listing over the TKA 1/2/3 volume SKUs
  (products with listing === "tnd-trilogy"). Buyer picks a volume, sees the
  real color-coded printed cards fan + element legend, and buys the resolved
  SKU. The all-three package renders as a visible option, gated until it has a
  price.

  Chrome (back link, title, price, CTA, assurances, cross-sell, page states)
  belongs to ShopProductShell. This file brings the volumes, the fan, and the
  pickers.
-->
<script lang="ts">
  import "./styles/config-page.css";
  import * as singleBuyCheckoutCreator from "#lib/features/store/services/single-buy-checkout-creator.js";
  import { getProductLoader } from "#lib/features/store/get-product-loader.js";
  import { createStoreState } from "./state/store-state.svelte";
  import { setStoreContext } from "./context/store-context";
  import ShopProductShell from "./components/shell/ShopProductShell.svelte";
  import DeckFanCover from "./components/DeckFanCover.svelte";
  import PropPicker from "./components/PropPicker.svelte";
  import CardAnatomyExplainer from "./components/CardAnatomyExplainer.svelte";
  import PreorderPriceNote from "./components/PreorderPriceNote.svelte";
  import { activePriceCents, preorderWindowOpen, formatUsd } from "./domain/preorder-pricing";
  import { deriveCrossSell } from "./domain/catalog-listings";
  import Crossfade from "#lib/shared/components/Crossfade.svelte";
  import { TND_ELEMENTS } from "#lib/features/choreo-card/domain/tnd-element.js";
  import { prewarmCovers } from "./services/cover-front-renderer";
  import { DEFAULT_SHOP_PROP } from "./domain/shop-prop-options";
  import { trackPropSelected } from "./analytics/shop-funnel";
  import { trackViewOnceLoaded } from "./analytics/shop-funnel-view.svelte";
  import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";

  // Named `store`, not `state`: a local binding called `state` collides with the
  // $state rune (svelte store_rune_conflict).
  const store = createStoreState(getProductLoader(), singleBuyCheckoutCreator);
  setStoreContext({ state: store });
  store.loadProducts(false);

  const volumes = $derived(
    store.products
      .filter((p) => p.listing === "tnd-trilogy" && p.status === "active")
      .sort((a, b) => a.sortOrder - b.sortOrder)
  );

  let selectedId = $state<string | null>(null);
  const selected = $derived(
    volumes.find((p) => p.id === selectedId) ?? volumes[0] ?? null
  );

  let propType = $state<PropType>(DEFAULT_SHOP_PROP);

  // Funnel step 1, once the volume list settles so the resolved SKU is real.
  trackViewOnceLoaded("tnd-trilogy", () => store.isLoading, () => selected);

  // ONE worker seed covering every volume's covers for the picked prop (see
  // cover-front-renderer). Baked covers skip this; it backs live fallbacks.
  $effect(() => {
    const all = volumes.flatMap((p) => p.coverCards ?? []);
    if (all.length) prewarmCovers(all, propType);
  });

  // Read once — the preorder→regular boundary is a fixed instant, no ticking.
  const now = Date.now();
  const price = $derived(
    selected ? formatUsd(activePriceCents(selected, now)) : "$30"
  );

  // The rest of the line, minus every volume of this trilogy.
  const crossSell = $derived(
    deriveCrossSell(store.products, { currentListing: "tnd-trilogy" })
  );

  const ASSURANCES = [
    {
      icon: "fas fa-box-open",
      text: "Free laminated quick-reference sheet and deck box included",
    },
    {
      icon: "fas fa-hand-holding-heart",
      text: "Beta run: printed and cut by hand in Chicago, small batches",
    },
  ];

  // The anatomy diagram runs on a real card from the volume in view, so the
  // parts it labels are the parts of the deck being bought. Absent (catalog
  // still loading), the explainer falls back to its own catalog example.
  const anatomyCard = $derived(selected?.coverCards?.[0]);

  // "TKA 1: Learning Letters" -> ["TKA 1", "Learning Letters"]
  const nameParts = (name: string): [string, string] => {
    const i = name.indexOf(":");
    return i > 0 ? [name.slice(0, i), name.slice(i + 1).trim()] : [name, ""];
  };

  // Roving radiogroup: arrows move selection, exactly one option tabbable.
  function onPickerKeydown(e: KeyboardEvent) {
    if (!selected || volumes.length === 0) return;
    const idx = volumes.findIndex((v) => v.id === selected.id);
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (idx + 1) % volumes.length;
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (idx - 1 + volumes.length) % volumes.length;
    const target = next >= 0 ? volumes[next] : undefined;
    if (!target) return;
    e.preventDefault();
    selectedId = target.id;
    document.getElementById(`volume-${target.id}`)?.focus();
  }
</script>

<ShopProductShell
  family={"Timing & Direction"}
  eyebrow="The trilogy"
  title={"Timing & Direction"}
  tagline="Three volumes, one system: every card color-coded by its timing and direction family."
  mediaHeight="clamp(320px, 34vw, 430px)"
  product={selected ?? undefined}
  {propType}
  listing="tnd-trilogy"
  price={selected ? price : undefined}
  checkoutError={store.checkoutError}
  {crossSell}
  assurances={ASSURANCES}
  loading={store.isLoading && volumes.length === 0}
  loadingLabel="Loading the trilogy..."
  error={store.error ??
    (!store.isLoading && !selected ? "The trilogy isn't available right now." : null)}
>
  {#snippet media()}
    {#if selected}
      <div class="stage">
        <Crossfade key={`${selected.id}|${propType}`}>
          <div class="stage-inner">
            <!-- All six element families, always. -->
            <DeckFanCover
              cards={selected.coverCards ?? []}
              deckName={selected.name}
              {propType}
              cardWidth={150}
              maxCardWidth={280}
              exactCount={Math.min(6, (selected.coverCards ?? []).length)}
              viewTransitionName="shop-fan-tnd-trilogy"
            />
            <p class="stage-desc">{selected.description}</p>
          </div>
        </Crossfade>

        <div class="legend" aria-label="Element color legend">
          {#each TND_ELEMENTS as el (el.familyId)}
            <span class="legend-item">
              <span class="legend-dot" style:--c={el.accentColor}></span>
              <span>{el.name}</span>
            </span>
          {/each}
        </div>
      </div>
    {/if}
  {/snippet}

  {#snippet configurator()}
    {#if selected}
      <div class="field">
        <span class="field-label" id="volume-label">Volume</span>
        <div class="volume-grid" role="radiogroup" aria-labelledby="volume-label">
          {#each volumes as volume (volume.id)}
            {@const active = volume.id === selected.id}
            {@const [num, title] = nameParts(volume.name)}
            <button
              type="button"
              id="volume-{volume.id}"
              class="volume-option"
              class:active
              role="radio"
              aria-checked={active}
              tabindex={active ? 0 : -1}
              onclick={() => (selectedId = volume.id)}
              onkeydown={onPickerKeydown}
            >
              <span class="volume-num">{num}</span>
              <span class="volume-title">{title}</span>
              <span class="volume-meta">{volume.cardCount} cards · {formatUsd(activePriceCents(volume, now))}</span>
            </button>
          {/each}
          <!-- Package option: visible so the offer is legible, gated until priced. -->
          <div class="volume-option package" aria-disabled="true">
            <span class="volume-num">All three</span>
            <span class="volume-title">The complete trilogy</span>
            <span class="volume-meta">bundle pricing coming soon</span>
          </div>
        </div>
      </div>

      <div class="field">
        <span class="field-label" id="prop-label">Prop</span>
        <PropPicker
          value={propType}
          onchange={(p) => {
            propType = p;
            trackPropSelected("tnd-trilogy", selected?.id, p);
          }}
        />
      </div>
    {/if}
  {/snippet}

  {#snippet priceNote()}
    {#if selected && preorderWindowOpen(selected, now)}
      <PreorderPriceNote product={selected} />
    {/if}
  {/snippet}

  <!-- Absorbed from the retired /shop/choreography-cards explainer: the card
       anatomy diagram and what the printed QR does. It sits on the product
       pages now, where someone is deciding whether to buy this deck. -->
  {#snippet howItWorks()}
    <span class="section-kicker">How it works</span>
    <h2 class="section-title">What's on the card</h2>
    <p class="section-body">
      Every card in the trilogy holds one sequence. Scan the code in the corner and
      that sequence opens in the app, where you can watch it with any prop at any
      speed, save it to your catalog, and practice it a step at a time.
    </p>
    <p class="section-body">
      The trilogy is the curated half of the line: organized by timing and direction,
      the same in every copy, so you can learn it and reference it deliberately.
    </p>
    <p class="section-hint">
      Tap or point at any part of the card, or any row in the list. Its match lights up.
    </p>
    <CardAnatomyExplainer card={anatomyCard} showShuffle={false} />
    <p class="section-note">
      That QR code is live. Scan it with your phone and this card's sequence opens.
    </p>
  {/snippet}
</ShopProductShell>

<style>
  /* The stage BOX is the shell's (border, radius, padding, reserved height).
     This is only what goes inside it. */
  .stage {
    width: 100%;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  .stage-inner {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .stage-desc {
    font-size: var(--font-size-min, 14px);
    line-height: 1.65;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.75));
    margin: 0;
    text-align: center;
    align-self: center;
  }

  .legend {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 10px 16px;
    margin-top: 14px;
  }
  .legend-item {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.7));
  }
  .legend-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--c);
    border: 1px solid rgba(255, 255, 255, 0.35);
  }

  /* .field/.field-label are shared with StarterPackPage and live in
     config-page.css. */
  .volume-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 10px;
  }

  .volume-option {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    min-height: var(--min-touch-target, 44px);
    padding: 12px 14px;
    border-radius: 12px;
    border: 2px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    color: var(--theme-text, #fff);
    cursor: pointer;
    text-align: left;
    transition: border-color 0.15s ease, background 0.15s ease;
    font-family: inherit;
  }
  .volume-option:hover:not(.package) {
    border-color: var(--theme-border-strong, rgba(255, 255, 255, 0.3));
  }
  .volume-option.active {
    border-color: #8b6cff;
    background: rgba(139, 108, 255, 0.12);
  }
  .volume-option:focus-visible {
    outline: 2px solid #fff;
    outline-offset: 2px;
  }
  .volume-option.package {
    opacity: 0.55;
    cursor: default;
  }

  .volume-num {
    font-size: var(--font-size-compact, 12px);
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #b8a6ff;
  }
  .volume-title {
    font-size: var(--font-size-min, 14px);
    font-weight: 700;
  }
  .volume-meta {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
    font-variant-numeric: tabular-nums;
  }

  @media (prefers-reduced-motion: reduce) {
    .volume-option {
      transition: none;
    }
  }
</style>
