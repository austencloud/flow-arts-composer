<!--
  The Deck Architect: the power-user wing of the LOOP deck listing. Buyers
  who outgrow the packs and single-pool dials compose a full recipe here —
  up to MAX_RECIPE_SLICES slices of (count × flavor × level × steps × turns)
  summing to exactly DECK_SIZE cards. Flat $30, same SKU; the recipe rides
  checkout metadata as a compact string (pack XOR dials XOR recipe).

  The listing page stays anxiety-free; this page is opt-in complexity, and
  the copy congratulates the buyer for wanting it.

  Spec: docs/superpowers/specs/2026-07-12-deck-architect-design.md
-->
<script lang="ts">
  import "./styles/config-page.css";
  import * as singleBuyCheckoutCreator from "#lib/features/store/services/single-buy-checkout-creator.js";
  import { getProductLoader } from "#lib/features/store/get-product-loader.js";
  import { createStoreState } from "./state/store-state.svelte";
  import { setStoreContext } from "./context/store-context";
  import ShopProductShell, {
    type ShopAssurance,
  } from "./components/shell/ShopProductShell.svelte";
  import ShopPurchaseCta from "./components/shell/ShopPurchaseCta.svelte";
  import { deriveCrossSell } from "./domain/catalog-listings";
  import { resolvePurchaseState, SALES_LIVE } from "./domain/purchase-state";
  import DeckFanCover from "./components/DeckFanCover.svelte";
  import BuyButton from "./components/BuyButton.svelte";
  import PreorderPriceNote from "./components/PreorderPriceNote.svelte";
  import { activePriceCents, preorderWindowOpen, formatUsd } from "./domain/preorder-pricing";
  import LazyMount from "#lib/shared/components/LazyMount.svelte";
  import ShopPropPicker from "./components/ShopPropPicker.svelte";
  import StepperCard from "#lib/shared/components/stepper-card/StepperCard.svelte";
  import BaseCard from "#lib/features/create/generate/components/cards/BaseCard.svelte";
  import TurnIntensityCard from "#lib/features/create/generate/components/cards/TurnIntensityCard.svelte";
  import { DIFFICULTY_LEVELS } from "#lib/shared/config/difficulty-styles.js";
  import { getCardColors } from "#lib/shared/create/domain/card-colors.js";
  import { BackgroundType } from "@austencloud/backgrounds";
  import Crossfade from "#lib/shared/components/Crossfade.svelte";
  import LOOPExpandedOverlay from "#lib/features/create/generate/components/cards/LOOPExpandedOverlay.svelte";
  import { LOOPType } from "#lib/features/create/generate/circular/domain/models/circular-models.js";
  import { LOOPComponent } from "#lib/shared/foundation/domain/models/generation/generate-models.js";
  import {
    parseLoopComponents,
    generateLOOPType,
  } from "#lib/shared/create/services/loop-type-utils.js";
  import { LOOP_COMPONENT_MAP } from "#lib/features/create/generate/shared/domain/constants/loop-constants.js";
  import { scale, slide } from "svelte/transition";
  import { quintOut } from "svelte/easing";
  import { DEFAULT_SHOP_PROP } from "./domain/shop-prop-options";
  import { prewarmCovers } from "./services/cover-front-renderer";
  import {
    recipePreviewCards,
    recipeSliceCard,
  } from "./services/loop-preview-cards";
  import type { CoverCard } from "./domain/models/product";
  import {
    DECK_SIZE,
    MAX_RECIPE_SLICES,
    RECIPE_STEPS,
    recipeProblem,
    flavorSlugFromComponents,
    flavorForLoopType,
    flavorLabel,
    type RecipeSlice,
    type LoopFlavor,
    type LoopConfig,
  } from "./domain/loop-config";
  import { getActivityLogger } from "#lib/shared/analytics/get-activity-logger.js";
  import { trackVariantSelected, trackPropSelected } from "./analytics/shop-funnel";
  import { trackViewOnceLoaded } from "./analytics/shop-funnel-view.svelte";
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";

  const store = createStoreState(getProductLoader(), singleBuyCheckoutCreator);
  setStoreContext({ state: store });
  store.loadProducts(false);
  getActivityLogger().logActivity("shop_loop_architect_opened", "shop");

  // Architect orders carry a premium over the $30 packs/dials deck: a bespoke
  // recipe costs more to cut and pack until fulfillment is dropshipped. The
  // page prefers a dedicated architect SKU (listing "loop-deck-architect",
  // created in Stripe and mirrored by the product-sync webhook) and falls back
  // to the shared custom SKU while that price doesn't exist yet.
  const architectSku = $derived(
    store.products.find(
      (p) => p.listing === "loop-deck-architect" && p.status === "active"
    ) ?? null
  );
  const customSku = $derived(
    architectSku ??
      store.products.find(
        (p) => p.listing === "loop-deck-custom" && p.status === "active"
      ) ??
      null
  );
  // Funnel step 1. Kept alongside shop_loop_architect_opened above, not folded
  // into it: that one is the usage gate deciding whether the Architect stays,
  // this one is the funnel's entry step. Gated on the load settling so
  // price/preorder are real (see the identical guard in the configurator).
  trackViewOnceLoaded("loop-deck-architect", () => store.isLoading, () => customSku);

  const flavorSkus = $derived(
    store.products
      .filter((p) => p.listing === "loop-deck" && p.status === "active")
      .sort((a, b) => a.sortOrder - b.sortOrder)
  );
  const skuByFlavor = $derived(
    new Map(
      flavorSkus
        .map((p) => [flavorSlugFromComponents(p.loopComponents ?? []), p] as const)
        .filter((e): e is [LoopFlavor, (typeof flavorSkus)[number]] => e[0] != null)
    )
  );

  const haptics = getHapticFeedback();
  const buzz = () => haptics?.trigger("selection");

  // ── the recipe. Seeded valid (the whole deck in one rotated L1 slice) so
  //    the page never opens in an error state. Rows carry a stable local id —
  //    index-keyed each blocks misbind rows across splices (a remove was
  //    editing the wrong slice). The id never leaves the page. ──
  type SliceRow = RecipeSlice & { id: number };
  let uid = 0;
  let slices = $state<SliceRow[]>([
    { id: ++uid, count: DECK_SIZE, flavor: "rotated", level: 1, steps: 8 },
  ]);
  let propType = $state<PropType>(DEFAULT_SHOP_PROP);

  // Seed the card render pool. Every card on this page is generated live, so
  // none of them is baked — without a seed the print pipeline composes them
  // with no arrow, prop, or glyph assets loaded and every sample comes back a
  // blank white rectangle. The flavor SKUs' covers are the same seed the LOOP
  // listing and the catalog front door already use; a prop switch re-seeds,
  // because prop type is part of the pool's seed signature.
  $effect(() => {
    const all = flavorSkus.flatMap((p) => p.coverCards ?? []);
    if (all.length) prewarmCovers(all, propType, { includeBaked: true });
  });

  const total = $derived(slices.reduce((n, s) => n + s.count, 0));
  const problem = $derived(recipeProblem(slices));
  const loopConfig = $derived<LoopConfig>({
    recipe: slices.map(({ id: _id, ...s }) => s),
  });
  // Read once — the preorder→regular boundary is a fixed instant, no ticking.
  const now = Date.now();
  const price = $derived(
    customSku ? formatUsd(activePriceCents(customSku, now)) : "$30"
  );

  function addSlice() {
    if (slices.length >= MAX_RECIPE_SLICES) return;
    // Snapshot BEFORE mutating: `total` is derived and re-evaluates mid-function.
    const startTotal = total;
    if (startTotal < DECK_SIZE) {
      // Room in the deck — the new slice takes exactly the shortfall.
      slices.push({
        id: ++uid,
        count: DECK_SIZE - startTotal,
        flavor: "rotated",
        level: 1,
        steps: 8,
      });
    } else {
      // Full (or over): donate cards from the biggest slice so a valid
      // recipe stays valid across the add.
      const biggest = slices.reduce((a, b) => (b.count > a.count ? b : a), slices[0]!);
      const give = Math.min(6, Math.max(1, biggest.count - 1));
      biggest.count -= give;
      slices.push({ id: ++uid, count: give, flavor: "rotated", level: 1, steps: 8 });
    }
    buzz();
    trackRecipeShape();
  }
  function removeSlice(i: number) {
    slices.splice(i, 1);
    buzz();
    trackRecipeShape();
  }

  // Funnel step 2 for the recipe dial. Fired on add/remove only — the shape of
  // the recipe is what recipe_slice_count measures, and the per-slice steppers
  // (count/level/flavor/steps) would emit the same slice count on every tick.
  // variant_value stays null: a buyer-authored slice list has no bounded value,
  // and serializing it would be unique per buyer.
  function trackRecipeShape() {
    trackVariantSelected({
      listing: "loop-deck-architect",
      productId: customSku?.id,
      variantKind: "recipe",
      recipeSliceCount: slices.length,
    });
  }
  function setCount(i: number, v: number) {
    const s = slices[i];
    if (!s) return;
    s.count = Math.max(1, Math.min(DECK_SIZE, Math.round(v) || 1));
  }
  function setLevel(i: number, level: number) {
    const s = slices[i];
    if (!s) return;
    s.level = level;
    if (level === 1) delete s.maxTurns;
    else if (s.maxTurns === undefined) s.maxTurns = 1;
    else if (level === 2 && s.maxTurns % 1 !== 0)
      s.maxTurns = Math.max(1, Math.round(s.maxTurns));
    buzz();
  }
  function setSteps(i: number, steps: number) {
    const s = slices[i];
    if (!s) return;
    s.steps = steps;
    buzz();
  }
  function setTurns(i: number, t: number) {
    const s = slices[i];
    if (!s) return;
    s.maxTurns = t;
    buzz();
  }

  // ── flavor modal (the generate panel's LOOP overlay, editing one slice) ──
  let flavorEdit = $state<number | null>(null);
  const editSlice = $derived(flavorEdit !== null ? slices[flavorEdit] : null);
  const editLoopType = $derived(
    editSlice
      ? (generateLOOPType(
          new Set(editSlice.flavor.split("-") as unknown as LOOPComponent[])
        ) ?? LOOPType.ROTATED)
      : LOOPType.ROTATED
  );
  const editComponents = $derived(parseLoopComponents(editLoopType));
  function pickFlavor(lt: LOOPType) {
    const s = flavorEdit !== null ? slices[flavorEdit] : undefined;
    if (s) {
      s.flavor = flavorForLoopType(lt) ?? "rotated";
      buzz();
    }
    flavorEdit = null;
  }
  function onWindowKey(e: KeyboardEvent) {
    if (e.key !== "Escape") return;
    if (flavorEdit !== null) flavorEdit = null;
    else if (sampleView !== null) sampleView = null;
  }

  // ── per-slice sample cards: one live card each, token-guarded so stale
  //    fetches never land. Cards swap in place (no remount churn). ──
  let sliceCards = $state<(CoverCard | null)[]>([]);
  let sliceToken = 0;
  const sliceKey = $derived(
    slices
      .map((s) => `${s.flavor}|${s.level}|${s.steps}|${s.maxTurns ?? ""}`)
      .join(";") + `|${propType}`
  );
  $effect(() => {
    void sliceKey;
    if (flavorSkus.length === 0) return;
    const snapshot = slices.map((s) => ({ ...s }));
    const token = ++sliceToken;
    snapshot.forEach((s, i) => {
      recipeSliceCard(s, propType, skuByFlavor.get(s.flavor), i).then((card) => {
        if (token !== sliceToken) return;
        sliceCards[i] = card;
      });
    });
    if (sliceCards.length > snapshot.length) sliceCards.length = snapshot.length;
  });

  // ── hero fan: settled-commit like the listing; re-deals only when a slice
  //    is added or removed, otherwise faces swap in place. ──
  const SETTLE_MS = 650;
  let previewCards = $state<CoverCard[] | null>(null);
  let settledFanKey = $state("boot");
  let previewToken = 0;
  let lastTouch = 0;
  $effect(() => {
    void sliceKey;
    const count = slices.length;
    if (flavorSkus.length === 0) return;
    const snapshot = slices.map((s) => ({ ...s }));
    const token = ++previewToken;
    lastTouch = Date.now();
    recipePreviewCards(snapshot, propType, skuByFlavor).then((cards) => {
      if (token !== previewToken) return;
      const wait = Math.max(0, SETTLE_MS - (Date.now() - lastTouch));
      setTimeout(() => {
        if (token !== previewToken) return;
        previewCards = cards?.length ? cards : null;
        settledFanKey = `slices:${count}`;
      }, wait);
    });
  });

  let previewW = $state(0);
  let previewH = $state(0);

  // The mobile checkout dock is the shell's now (it watches its own buy rail
  // and mounts the pinned bar); this page only says what the bar should read.
  // Phone layout: samples shrink to sidecar size (CSS pairs at 720px).
  let pageW = $state(0);
  const narrow = $derived(pageW > 0 && pageW < 720);
  const sampleCardW = $derived(narrow ? 148 : 180);
  // Rail stage is compact: card height budget = stage minus caption + gaps.
  const previewMaxCardW = $derived(
    previewH > 0 ? Math.max(110, Math.round(((previewH - 80) * 5) / 7)) : 200
  );

  // ── flavor identity: each LOOP component owns a canonical color
  //    (LOOP_COMPONENT_MAP — same hues as the picker tiles). Combos don't mix
  //    colors, they juxtapose them as gradient stops. ──
  function flavorColors(flavor: LoopFlavor): string[] {
    const cols = flavor
      .split("-")
      .map((c) => LOOP_COMPONENT_MAP.get(c as never)?.color)
      .filter((c): c is string => Boolean(c));
    return cols.length ? cols : ["#8b6cff"];
  }
  /** Low-opacity wash for the card frame. */
  function flavorWash(flavor: LoopFlavor): string {
    const stops = flavorColors(flavor).map(
      (c, i, a) => `color-mix(in srgb, ${c} 13%, transparent) ${(i / Math.max(1, a.length - 1)) * 55}%`
    );
    return stops.length > 1
      ? `linear-gradient(135deg, ${stops.join(", ")}, transparent 80%)`
      : `linear-gradient(135deg, ${stops[0]}, transparent 55%)`;
  }
  /** Full-strength gradient for the flavor tile (bento language: tiles are
      solid, saturated surfaces — combos juxtapose their components' hues). */
  function flavorTileBg(flavor: LoopFlavor): string {
    const cols = flavorColors(flavor);
    const stops =
      cols.length > 1
        ? cols.map((c) => `color-mix(in srgb, ${c} 82%, #10121f)`)
        : [
            `color-mix(in srgb, ${cols[0]} 88%, white)`,
            `color-mix(in srgb, ${cols[0]} 72%, #10121f)`,
          ];
    return `linear-gradient(135deg, ${stops.join(", ")})`;
  }

  // ── per-slice dials: the generate panel's colored StepperCards — the same
  //    bento tiles the listing page uses, so the two LOOP surfaces share one
  //    control language (Level wears DIFFICULTY colors). ──
  const cc = getCardColors(BackgroundType.COSMIC);
  const LEVEL_DESC: Record<number, string> = {
    1: "No turns",
    2: "Whole turns",
    3: "Half turns",
  };
  function stepSliceLevel(i: number, dir: number) {
    const s = slices[i];
    if (!s) return;
    setLevel(i, Math.max(1, Math.min(3, s.level + dir)));
  }
  function stepSliceSteps(i: number, dir: number) {
    const s = slices[i];
    if (!s) return;
    const idx = RECIPE_STEPS.indexOf(s.steps as (typeof RECIPE_STEPS)[number]);
    const next = RECIPE_STEPS[Math.max(0, Math.min(RECIPE_STEPS.length - 1, idx + dir))];
    if (next !== undefined && next !== s.steps) setSteps(i, next);
  }
  const TURN_STEPS_WHOLE = [1, 2, 3];
  const TURN_STEPS_HALF = [0.5, 1, 1.5, 2, 2.5, 3];

  // ── sample lightbox: tap a slice's card to read it full size, and re-deal
  //    for another draw from the same slice. ──
  let sampleView = $state<number | null>(null);
  // Two faces share the lightbox width: cap per-face card size so front+back
  // fit side by side down to phone widths.
  const lightboxFaceW = $derived(
    Math.min(300, Math.max(140, Math.floor((pageW - 120) / 2)))
  );
  // The SKU the buy cluster acts on, and whether it can take money at all.
  const buySku = $derived(customSku ?? flavorSkus[0] ?? null);
  const purchaseState = $derived(
    buySku === null ? "notify" : resolvePurchaseState(buySku, SALES_LIVE)
  );
  const purchasable = $derived(purchaseState !== "notify");

  // Exclude the listing this page IS, not the one it came from. Naming the
  // LOOP deck's href here sold the Architect back to the reader on its own
  // page and hid the deck it configures — both wrong.
  const crossSell = $derived(
    deriveCrossSell(store.products, { currentListing: "loop-deck-architect" })
  );

  // The ship-date line is the preorder promise. It reads from the same
  // resolver as the buy button, so a page that can only take an email never
  // claims a ship date beside its "Preorders open soon" box.
  const PREORDER_ASSURANCE: ShopAssurance = {
    icon: "fas fa-calendar-check",
    text: "Preorder now. Decks ship October 1.",
  };
  const STANDING_ASSURANCES: readonly ShopAssurance[] = [
    {
      icon: "fas fa-wand-magic-sparkles",
      text: "Every card generated to your recipe, one of one",
    },
    {
      icon: "fas fa-hand-holding-heart",
      text: "Printed and cut by hand in Chicago, small batches",
    },
  ];
  const assurances = $derived(
    purchaseState === "preorder"
      ? [PREORDER_ASSURANCE, ...STANDING_ASSURANCES]
      : STANDING_ASSURANCES
  );

  const NOTIFY_TEXT =
    "Preorders open soon. Leave an email and you'll hear the moment they do.";

  let rerolling = $state(false);
  async function rerollSample(i: number) {
    const s = slices[i];
    if (!s || rerolling) return;
    rerolling = true;
    const token = sliceToken;
    try {
      const card = await recipeSliceCard(
        { ...s },
        propType,
        skuByFlavor.get(s.flavor),
        // A fresh serial so the generator doesn't hand back the same card.
        i + slices.length + Math.floor(Math.random() * 1000)
      );
      if (token === sliceToken && card) sliceCards[i] = card;
    } finally {
      rerolling = false;
    }
  }
</script>

<svelte:window onkeydown={onWindowKey} bind:innerWidth={pageW} />

<ShopProductShell
  backHref="/shop/loop-deck"
  backLabel="LOOP Deck"
  family="Deck Architect"
  eyebrow="The Deck Architect"
  title="Deck Architect"
  tagline="A deck is {DECK_SIZE} cards. Each slice below is a recipe for a stack of them. Tweak, add, or remove slices until the meter reads {DECK_SIZE}."
  mediaFrame={false}
  product={buySku ?? undefined}
  {propType}
  {loopConfig}
  listing="loop-deck-architect"
  price={flavorSkus.length > 0 ? price : undefined}
  checkoutError={store.checkoutError}
  {crossSell}
  {assurances}
  loading={store.isLoading && flavorSkus.length === 0}
  loadingLabel="Loading the machine..."
  error={store.error ??
    (!store.isLoading && flavorSkus.length === 0
      ? "The machine isn't available right now."
      : null)}
  dock={purchasable && customSku
    ? {
        label: `${total} / ${DECK_SIZE}`,
        price,
        ctaLabel: store.isCheckingOut ? "Opening..." : "Preorder now",
        disabled: problem !== null || store.isCheckingOut,
        onclick: () => store.startCheckout(customSku.id, propType, loopConfig),
      }
    : null}
>
  {#snippet media()}
    <!-- The live deck preview: the running receipt for the recipe below.
         Fill-mode crossfade, so the stage never resizes mid-edit. -->
    <div class="rail-stage" bind:clientWidth={previewW} bind:clientHeight={previewH}>
      <Crossfade key={settledFanKey} fill>
        <div class="preview-inner">
          <DeckFanCover
            cards={previewCards ?? []}
            deckName="Your recipe"
            {propType}
            cardWidth={150}
            maxCardWidth={previewMaxCardW}
            interactive={false}
            deal
          />
          <p class="preview-desc">Sampled live from your recipe.</p>
        </div>
      </Crossfade>
    </div>
  {/snippet}

  {#snippet configurator()}
    <!-- prop: one per deck (v1) -->
    <div class="prop-panel">
      <span class="field-label">Prop</span>
      <ShopPropPicker
        value={propType}
        onchange={(p) => {
          propType = p;
          buzz();
          trackPropSelected("loop-deck-architect", customSku?.id, p);
        }}
      />
    </div>
  {/snippet}

  {#snippet priceNote()}
    {#if customSku && preorderWindowOpen(customSku, now)}
      <PreorderPriceNote product={customSku} />
    {/if}
    <p class="spec-line">
      Poker size · 2.5" × 3.5" <span class="spec-sep">•</span> Deck only
    </p>
  {/snippet}

  {#snippet cta()}
    {#if problem !== null}
      <div class="buy-blocked" role="status">{problem}</div>
    {:else if buySku}
      <ShopPurchaseCta
        listing="loop-deck-architect"
        product={buySku}
        {propType}
        {loopConfig}
        notifyText={NOTIFY_TEXT}
      />
      <!-- The cart is the second path, and it only exists once there is money
           to take. -->
      {#if purchasable}
        <BuyButton
          listing="loop-deck-architect"
          product={buySku}
          {propType}
          {loopConfig}
          mode="add"
          label="Add to cart"
        />
      {/if}
    {/if}
  {/snippet}

  {#snippet workbench()}
    <!-- The recipe builder gets the whole band: eight slice cards, each with
         its own tile board, read as a cramped list beside the buy cluster. -->
    <!-- workbench bar: the one invariant + the one action, always visible -->
    <div class="workbench-bar">
              <div
                class="total-meter"
                class:ok={problem === null}
                role="status"
                aria-live="polite"
              >
                <span class="total-count">{total} / {DECK_SIZE}</span>
                <span class="total-note">{problem ?? "Ready to preorder."}</span>
              </div>
              {#if slices.length < MAX_RECIPE_SLICES}
                <button type="button" class="add-slice" onclick={addSlice}>
                  <i class="fas fa-plus" aria-hidden="true"></i> Add a slice
                </button>
              {/if}
            </div>

            <div class="slice-list">
              {#each slices as slice, i (slice.id)}
                {@const accent = flavorColors(slice.flavor)[0]!}
                <!-- No row transition: slide outros hung inside the grid
                     (inert ghost rows), and correctness beats choreography.
                     Each slice wears its LOOP components' canonical colors
                     (combos juxtapose as gradient stops, never mixed). -->
                <div
                  class="slice-row"
                  style:--slice-accent={accent}
                  style:--slice-wash={flavorWash(slice.flavor)}
                >
                  {#if sliceCards[i]}
                    <!-- The sample is a real card — tap it to read it full
                         size. maxCardWidth pins it: the fan sizes from its
                         container, and an uncapped card ballooned to page
                         width on phones. -->
                    <button
                      type="button"
                      class="slice-sample"
                      aria-label="View this sample card full size"
                      onclick={() => (sampleView = i)}
                    >
                      <DeckFanCover
                        cards={[sliceCards[i]]}
                        deckName={flavorLabel(slice.flavor)}
                        {propType}
                        cardWidth={sampleCardW}
                        maxCardWidth={sampleCardW}
                        exactCount={1}
                        interactive={false}
                      />
                      <span class="sample-hint" aria-hidden="true">
                        <i class="fas fa-magnifying-glass-plus"></i>
                      </span>
                    </button>
                  {:else}
                    <div class="slice-sample" aria-hidden="true">
                      <div class="sample-skeleton"></div>
                    </div>
                  {/if}
                  <div class="slice-controls">
                    {#if slices.length > 1}
                      <button
                        type="button"
                        class="remove-btn"
                        aria-label="Remove slice"
                        onclick={() => removeSlice(i)}
                      >
                        <i class="fas fa-times" aria-hidden="true"></i>
                      </button>
                    {/if}
                    <!-- ONE control language: every dial is a bento tile (the
                         listing page's exact components) — no pill/tile mix. -->
                    <div class="tile-grid" class:has-turns={slice.level >= 2}>
                      <div class="tile">
                        <StepperCard
                          title="Cards"
                          currentValue={slice.count}
                          minValue={1}
                          maxValue={DECK_SIZE}
                          description="THIS SLICE"
                          color="linear-gradient(135deg, #a78bfa 0%, #8b5cf6 50%, #6d28d9 100%)"
                          shadowColor="262deg 60% 45%"
                          onIncrement={() => setCount(i, slice.count + 1)}
                          onDecrement={() => setCount(i, slice.count - 1)}
                        />
                      </div>
                      <div
                        class="tile flavor-tile"
                        style:--flavor-size={flavorLabel(slice.flavor).length > 28
                          ? "12px"
                          : flavorLabel(slice.flavor).length > 14
                            ? "15px"
                            : "22px"}
                      >
                        <BaseCard
                          title="Flavor"
                          currentValue={flavorLabel(slice.flavor)}
                          color={flavorTileBg(slice.flavor)}
                          shadowColor="0deg 0% 0%"
                          onClick={() => (flavorEdit = i)}
                        />
                      </div>
                      <div class="tile">
                        <StepperCard
                          title="Level"
                          currentValue={slice.level}
                          minValue={1}
                          maxValue={3}
                          description={LEVEL_DESC[slice.level] ?? ""}
                          color={DIFFICULTY_LEVELS[slice.level]?.cssBg ?? cc.level.color}
                          textColor={DIFFICULTY_LEVELS[slice.level]?.text ?? "white"}
                          shadowColor="0deg 0% 0%"
                          onIncrement={() => stepSliceLevel(i, 1)}
                          onDecrement={() => stepSliceLevel(i, -1)}
                        />
                      </div>
                      <div class="tile">
                        <StepperCard
                          title="Steps"
                          currentValue={slice.steps}
                          minValue={4}
                          maxValue={16}
                          description="PER CARD"
                          color={cc.length.color}
                          shadowColor={cc.length.shadowColor}
                          onIncrement={() => stepSliceSteps(i, 1)}
                          onDecrement={() => stepSliceSteps(i, -1)}
                        />
                      </div>
                      {#if slice.level >= 2}
                        <div class="tile turns-tile" transition:slide={{ duration: 200, easing: quintOut, axis: "y" }}>
                          <TurnIntensityCard
                            currentIntensity={slice.maxTurns ?? 1}
                            allowedValues={slice.level === 3 ? TURN_STEPS_HALF : TURN_STEPS_WHOLE}
                            onIntensityChange={(v: number) => setTurns(i, v)}
                            shadowColor="140deg 70% 45%"
                          />
                        </div>
                      {/if}
                    </div>
                  </div>
                </div>
              {/each}
            </div>
  {/snippet}
</ShopProductShell>

{#if sampleView !== null && sliceCards[sampleView]}
  <div
    class="modal-backdrop"
    role="presentation"
    onclick={(e) => {
      if (e.target === e.currentTarget) sampleView = null;
    }}
  >
    <div
      class="sample-lightbox"
      transition:scale={{ start: 0.92, duration: 220, easing: quintOut }}
    >
      <!-- Front AND back, side by side — the full physical card, both faces. -->
      <div class="lightbox-faces">
        <div class="lightbox-face" style:width="{lightboxFaceW}px">
          <DeckFanCover
            cards={[sliceCards[sampleView]!]}
            deckName={flavorLabel(slices[sampleView]?.flavor ?? "rotated")}
            {propType}
            cardWidth={lightboxFaceW}
            maxCardWidth={lightboxFaceW}
            exactCount={1}
            interactive={false}
          />
          <span class="face-label">Front</span>
        </div>
        <div class="lightbox-face" style:width="{lightboxFaceW}px">
          <DeckFanCover
            cards={[sliceCards[sampleView]!]}
            deckName={flavorLabel(slices[sampleView]?.flavor ?? "rotated")}
            {propType}
            cardWidth={lightboxFaceW}
            maxCardWidth={lightboxFaceW}
            exactCount={1}
            interactive={false}
            face="back"
          />
          <span class="face-label">Back</span>
        </div>
      </div>
      <!-- Live animation: the card shows the notation, this shows what the
           notation MEANS — the props moving. A newcomer reads the payoff here,
           not from the pictographs. Lazy: the engine chunk is heavy. -->
      <div class="lightbox-anim">
        <LazyMount
          loader={() =>
            import(
              "#lib/features/browse/sequences/display/components/media-viewer/InlineAnimationPlayer.svelte"
            )}
          active={sampleView !== null}
          props={{
            sequence: sliceCards[sampleView]!.sequence,
            autoPlay: true,
            chrome: "minimal",
            fill: true,
            leftPropType: propType,
            rightPropType: propType,
          }}
        />
      </div>
      <p class="lightbox-caption">
        One draw from this slice. Watch it loop. Every deck deals fresh cards.
      </p>
      <div class="lightbox-actions">
        <button
          type="button"
          class="lightbox-redeal"
          disabled={rerolling}
          onclick={() => rerollSample(sampleView!)}
        >
          <i class="fas fa-shuffle" aria-hidden="true"></i>
          {rerolling ? "Dealing..." : "Deal another"}
        </button>
        <button type="button" class="lightbox-close" onclick={() => (sampleView = null)}>
          Done
        </button>
      </div>
    </div>
  </div>
{/if}

{#if flavorEdit !== null}
  <div
    class="modal-backdrop"
    role="presentation"
    onclick={(e) => {
      if (e.target === e.currentTarget) flavorEdit = null;
    }}
  >
    <div
      class="loop-col"
      transition:scale={{ start: 0.95, duration: 250, easing: quintOut }}
    >
      <div class="loop-host">
        <LOOPExpandedOverlay
          currentType={editLoopType}
          selectedComponents={editComponents}
          onChange={(lt: LOOPType) => pickFlavor(lt)}
          onClose={() => (flavorEdit = null)}
        />
      </div>
    </div>
  </div>
{/if}

<style>
  /* Page chrome — root shell, back link, title, price, checkout error,
     assurances, load and failure states, mobile checkout dock — belongs to
     ShopProductShell. What is left here is the stage, the recipe builder,
     and its two modals. */

  /* The live preview is a rail panel, not a page hero — the slices are the
     show; the fan is the running receipt. */
  .rail-stage {
    position: relative;
    overflow: hidden;
    border-radius: 16px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background:
      radial-gradient(70% 60% at 50% 40%, rgba(139, 108, 255, 0.3), transparent 70%),
      radial-gradient(circle at 50% 38%, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.015));
    padding: 14px;
    /* Tall enough that the sampled cards read as cards. The info column beside
       it runs taller than this at every desktop width, so the stage claiming
       its share of the hero band costs the buy cluster nothing. */
    height: clamp(280px, 44vh, 620px);
  }
  .preview-inner {
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: stretch;
    gap: 10px;
  }
  .preview-desc {
    font-size: var(--font-size-min, 14px);
    line-height: 1.5;
    color: rgba(255, 255, 255, 0.88);
    margin: 0;
    text-align: center;
    align-self: center;
  }

  /* ---------- workbench bar (meter + add) ---------- */
  .workbench-bar {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  .workbench-bar .total-meter {
    flex: 0 1 480px;
  }
  .total-meter {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 10px 16px;
    border-radius: 12px;
    border: 1px solid rgba(245, 158, 11, 0.45);
    background: rgba(245, 158, 11, 0.08);
  }
  .total-meter.ok {
    border-color: rgba(74, 222, 128, 0.45);
    background: rgba(74, 222, 128, 0.07);
  }
  .total-count {
    font-size: 18px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .total-note {
    font-size: var(--font-size-min, 14px);
    color: rgba(255, 255, 255, 0.85);
  }

  /* Grid of slice cards: the recipe reads as a hand you're assembling, and
     width scales with slice count instead of leaving sparse full-width rows. */
  .slice-list {
    display: grid;
    /* auto-FIT, not auto-fill: empty tracks collapse, so one slice spans the
       whole band instead of sitting beside a reserved hole. */
    grid-template-columns: repeat(auto-fit, minmax(min(440px, 100%), 1fr));
    gap: 12px;
  }
  .slice-row {
    position: relative;
    display: flex;
    gap: 18px;
    align-items: center;
    padding: 16px 18px;
    border-radius: 16px;
    /* Flavor identity: the slice wears its flavor's accent on the frame. */
    border: 1px solid color-mix(in srgb, var(--slice-accent, #8b6cff) 45%, transparent);
    background:
      var(
        --slice-wash,
        linear-gradient(
          135deg,
          color-mix(in srgb, var(--slice-accent, #8b6cff) 9%, transparent),
          transparent 55%
        )
      ),
      var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    box-shadow: 0 4px 18px color-mix(in srgb, var(--slice-accent, #8b6cff) 14%, transparent);
  }
  /* An odd straggler in a 2-up grid spans the band instead of orphaning a hole. */
  .slice-row:last-child:nth-child(odd):not(:first-child) {
    grid-column: 1 / -1;
  }
  .slice-sample {
    position: relative;
    flex: 0 0 200px;
    display: flex;
    align-items: center;
    justify-content: center;
    /* Button reset — the sample IS a button (tap to read it full size). */
    border: none;
    background: none;
    padding: 0;
    color: inherit;
    border-radius: 12px;
    cursor: pointer;
    transition: transform 0.18s ease;
  }
  button.slice-sample:hover {
    transform: scale(1.03);
  }
  button.slice-sample:hover .sample-hint {
    opacity: 1;
  }
  .sample-hint {
    position: absolute;
    right: 6px;
    bottom: 6px;
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border-radius: 999px;
    background: rgba(10, 12, 22, 0.75);
    border: 1px solid rgba(255, 255, 255, 0.25);
    color: rgba(255, 255, 255, 0.9);
    font-size: 12px;
    opacity: 0.65;
    transition: opacity 0.15s ease;
    pointer-events: none;
  }
  .sample-skeleton {
    width: 180px;
    aspect-ratio: 5 / 7;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.06);
    animation: pulse 1.4s ease-in-out infinite;
  }
  @keyframes pulse {
    50% {
      background: rgba(255, 255, 255, 0.11);
    }
  }
  .slice-controls {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .remove-btn {
    position: absolute;
    top: 4px;
    right: 4px;
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    border-radius: 10px;
    border: 1px solid transparent;
    background: none;
    color: rgba(255, 255, 255, 0.55);
    cursor: pointer;
    transition: color 0.15s ease, border-color 0.15s ease;
  }
  .remove-btn:hover {
    color: #ff8a8a;
    border-color: rgba(255, 138, 138, 0.4);
  }
  /* The listing page's bento tiles (generate-panel StepperCards + BaseCard).
     A fixed 2-column grid so every slice card carries the identical board:
     Cards | Flavor / Level | Steps / Turns spanning when it exists. The type
     vars feed the real card components' internal scale. */
  .tile-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    --card-text-size: 20px;
    --card-text-weight: 800;
    --card-text-spacing: 0.3px;
    --card-text-shadow: 0 2px 6px rgba(0, 0, 0, 0.45);
  }
  .tile {
    height: 112px;
    min-width: 0;
  }
  .turns-tile {
    grid-column: 1 / -1;
  }
  /* Combo flavors ("Mirrored / Swapped / Inverted") overflow the tile at the
     stock 20px+nowrap value type — long labels wrap and step down. */
  .flavor-tile :global(.base-card .card-value) {
    font-size: var(--flavor-size, 22px) !important;
    white-space: normal !important;
    line-height: 1.25 !important;
    padding: 0 8px;
  }
  /* The pinned remove button gets its own lane — without it the Flavor
     tile's corner sits under the ×. */
  .slice-row:has(.remove-btn) .tile-grid {
    margin-top: 36px;
  }
  .tile > :global(*) {
    width: 100%;
    height: 100%;
  }

  .add-slice {
    align-self: flex-start;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: var(--min-touch-target, 44px);
    padding: 0 18px;
    border-radius: 999px;
    border: 1px dashed rgba(216, 180, 254, 0.5);
    background: rgba(139, 108, 255, 0.08);
    color: #d9ccff;
    font-size: var(--font-size-min, 14px);
    font-weight: 700;
    cursor: pointer;
    transition: border-color 0.15s ease, background 0.15s ease;
  }
  .add-slice:hover {
    border-color: rgba(216, 180, 254, 0.9);
    background: rgba(139, 108, 255, 0.16);
  }

  .prop-panel {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px 16px;
    border-radius: 16px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
  }

  /* .price and .spec-line/.spec-sep are byte-identical with
     LoopDeckConfiguratorPage and live in config-page.css. */
  .buy-blocked {
    padding: 16px;
    border-radius: 12px;
    border: 1px solid rgba(245, 158, 11, 0.45);
    background: rgba(245, 158, 11, 0.08);
    text-align: center;
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    color: rgba(255, 255, 255, 0.9);
  }
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: clamp(16px, 4vh, 48px);
    background: rgba(4, 7, 14, 0.62);
    backdrop-filter: blur(5px);
  }
  .loop-col {
    width: min(1000px, 94vw);
    max-height: 92vh;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .loop-host {
    position: relative;
    min-height: 0;
    overflow: hidden;
    border-radius: 18px;
  }
  .loop-host :global(.loop-expanded-overlay) {
    position: relative !important;
    inset: auto !important;
    width: 100%;
    max-height: 76vh;
  }
  .loop-host :global(.grid-container) {
    flex: 0 0 auto;
  }

  .sample-lightbox {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    padding: 20px;
    border-radius: 18px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.14));
    background: rgba(14, 16, 28, 0.92);
    max-width: min(720px, 94vw);
    /* Front + back + animation stage can exceed a short phone viewport —
       scroll inside the modal instead of overflowing it. */
    max-height: 92vh;
    overflow-y: auto;
  }
  .lightbox-faces {
    display: flex;
    justify-content: center;
    align-items: flex-start;
    gap: 4px;
  }
  /* Square animation stage: the fixed aspect-ratio reserves its space before
     the lazy engine mounts (no-layout-shift), sized to the two faces beside
     it so the modal reads as one balanced block. */
  .lightbox-anim {
    position: relative;
    /* flex column + scroll would shrink an aspect-ratio box off-square;
       pin it so it keeps its height and the modal scrolls instead. */
    flex: 0 0 auto;
    aspect-ratio: 1;
    width: min(100%, 300px);
    border-radius: 16px;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }
  .lightbox-face {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    min-width: 0;
  }
  .face-label {
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.6);
  }
  .lightbox-caption {
    margin: 0;
    font-size: var(--font-size-min, 14px);
    color: rgba(255, 255, 255, 0.85);
    text-align: center;
  }
  .lightbox-actions {
    display: flex;
    gap: 10px;
    width: 100%;
  }
  .lightbox-redeal,
  .lightbox-close {
    flex: 1;
    min-height: var(--min-touch-target, 44px);
    border-radius: 12px;
    font-size: 15px;
    font-weight: 700;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }
  .lightbox-redeal {
    border: none;
    background: var(--theme-accent-strong, #7c6cf5);
    color: #fff;
  }
  .lightbox-redeal:disabled {
    opacity: 0.55;
    cursor: default;
  }
  .lightbox-close {
    border: 1px solid rgba(255, 255, 255, 0.28);
    background: rgba(255, 255, 255, 0.06);
    color: #fff;
  }


  @media (max-width: 720px) {
    /* Phone slice card: the (bigger, tappable) sample centered up top, the
       uniform tile board below. The × keeps its pinned corner. */
    .slice-row {
      flex-direction: column;
      align-items: stretch;
      gap: 12px;
      padding: 12px;
    }
    .slice-sample {
      align-self: center;
      flex: none;
      /* The fan sizes from its container — a shrink-to-fit button gives it
         nothing to measure. */
      width: 172px;
    }
    .sample-skeleton {
      width: 148px;
    }
    .tile {
      height: 104px;
    }
    /* The sample band clears the pinned × on its own — no extra lane. */
    .slice-row:has(.remove-btn) .tile-grid {
      margin-top: 0;
    }
    .rail-stage {
      height: 240px;
    }
    .workbench-bar .total-meter {
      flex-basis: 100%;
    }
    .add-slice {
      flex: 1 1 100%;
      justify-content: center;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .add-slice {
      transition: none;
    }
    .sample-skeleton {
      animation: none;
    }
  }
</style>
