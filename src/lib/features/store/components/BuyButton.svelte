<!--
  Buy CTA with an availability gate: a product with no Stripe price is NOT
  purchasable, so instead of a Buy Now that spins and errors after the click,
  it renders an honest "not on sale yet" state with the shared waitlist form.
-->
<script lang="ts">
  import { getStoreContext } from "../context/store-context";
  import type { Product } from "../domain/models/product";
  import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import type { LoopConfig } from "../domain/loop-config";
  import { getShopCart } from "../state/shop-cart.svelte";
  import { trackAddToCart, type ShopListing } from "../analytics/shop-funnel";
  import WaitlistForm from "./WaitlistForm.svelte";

  interface Props {
    product: Product;
    /** Buyer's print-prop pick (decks). Rides into checkout metadata. */
    propType?: PropType;
    /** LOOP configurator dials (level/length/flavor). Rides into metadata. */
    loopConfig?: LoopConfig;
    /** CTA text ("Preorder now" for preorder listings). */
    label?: string;
    /** Waitlist framing while the product has no Stripe price yet. */
    waitlistText?: string;
    /** "buy" = direct checkout (conversion primary). "add" = push to cart. */
    mode?: "buy" | "add";
    /** Which entry page this button sits on — the funnel's step-3 breakdown.
     *  Defaults to the plain SKU detail page, the only host that isn't a
     *  configurator listing. */
    listing?: ShopListing;
  }

  let {
    product,
    propType,
    loopConfig,
    label = "Buy Now",
    waitlistText = "Not on sale yet. Leave an email and you'll hear the moment it is.",
    mode = "buy",
    listing = "sku",
  }: Props = $props();
  const { state } = getStoreContext();

  const available = $derived(Boolean(product.stripePriceId));

  function addToCart() {
    const cart = getShopCart();
    if (loopConfig) {
      cart.add({
        kind: "loopDeck",
        productId: product.id,
        name: product.name,
        unitPrice: product.price,
        stripePriceId: product.stripePriceId,
        qty: 1,
        ...(propType && { propType }),
        ...(product.preorder && { preorder: true }),
        loopConfig,
        // Distinct configs must not collapse; JSON of the config is a stable key.
        configKey: JSON.stringify(loopConfig) + (propType ?? ""),
      });
    } else {
      cart.add({
        kind: "sku",
        productId: product.id,
        name: product.name,
        unitPrice: product.price,
        stripePriceId: product.stripePriceId,
        qty: 1,
        ...(propType && { propType }),
        ...(product.preorder && { preorder: true }),
      });
    }
    // Funnel step 3, fired AFTER the mutation it describes. Tracked here rather
    // than in shop-cart's add(): the cart has no product or page context, this
    // button holds all three.
    trackAddToCart({ listing, product, propType, loopConfig });
  }
</script>

{#if available}
  <button
    class="buy-button"
    onclick={() => (mode === "add" ? addToCart() : state.startCheckout(product.id, propType, loopConfig))}
    disabled={mode === "buy" && state.isCheckingOut}
  >
    {#if mode === "buy" && state.isCheckingOut}
      <span class="spinner" aria-hidden="true"></span>
      Opening checkout...
    {:else}
      {label}
    {/if}
  </button>
{:else}
  <div class="unavailable">
    <p class="unavailable-line">
      <i class="fas fa-hourglass-half" aria-hidden="true"></i>
      {waitlistText}
    </p>
    <WaitlistForm
      source="shop-product-{product.id}"
      compact
      confirmText="You're on the list for this one."
    />
  </div>
{/if}

<style>
  .buy-button {
    width: 100%;
    padding: 16px 32px;
    font-size: var(--font-size-lg, 18px);
    font-weight: 700;
    border: none;
    border-radius: 12px;
    background: var(--theme-accent, #60a5fa);
    color: var(--theme-text-on-accent, #fff);
    cursor: pointer;
    /* Compositor-only: only transform animates per interaction frame. */
    transition: transform 0.12s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s;
    will-change: transform;
  }

  .buy-button:hover:not(:disabled) {
    opacity: 0.95;
    transform: translateY(-2px);
  }

  .buy-button:active:not(:disabled) {
    transform: translateY(0) scale(0.98);
    transition-duration: 0.06s;
  }

  .buy-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .spinner {
    display: inline-block;
    width: 1em;
    height: 1em;
    margin-right: 0.5em;
    vertical-align: -0.15em;
    border: 2px solid currentColor;
    border-right-color: transparent;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .unavailable {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 16px;
    border-radius: 12px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
  }

  .unavailable-line {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0;
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    color: var(--theme-text, #fff);
  }
  .unavailable-line i {
    color: var(--theme-warning, #f59e0b);
  }

  @media (prefers-reduced-motion: reduce) {
    .buy-button {
      transition: none;
    }
    .buy-button:hover:not(:disabled),
    .buy-button:active:not(:disabled) {
      transform: none;
    }
    .spinner {
      animation-duration: 1.4s;
    }
  }
</style>
