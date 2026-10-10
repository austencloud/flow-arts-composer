<script lang="ts">
  // The cosmic background, SiteHeader, and cosmic theme tokens for every /shop
  // route come from the persistent MarketingChrome (root layout). This layout
  // adds the shop-scoped cart affordance (button + drawer) — deliberately NOT
  // in the app-wide nav.
  import CartButton from "#lib/features/store/components/CartButton.svelte";
  import CartDrawer from "#lib/features/store/components/CartDrawer.svelte";
  import { getShopCart } from "#lib/features/store/state/shop-cart.svelte.js";

  let { children } = $props();
  const cart = getShopCart();
  let cartOpen = $state(false);
</script>

<div class="shop-cart-affordance">
  <CartButton {cart} onOpen={() => (cartOpen = true)} />
</div>

{@render children()}

<CartDrawer {cart} open={cartOpen} onClose={() => (cartOpen = false)} />

<style>
  /* Floats over the shop content, clear of the fixed SiteHeader. Shop-scoped. */
  .shop-cart-affordance {
    position: fixed;
    top: calc(64px + env(safe-area-inset-top, 0px) + 8px);
    right: calc(16px + env(safe-area-inset-right, 0px));
    z-index: 40;
  }
</style>
