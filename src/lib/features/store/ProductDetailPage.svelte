<!--
  The generic SKU page: whatever the catalog sells that has no bespoke listing
  of its own (the printed guide, one-off decks, future merch). Chrome belongs
  to ShopProductShell; this file resolves the product and renders its art,
  its prop pick, and its sample carousel.
-->
<script lang="ts">
  import "./styles/config-page.css";
  import * as singleBuyCheckoutCreator from "#lib/features/store/services/single-buy-checkout-creator.js";
  import { getProductLoader } from "#lib/features/store/get-product-loader.js";
  import { onMount } from "svelte";
  import { createStoreState } from "./state/store-state.svelte";
  import { setStoreContext } from "./context/store-context";
  import ShopProductShell from "./components/shell/ShopProductShell.svelte";
  import ShopPurchaseCta from "./components/shell/ShopPurchaseCta.svelte";
  import BookCoverArt from "./components/BookCoverArt.svelte";
  import CardMockupPreview from "./components/CardMockupPreview.svelte";
  import SampleCardCarousel from "./components/SampleCardCarousel.svelte";
  import BuyButton from "./components/BuyButton.svelte";
  import LoopChips from "./components/LoopChips.svelte";
  import PropPicker from "./components/PropPicker.svelte";
  import PreorderPriceNote from "./components/PreorderPriceNote.svelte";
  import {
    activePriceCents,
    preorderWindowOpen,
    formatUsd,
  } from "./domain/preorder-pricing";
  import { deriveCrossSell, shelfLabel } from "./domain/catalog-listings";
  import { resolvePurchaseState, SALES_LIVE } from "./domain/purchase-state";
  import type { Product } from "./domain/models/product";
  import { DEFAULT_SHOP_PROP } from "./domain/shop-prop-options";
  import {
    trackProductViewed,
    trackPropSelected,
  } from "./analytics/shop-funnel";
  import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";

  interface Props {
    productId: string;
    /** Seeded by the route load() so the detail renders data-ready and the
        view-transition morph lands cleanly, with no loading-state flash. */
    initialProduct?: Product | null;
  }

  let { productId, initialProduct = null }: Props = $props();

  const store = createStoreState(
    getProductLoader(),
    singleBuyCheckoutCreator,
    initialProduct
  );

  setStoreContext({ state: store });

  let propType = $state<PropType>(DEFAULT_SHOP_PROP);

  // Read once at mount — the swap boundary is a fixed instant, no ticking needed.
  const now = Date.now();
  let formattedPrice = $derived(
    store.selectedProduct
      ? formatUsd(activePriceCents(store.selectedProduct, now))
      : ""
  );

  // The catalog for the cross-sell rail, fetched on its own rather than through
  // store.loadProducts: that call drives store.isLoading, which would flash the
  // shell's loading state over a page the route already seeded data-ready.
  let catalog = $state<Product[]>([]);
  const crossSell = $derived(
    deriveCrossSell(catalog, { currentProductId: store.selectedProduct?.id })
  );

  onMount(() => {
    // Already seeded by the route load(); only fetch if we arrived without it.
    const ready = initialProduct
      ? Promise.resolve()
      : store.loadProduct(productId);
    // Funnel step 1, once per mount. Chained off the load rather than fired
    // immediately so the SKU properties are real on the un-seeded path;
    // loadProduct swallows its own errors, so this still fires if it fails
    // (with nulls) and step 1 never silently goes missing.
    void ready.then(() => trackProductViewed("sku", store.selectedProduct));

    void getProductLoader()
      .loadActiveProducts()
      .then((products) => (catalog = products))
      // A missing rail is a missing suggestion, not a broken product page.
      .catch(() => {});
  });
</script>

<ShopProductShell
  family={store.selectedProduct ? shelfLabel(store.selectedProduct) : undefined}
  title={store.selectedProduct?.name ?? "Product"}
  tagline={store.selectedProduct?.description}
  product={store.selectedProduct ?? undefined}
  propType={store.selectedProduct?.type === "physical-deck" ? propType : undefined}
  listing="sku"
  price={store.selectedProduct ? formattedPrice : undefined}
  checkoutError={store.checkoutError}
  {crossSell}
  loading={store.isLoading}
  loadingLabel="Loading product details..."
  error={store.error ??
    (!store.isLoading && !store.selectedProduct ? "Product not found." : null)}
>
  {#snippet media()}
    {#if store.selectedProduct}
      {@const product = store.selectedProduct}
      {#if product.type === "guide"}
        <!-- The book has no card art; show its typographic cover instead of
             an empty card-mockup box. -->
        <BookCoverArt
          width="clamp(200px, 22vw, 300px)"
          viewTransitionName="shop-book-cover"
        />
      {:else}
        <CardMockupPreview
          coverImageUrl={product.coverImageUrl}
          productName={product.name}
          coverSequence={product.coverSequence}
          coverCards={product.coverCards}
          deckId={product.deckId}
          {propType}
        />
      {/if}
    {/if}
  {/snippet}

  {#snippet configurator()}
    {#if store.selectedProduct}
      {@const product = store.selectedProduct}
      {#if product.loopComponents?.length}
        <LoopChips components={product.loopComponents} />
      {/if}
      {#if product.cardCount}
        <p class="meta">{product.cardCount} cards, poker size (2.5" x 3.5")</p>
      {/if}
      {#if product.type === "physical-deck"}
        <div class="field">
          <span class="field-label">Prop</span>
          <PropPicker
            value={propType}
            onchange={(p) => {
              propType = p;
              trackPropSelected("sku", product.id, p);
            }}
          />
        </div>
      {/if}
    {/if}
  {/snippet}

  {#snippet priceNote()}
    {#if store.selectedProduct && preorderWindowOpen(store.selectedProduct, now)}
      <PreorderPriceNote product={store.selectedProduct} />
    {/if}
  {/snippet}

  {#snippet cta()}
    {#if store.selectedProduct}
      {@const product = store.selectedProduct}
      {@const propArg =
        product.type === "physical-deck" ? propType : undefined}
      <ShopPurchaseCta {product} propType={propArg} listing="sku" />
      <!-- The cart is the second path, and it only exists when there is money
           to take: in the notify state the primary CTA is an email capture, and
           a second "Add to cart" under it would be a button that cannot work. -->
      {#if resolvePurchaseState(product, SALES_LIVE) !== "notify"}
        <BuyButton
          {product}
          propType={propArg}
          mode="add"
          label="Add to cart"
          listing="sku"
        />
      {/if}
    {/if}
  {/snippet}

  {#snippet details()}
    {#if store.selectedProduct?.previewImageUrls?.length}
      <SampleCardCarousel
        imageUrls={store.selectedProduct.previewImageUrls}
        productName={store.selectedProduct.name}
      />
    {/if}
  {/snippet}
</ShopProductShell>

<style>
  /* .field/.field-label are the shared labeled-picker pattern (config-page.css). */
  .meta {
    font-size: var(--font-size-min, 14px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
    margin: 0;
  }
</style>
