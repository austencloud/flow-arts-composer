<!--
  The Starter Pack: ONE bundle listing (product with listing === "starter-pack")
  — trilogy + curated mixed LOOP deck + the book + boxes + waterproof holder.
  Single SKU, no dials except the print-prop choice. The fan composes from the
  OTHER products' cover cards (a mixed hand: LOOP flavors + trilogy elements),
  so the pack needs no baked covers of its own.

  Chrome (back link, title, price, CTA, assurances, cross-sell, page states)
  belongs to ShopProductShell. This file brings the bundle, its gallery, and
  the prop pick.
-->
<script lang="ts">
  import "./styles/config-page.css";
  import { untrack } from "svelte";
  import * as singleBuyCheckoutCreator from "$lib/features/store/services/single-buy-checkout-creator";
  import { getProductLoader } from "$lib/features/store/get-product-loader";
  import { createStoreState } from "./state/store-state.svelte";
  import { setStoreContext } from "./context/store-context";
  import ShopProductShell from "./components/shell/ShopProductShell.svelte";
  import DeckFanCover from "./components/DeckFanCover.svelte";
  import BookCoverArt from "./components/BookCoverArt.svelte";
  import SleeveArt from "./components/SleeveArt.svelte";
  import PropPicker from "./components/PropPicker.svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import Crossfade from "$lib/shared/components/Crossfade.svelte";
  import { prewarmCovers } from "./services/cover-front-renderer";
  import { formatUsd } from "./domain/preorder-pricing";
  import { deriveCrossSell } from "./domain/catalog-listings";
  import { DEFAULT_SHOP_PROP } from "./domain/shop-prop-options";
  import { trackPropSelected } from "./analytics/shop-funnel";
  import { trackViewOnceLoaded } from "./analytics/shop-funnel-view.svelte";
  import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import type { Product } from "./domain/models/product";

  interface Props {
    /** The server's catalog snapshot, so the first HTML is the real page. */
    seedProducts?: readonly Product[];
  }

  let { seedProducts = [] }: Props = $props();

  // Named `store`, not `state`: a local binding called `state` collides with the
  // $state rune (svelte store_rune_conflict).
  const store = createStoreState(getProductLoader(), singleBuyCheckoutCreator);
  setStoreContext({ state: store });
  store.loadProducts(false, untrack(() => seedProducts));

  const pack = $derived(
    store.products.find(
      (p) => p.listing === "starter-pack" && p.status === "active"
    ) ?? null
  );

  // Cover pools: one card per LOOP flavor, and the trilogy's six element cards.
  // No pack-specific bake needed — everything reuses the other listings' covers.
  const loopCards = $derived(
    store.products
      .filter((p) => p.listing === "loop-deck" && p.status === "active")
      .map((p) => p.coverCards?.[0])
      .filter((c): c is NonNullable<typeof c> => c != null)
  );
  const tndCards = $derived(
    store.products.find(
      (p) => p.listing === "tnd-trilogy" && p.status === "active"
    )?.coverCards ?? []
  );
  // The pile slide's mixed hand: half LOOP, half color-coded trilogy.
  const fanCards = $derived([...loopCards.slice(0, 3), ...tndCards.slice(0, 3)]);

  // Gallery: show each thing in the box, plus the whole pile together.
  type Slide = "pile" | "loop" | "tnd" | "guide" | "holder";
  let slide = $state<Slide>("pile");
  const slideOptions: { value: Slide; label: string }[] = [
    { value: "pile", label: "The lot" },
    { value: "loop", label: "LOOP deck" },
    { value: "tnd", label: "Trilogy" },
    { value: "guide", label: "The book" },
    { value: "holder", label: "Holder" },
  ];

  let propType = $state<PropType>(DEFAULT_SHOP_PROP);

  // Funnel step 1, once the bundle SKU resolves so price/preorder are real.
  trackViewOnceLoaded("starter-pack", () => store.isLoading, () => pack);

  // ONE worker seed for every fan's covers at the picked prop (live fallback
  // only — baked covers load straight from Storage).
  $effect(() => {
    const all = [...loopCards, ...tndCards];
    if (all.length) prewarmCovers(all, propType);
  });

  const price = $derived(pack ? formatUsd(pack.price) : "$65");

  // Everything else on the shelf. The pack contains most of it, which is the
  // point: a buyer who isn't ready for the whole box can pick one piece.
  const crossSell = $derived(
    deriveCrossSell(store.products, { currentListing: "starter-pack" })
  );

  const ASSURANCES = [
    {
      icon: "fas fa-hand-holding-heart",
      text: "Beta run: printed and cut by hand in Chicago, small batches",
    },
  ];
</script>

<ShopProductShell
  family="Bundles"
  eyebrow="Everything to start"
  title={pack?.name ?? "Starter Pack"}
  tagline="The whole system in one box: the teaching trilogy, a mixed LOOP deck, the book, and the gear to carry it."
  mediaHeight="clamp(400px, 40vw, 480px)"
  product={pack ?? undefined}
  {propType}
  listing="starter-pack"
  price={pack ? price : undefined}
  checkoutError={store.checkoutError}
  {crossSell}
  assurances={ASSURANCES}
  loading={store.isLoading && !pack}
  loadingLabel="Loading the starter pack..."
  error={store.error ??
    (!store.isLoading && !pack ? "The starter pack isn't available right now." : null)}
>
  {#snippet media()}
    {#if pack}
      <!-- fill mode: the stage is the sized box; layers stack absolutely
           inside it, so slide swaps can NEVER resize the stage or shove the
           picker/description below (crossfade-primitive routing). -->
      <div class="stage">
        <Crossfade key={`${slide}|${propType}`} fill>
          <div class="stage-inner">
            {#if slide === "pile"}
              <!-- Everything together: mixed fan with the book + holder
                   stand-ins tucked beside it. -->
              <div class="pile">
                <div class="pile-fan">
                  <DeckFanCover
                    cards={fanCards}
                    deckName={pack.name}
                    {propType}
                    cardWidth={140}
                    maxCardWidth={250}
                    exactCount={Math.min(6, fanCards.length)}
                  />
                </div>
                <div class="pile-side">
                  <BookCoverArt width="clamp(96px, 7vw, 140px)" />
                  <SleeveArt width="clamp(90px, 6.5vw, 130px)" />
                </div>
              </div>
            {:else if slide === "loop"}
              <DeckFanCover
                cards={loopCards}
                deckName="LOOP Deck"
                {propType}
                cardWidth={150}
                maxCardWidth={280}
                exactCount={Math.min(6, loopCards.length)}
              />
            {:else if slide === "tnd"}
              <!-- The full six-element rainbow. -->
              <DeckFanCover
                cards={tndCards}
                deckName="Timing & Direction"
                {propType}
                cardWidth={150}
                maxCardWidth={280}
                exactCount={Math.min(6, tndCards.length)}
              />
            {:else if slide === "guide"}
              <div class="solo-art">
                <BookCoverArt width="clamp(180px, 15vw, 250px)" />
              </div>
            {:else}
              <div class="solo-art">
                <SleeveArt width="clamp(170px, 14vw, 230px)" />
              </div>
            {/if}
          </div>
        </Crossfade>
      </div>

      <!-- Static, outside the crossfade: identical on every slide, so it
           never remounts and never moves. -->
      <p class="stage-desc">{pack.description}</p>

      <div class="slide-picker">
        <SegmentedControl
          options={slideOptions}
          value={slide}
          onchange={(s) => (slide = s)}
          color="accent"
          size="sm"
        />
      </div>
    {/if}
  {/snippet}

  {#snippet configurator()}
    {#if pack}
      {#if pack.boxContents?.length}
        <div class="field">
          <span class="field-label">What's in the box</span>
          <ul class="box-list">
            {#each pack.boxContents as item (item)}
              <li>
                <i class="fas fa-check" aria-hidden="true"></i>
                {item}
              </li>
            {/each}
          </ul>
        </div>
      {/if}

      <div class="field">
        <span class="field-label" id="prop-label">Prop</span>
        <PropPicker
          value={propType}
          onchange={(p) => {
            propType = p;
            trackPropSelected("starter-pack", pack?.id, p);
          }}
        />
      </div>
    {/if}
  {/snippet}
</ShopProductShell>

<style>
  /* The stage BOX is the shell's (border, radius, padding, reserved height).
     The fixed height here is what the fill-mode crossfade measures against:
     its layers stack absolutely, so no slide can resize the box. Width flows
     downward on purpose — the fan sizes its cards FROM its container width
     (bind:clientWidth), so a shrink-to-fit stage creates a
     measure→resize→measure oscillation. */
  .stage {
    width: 100%;
    height: clamp(340px, 34vw, 420px);
  }

  .stage-inner {
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: stretch;
  }

  .pile {
    width: 100%;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: clamp(12px, 1.5vw, 24px);
    align-items: center;
  }
  .pile-fan {
    min-width: 0;
  }
  .pile-side {
    display: flex;
    flex-direction: column;
    gap: 18px;
    align-items: center;
  }
  @media (max-width: 640px) {
    .pile {
      grid-template-columns: 1fr;
    }
    .pile-side {
      flex-direction: row;
      justify-content: center;
    }
  }

  .solo-art {
    display: grid;
    place-items: center;
    padding: 12px 0;
  }

  .slide-picker {
    display: flex;
    justify-content: center;
    margin-top: 14px;
  }

  .stage-desc {
    font-size: var(--font-size-min, 14px);
    line-height: 1.65;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.75));
    margin: 14px auto 0;
    text-align: center;
    max-width: 56ch;
  }

  /* .field/.field-label are shared with TnDTrilogyPage and live in
     config-page.css. */
  .box-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 8px;
  }
  .box-list li {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    border-radius: 12px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    font-size: var(--font-size-min, 14px);
  }
  .box-list i {
    color: #8b6cff;
    flex: 0 0 auto;
  }
</style>
