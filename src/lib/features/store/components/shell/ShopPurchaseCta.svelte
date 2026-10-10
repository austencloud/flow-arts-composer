<!--
  The buy area, rendered from the purchase-state resolver instead of from each
  page's own idea of what's for sale. Three honest outcomes: charge now, charge
  now for something that ships later, or take an email because we can't charge
  at all yet. A page never sees a Buy button that would fail on click.
-->
<script lang="ts">
  import type { Product } from "../../domain/models/product";
  import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import type { LoopConfig } from "../../domain/loop-config";
  import type { ShopListing } from "../../analytics/shop-funnel";
  import {
    resolvePurchaseState,
    purchaseCtaLabel,
    SALES_LIVE,
    type PurchaseState,
  } from "../../domain/purchase-state";
  import BuyButton from "../BuyButton.svelte";
  import WaitlistForm from "../WaitlistForm.svelte";

  interface Props {
    product: Product;
    /** Buyer's print-prop pick, carried into checkout metadata. */
    propType?: PropType;
    /** LOOP configurator dials, carried into checkout metadata. */
    loopConfig?: LoopConfig;
    /** Which entry page this sits on — the funnel's step-3 breakdown. */
    listing?: ShopListing;
    /** "buy" goes straight to checkout, "add" pushes to the cart. */
    mode?: "buy" | "add";
    /** Override the resolved state (harnesses and previews). */
    state?: PurchaseState;
    /** Sentence above the email capture in the notify state. */
    notifyText?: string;
  }

  let {
    product,
    propType,
    loopConfig,
    listing = "sku",
    mode = "buy",
    state,
    notifyText = "Not on sale yet. Leave an email and you'll hear the moment it is.",
  }: Props = $props();

  const purchaseState = $derived(state ?? resolvePurchaseState(product, SALES_LIVE));
</script>

{#if purchaseState === "notify"}
  <div class="notify">
    <p class="notify-line">
      <i class="fas fa-hourglass-half" aria-hidden="true"></i>
      {notifyText}
    </p>
    <WaitlistForm
      source="shop-product-{product.id}"
      compact
      confirmText="You're on the list for this one."
    />
  </div>
{:else}
  <BuyButton
    {product}
    {propType}
    {loopConfig}
    {listing}
    {mode}
    label={purchaseCtaLabel(purchaseState, mode)}
  />
  {#if purchaseState === "preorder" && product.shipBy}
    <p class="ships">Ships {product.shipBy}.</p>
  {/if}
{/if}

<style>
  .notify {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 1rem;
    border-radius: 0.75rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
  }

  .notify-line {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    margin: 0;
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    color: var(--theme-text, #fff);
  }
  .notify-line i {
    color: var(--theme-warning, #f59e0b);
  }

  .ships {
    margin: 0;
    font-size: var(--font-size-min, 14px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.66));
    font-variant-numeric: tabular-nums;
  }
</style>
