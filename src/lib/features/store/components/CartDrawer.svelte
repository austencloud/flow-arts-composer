<!--
  CartDrawer — the /shop cart, wrapping the shared Drawer primitive. Lists cart
  lines with button-based qty steppers (no checkboxes), a subtotal, and a
  Checkout button that hands cart.toCheckoutItems() to createCartCheckout.
  Scoped to /shop; never mounted in app-wide chrome.
-->
<script lang="ts">
  import Drawer from "#lib/shared/foundation/ui/Drawer.svelte";
  import DrawerHeader from "#lib/shared/foundation/ui/DrawerHeader.svelte";
  import type { ShopCart } from "../state/shop-cart.svelte";
  import { getCartCheckoutCreator } from "../get-cart-checkout-creator";
  import { trackCheckoutStarted } from "../analytics/shop-funnel";

  interface Props {
    cart: ShopCart;
    open: boolean;
    onClose: () => void;
  }
  let { cart, open, onClose }: Props = $props();

  let isCheckingOut = $state(false);
  let error = $state<string | null>(null);

  const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  async function checkout() {
    if (cart.count === 0) return;
    isCheckingOut = true;
    error = null;
    try {
      const url = await getCartCheckoutCreator().createCartCheckoutSession(
        cart.toCheckoutItems()
      );
      // Funnel step 4, cart path. This never touches store-state.svelte.ts, so
      // it needs its own call. product_id stays null — a cart is multi-line by
      // definition; line_item_count and subtotal describe it instead.
      // is_preorder is true if ANY line is one: a mixed cart still can't ship
      // until the preorder does, so the buyer is in the preorder cohort.
      trackCheckoutStarted({
        surface: "cart_drawer",
        lineItemCount: cart.count,
        subtotalCents: cart.subtotal,
        isPreorder: cart.lines.some((line) => line.preorder === true),
      });
      window.location.href = url;
    } catch (e) {
      error = "Checkout isn't available right now. Try again in a moment.";
      console.error("[Cart] checkout failed:", e);
    } finally {
      isCheckingOut = false;
    }
  }
</script>

<Drawer isOpen={open} placement="right" ariaLabel="Your cart" onclose={onClose}>
  <DrawerHeader title="Your cart" onClose={onClose} />
  {#if cart.count === 0}
    <p class="empty">Your cart is empty.</p>
  {:else}
    <ul class="lines">
      {#each cart.lines as line (line.key)}
        <li class="line">
          <div class="line-main">
            <span class="line-name">{line.name}</span>
            <span class="line-price">{money(line.unitPrice * line.qty)}</span>
          </div>
          <div class="line-controls">
            {#if line.kind === "sku"}
              <button
                class="qty-btn"
                aria-label="Decrease quantity"
                onclick={() => cart.setQty(line.key, line.qty - 1)}
              >−</button>
              <span class="qty" aria-live="polite">{line.qty}</span>
              <button
                class="qty-btn"
                aria-label="Increase quantity"
                onclick={() => cart.setQty(line.key, line.qty + 1)}
              >+</button>
            {:else}
              <span class="qty-fixed">Configured deck</span>
            {/if}
            <button
              class="remove-btn"
              aria-label="Remove from cart"
              onclick={() => cart.remove(line.key)}
            ><i class="fas fa-trash" aria-hidden="true"></i></button>
          </div>
        </li>
      {/each}
    </ul>

    <div class="summary">
      <div class="subtotal-row">
        <span>Subtotal</span>
        <span class="subtotal">{money(cart.subtotal)}</span>
      </div>
      <p class="ship-note">Shipping + tax calculated at checkout.</p>
      {#if error}<p class="error">{error}</p>{/if}
      <button class="checkout-btn" disabled={isCheckingOut} onclick={checkout}>
        {isCheckingOut ? "Opening checkout..." : "Checkout"}
      </button>
    </div>
  {/if}
</Drawer>

<style>
  .empty { padding: 32px 20px; text-align: center; color: var(--theme-text-muted, rgba(255,255,255,0.6)); }
  .lines { list-style: none; margin: 0; padding: 8px 16px; display: flex; flex-direction: column; gap: 12px; }
  .line { display: flex; flex-direction: column; gap: 8px; padding: 12px; border-radius: 12px;
    background: var(--theme-card-bg, rgba(255,255,255,0.04));
    border: 1px solid var(--theme-stroke, rgba(255,255,255,0.1)); }
  .line-main { display: flex; justify-content: space-between; gap: 12px; font-weight: 600; }
  .line-price { font-variant-numeric: tabular-nums; }
  .line-controls { display: flex; align-items: center; gap: 8px; }
  .qty-btn { width: 44px; height: 44px; border-radius: 10px; border: none; cursor: pointer;
    font-size: 20px; font-weight: 700; background: var(--theme-accent, #60a5fa);
    color: var(--theme-text-on-accent, #fff); }
  .qty { min-width: 2ch; text-align: center; font-variant-numeric: tabular-nums; }
  .qty-fixed { font-size: 14px; color: var(--theme-text-muted, rgba(255,255,255,0.6)); }
  .remove-btn { margin-left: auto; width: 44px; height: 44px; border-radius: 10px; cursor: pointer;
    border: 1px solid var(--theme-stroke, rgba(255,255,255,0.12)); background: transparent;
    color: var(--theme-text-muted, rgba(255,255,255,0.6)); }
  .summary { padding: 16px; display: flex; flex-direction: column; gap: 8px;
    border-top: 1px solid var(--theme-stroke, rgba(255,255,255,0.1)); }
  .subtotal-row { display: flex; justify-content: space-between; font-weight: 700; }
  .subtotal { font-variant-numeric: tabular-nums; }
  .ship-note { margin: 0; font-size: 12px; color: var(--theme-text-muted, rgba(255,255,255,0.6)); }
  .error { margin: 0; font-size: 14px; color: var(--semantic-error, #ef4444); }
  .checkout-btn { margin-top: 8px; padding: 16px; border: none; border-radius: 12px; cursor: pointer;
    font-size: 18px; font-weight: 700; background: var(--theme-accent, #60a5fa);
    color: var(--theme-text-on-accent, #fff); }
  .checkout-btn:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
