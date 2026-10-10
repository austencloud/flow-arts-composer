<script lang="ts">
  // Standalone harness for ShopProductShell (shop unification, phase 1). No
  // Firestore, no Stripe: fixture products and stub services, so the shell's
  // chrome can be looked at on its own before any real product page is re-seated
  // onto it in phase 3.
  //
  // The wrapper carries `mkt-shell` because every real /shop route runs inside
  // MarketingChrome. It gives this harness the same public-shell selectors and
  // composition context as the shipped route.
  import ShopProductShell from "#lib/features/store/components/shell/ShopProductShell.svelte";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import { createStoreState } from "#lib/features/store/state/store-state.svelte.js";
  import { setStoreContext } from "#lib/features/store/context/store-context.js";
  import { deriveCrossSell } from "#lib/features/store/domain/catalog-listings.js";
  import { formatUsd } from "#lib/features/store/domain/preorder-pricing.js";
  import type { PurchaseState } from "#lib/features/store/domain/purchase-state.js";
  import type { Product } from "#lib/features/store/domain/models/product.js";

  function fixture(overrides: Partial<Product> = {}): Product {
    return {
      id: "fixture",
      name: "Fixture",
      description: "",
      type: "physical-deck",
      price: 3500,
      stripePriceId: "price_fixture",
      status: "active",
      previewImageUrls: [],
      sortOrder: 0,
      ...overrides,
    };
  }

  const loopDeck = fixture({
    id: "loop-deck-fixture",
    name: "LOOP Deck",
    listing: "loop-deck",
    description:
      "54 cards built to your dials. Every sequence ends exactly where it began.",
    price: 3500,
    preorder: true,
    shipBy: "September 2026",
    sortOrder: 1,
  });

  const catalog: Product[] = [
    loopDeck,
    fixture({
      id: "tnd-1",
      name: "TKA 1: Learning Letters",
      listing: "tnd-trilogy",
      description: "The teaching line: base motions, color-coded by element.",
      price: 3000,
      sortOrder: 5,
    }),
    fixture({
      id: "tnd-2",
      name: "TKA 2: One Turn",
      listing: "tnd-trilogy",
      description: "One-turn variations across all six element families.",
      price: 3000,
      sortOrder: 6,
    }),
    fixture({
      id: "starter-pack",
      name: "Starter Pack",
      listing: "starter-pack",
      type: "sampler-pack",
      description: "The trilogy, a LOOP deck, the printed guide, and a holder.",
      price: 12000,
      sortOrder: 8,
    }),
    fixture({
      id: "level-1-guide",
      name: "Level 1 Guide",
      type: "guide",
      description: "The printed companion: how the notation reads, page by page.",
      price: 3000,
      sortOrder: 9,
    }),
  ];

  // Stub services: the shell never reaches a network, and a Buy click reports
  // instead of redirecting to Stripe.
  const store = createStoreState(
    {
      loadActiveProducts: async () => catalog,
      loadAllProducts: async () => catalog,
      loadProduct: async (id: string) => catalog.find((p) => p.id === id) ?? null,
    },
    {
      createCheckoutSession: async () => {
        checkoutNote = "Stub checkout: a real page would leave for Stripe here.";
        throw new Error("harness stub");
      },
    }
  );
  setStoreContext({ state: store });

  let checkoutNote = $state("");

  let purchaseState = $state<PurchaseState>("notify");
  let showDock = $state(false);
  let pageState = $state<"ready" | "loading" | "error">("ready");

  const crossSell = deriveCrossSell(catalog, { currentProductId: loopDeck.id });
  const price = formatUsd(loopDeck.price);

  const assurances = [
    { icon: "fas fa-box-open", text: "Deck box and laminated quick-reference sheet included" },
    { icon: "fas fa-hand-holding-heart", text: "Printed and cut by hand in Chicago, small batches" },
  ];
</script>

<div class="mkt-shell harness">
  <div class="controls">
    <div class="control">
      <span class="control-label" id="harness-state">Purchase state</span>
      <SegmentedControl
        options={[
          { value: "notify", label: "Notify" },
          { value: "preorder", label: "Pre-order" },
          { value: "buy", label: "Buy" },
        ]}
        value={purchaseState}
        onchange={(v) => (purchaseState = v)}
        ariaLabelledby="harness-state"
        size="sm"
      />
    </div>

    <div class="control">
      <span class="control-label" id="harness-page">Page state</span>
      <SegmentedControl
        options={[
          { value: "ready", label: "Ready" },
          { value: "loading", label: "Loading" },
          { value: "error", label: "Error" },
        ]}
        value={pageState}
        onchange={(v) => (pageState = v)}
        ariaLabelledby="harness-page"
        size="sm"
      />
    </div>

    <button
      type="button"
      class="toggle"
      aria-pressed={showDock}
      onclick={() => (showDock = !showDock)}
    >
      <i class="fas {showDock ? 'fa-circle-check' : 'fa-circle'}" aria-hidden="true"></i>
      Mobile dock
    </button>

    {#if checkoutNote}<span class="note">{checkoutNote}</span>{/if}
  </div>

  <ShopProductShell
    family="Decks"
    eyebrow="The deck"
    title="LOOP Deck"
    tagline="Pick a level, a length, and a flavor. Every sequence ends exactly where it began."
    product={loopDeck}
    listing="loop-deck"
    {purchaseState}
    {price}
    {assurances}
    {crossSell}
    checkoutError={store.checkoutError}
    loading={pageState === "loading"}
    loadingLabel="Loading the deck..."
    error={pageState === "error" ? "The deck isn't available right now." : null}
    dock={showDock
      ? {
          label: "Variety Pack",
          price,
          ctaLabel: "Pre-order now",
          onclick: () => (checkoutNote = "Dock CTA fired."),
        }
      : null}
  >
    {#snippet media()}
      <div class="fixture-art">
        <span>Preview stage</span>
        <small>Hosts render their fan, mockup, or cover here.</small>
      </div>
    {/snippet}

    {#snippet configurator()}
      <div class="fixture-panel">
        <span class="fixture-panel-label">Configurator region</span>
        <p>Dials, volume pickers and prop pickers mount here, above the buy cluster.</p>
      </div>
    {/snippet}

    {#snippet howItWorks()}
      <h2 class="section-title">How it works</h2>
      <p class="section-body">
        The card-anatomy explainer and the scannable QR land in this slot, fed per
        product.
      </p>
    {/snippet}

    {#snippet details()}
      <h2 class="section-title">Details</h2>
      <p class="section-body">
        Specs, contents, and shipping — whatever a buyer checks before committing.
      </p>
    {/snippet}
  </ShopProductShell>
</div>

<style>
  .harness {
    min-height: 100vh;
    background: #0b0d18;
    color: #fff;
  }

  .controls {
    position: sticky;
    top: 0;
    z-index: 40;
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 1rem;
    padding: 0.75rem 1.5rem;
    background: rgba(10, 12, 22, 0.92);
    border-bottom: 1px solid rgba(255, 255, 255, 0.12);
  }

  /* SegmentedControl fills its parent by design, so the parent is what stops a
     three-word control from stretching across a 4K row. */
  .control {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    width: min(20rem, 100%);
  }

  .control-label {
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.6);
  }

  .toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    min-height: var(--min-touch-target, 44px);
    padding: 0 1rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    background: rgba(255, 255, 255, 0.05);
    color: #fff;
    font-family: inherit;
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    cursor: pointer;
  }
  .toggle[aria-pressed="true"] {
    border-color: #8b6cff;
    background: rgba(139, 108, 255, 0.16);
  }

  .note {
    align-self: center;
    font-size: var(--font-size-min, 14px);
    color: #b8a6ff;
  }

  .fixture-art {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    text-align: center;
    color: rgba(255, 255, 255, 0.55);
  }
  .fixture-art span {
    font-size: 1.25rem;
    font-weight: 700;
  }

  .fixture-panel {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 1rem;
    border-radius: 0.875rem;
    border: 1px dashed rgba(255, 255, 255, 0.2);
  }
  .fixture-panel p {
    margin: 0;
    font-size: var(--font-size-min, 14px);
    color: rgba(255, 255, 255, 0.66);
  }
  .fixture-panel-label {
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.6);
  }

  .section-title {
    margin: 0;
    font-size: clamp(1.35rem, 2vw, 1.9rem);
    font-weight: 800;
  }
  .section-body {
    margin: 0;
    max-width: none;
    font-size: var(--font-size-min, 14px);
    line-height: 1.65;
    color: rgba(255, 255, 255, 0.7);
  }
</style>
