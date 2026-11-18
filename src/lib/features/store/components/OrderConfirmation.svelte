<!--
  The receipt page. It used to dead-end: a checkmark, two sentences, and a
  button back to a shop that had nothing on it. The confirmation still leads,
  but the rest of the line now sits underneath it — the moment right after a
  purchase is the one moment a buyer is most willing to add to the order.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { trackPurchaseCompleted } from "../analytics/shop-funnel";
  import { getProductLoader } from "../get-product-loader";
  import { deriveCrossSell } from "../domain/catalog-listings";
  import ShopCrossSellRail from "./shell/ShopCrossSellRail.svelte";
  import type { Product } from "../domain/models/product";

  let catalog = $state<Product[]>([]);
  // No current product to exclude: the buyer just left checkout, and what they
  // bought isn't readable client-side here. The whole line is the right rail.
  const crossSell = $derived(deriveCrossSell(catalog, { limit: 3 }));

  // Stripe redirects back with its checkout session id on the query string. No
  // id means this page was opened directly — a bookmark, a back button, a
  // shared link — and not by a completed checkout.
  const sessionId = $derived(page.url.searchParams.get("session_id"));

  // Funnel step 5 — the step that did not exist at all before this. Only a
  // redirect carrying a session id counts as a purchase: the per-session
  // dedupe is keyed on that id, so a null one would slip past it and every
  // direct visit would post another conversion.
  onMount(() => {
    if (sessionId) trackPurchaseCompleted(sessionId);

    void getProductLoader()
      .loadActiveProducts()
      .then((products) => (catalog = products))
      // A missing rail is a missing suggestion, not a broken receipt.
      .catch(() => {});
  });
</script>

<div class="confirmation-page">
  <main class="confirmation-band">
    <section class="receipt">
      {#if sessionId}
        <div class="success-icon">
          <i class="fas fa-check-circle" aria-hidden="true"></i>
        </div>
        <h1>Order Confirmed</h1>
        <p>Your order is on its way. You'll get a receipt from Stripe at the email you provided.</p>
        <p class="note">Orders are packed and shipped within a few business days.</p>
      {:else}
        <!-- Nothing here confirms an order, so nothing here says one happened.
             The page can't ask Stripe about a session it wasn't given. -->
        <span class="kicker">Order status</span>
        <h1>No recent order found</h1>
        <p>If you just completed checkout, the receipt is in your email.</p>
      {/if}
      <a href="/shop" class="back-link">Back to the shop</a>
    </section>

    <ShopCrossSellRail
      entries={crossSell}
      title={sessionId ? "While it ships" : "From the line"}
    />
  </main>
</div>

<style>
  .confirmation-page {
    min-height: 100vh;
    /* px, not rem: this clears the fixed-height SiteHeader, which does not ramp. */
    padding-top: calc(64px + var(--safe-top));
    /* Transparent so the /shop cosmic background shows through (no dark panel). */
    background: transparent;
    color: var(--theme-text, #ffffff);
  }

  /* The same content band every /shop route uses, so the rail lines up with the
     header and footer around it. The receipt itself stays a centred card
     inside it — a receipt shouldn't be 2600px wide. */
  .confirmation-band {
    max-width: var(--shell-w, min(1720px, 92vw));
    margin: 0 auto;
    /* Little bottom padding on purpose: the site footer already carries a
       margin above itself, and stacking both left a strip of empty page
       between the rail and the footer. */
    padding: 3.5rem 1.5rem 0.75rem;
    display: flex;
    flex-direction: column;
    gap: clamp(2.5rem, 4vw, 4.5rem);
  }

  .receipt {
    max-width: 37.5rem;
    margin: 0 auto;
    text-align: center;
  }

  .success-icon {
    font-size: 4rem;
    color: var(--semantic-success, #22c55e);
    margin-bottom: 1.5rem;
  }

  /* Stands in for the checkmark when there is no order: the block keeps its
     shape, so the page doesn't jump between the two states. */
  .kicker {
    display: block;
    margin-bottom: 1rem;
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #b8a6ff;
  }

  h1 {
    font-family: var(--page-title-font, "Fraunces", Georgia, serif);
    font-style: italic;
    font-weight: 700;
    font-variation-settings: "opsz" 144, "wght" 700, "SOFT" 0, "WONK" 1;
    font-size: 2rem;
    margin: 0 0 1rem;
  }

  p {
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
    margin: 0 0 0.5rem;
  }

  .note {
    font-size: var(--font-size-compact, 12px);
    margin-top: 1rem;
  }

  /* A button, not a hyperlink: this is the one action on the page. */
  .back-link {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: var(--min-touch-target, 44px);
    margin-top: 2rem;
    padding: 0 1.5rem;
    background: var(--theme-accent, #60a5fa);
    color: var(--theme-text-on-accent, #fff);
    text-decoration: none;
    border-radius: 0.5rem;
    font-weight: 600;
  }
</style>
