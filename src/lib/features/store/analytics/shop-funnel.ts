/**
 * Shop conversion funnel — the five ordered steps, in one place.
 *
 *   shop_product_viewed → shop_variant_selected → shop_add_to_cart
 *     → shop_checkout_started → shop_purchase_completed
 *
 * add_to_cart is optional in the funnel: a BuyButton in mode="buy" goes
 * straight from variant to checkout. Build the PostHog funnel in NON-STRICT
 * order so the cart path and the direct-buy path both count.
 *
 * Everything here rides `logActivity(name, "shop", …)` — the pattern the shop
 * already runs on, and the reason the six names are registered in the
 * ActivityEventType union. logActivity remaps a fixed camelCase allowlist and
 * passes anything else through verbatim, so every property below is already
 * snake_case and lands unmodified.
 *
 * Properties are deliberately BOUNDED: closed unions and flattened LoopConfig
 * fields, never the config object, never a configKey, never an href. The one
 * sanctioned high-cardinality property is `stripe_session_id`, which exists to
 * join to Stripe for revenue reconciliation — a join key, never a breakdown.
 *
 * Spec: docs/architecture/landing-analytics-taxonomy.md
 */
import { getActivityLogger } from "#lib/shared/analytics/get-activity-logger.js";
import { captureEvent } from "#lib/shared/analytics/services/posthog.js";
import type { Product } from "../domain/models/product";
import type { LoopConfig } from "../domain/loop-config";

/** Which shop entry surface the buyer is on. Configurator listings span
 *  several backing SKUs, so this is the PAGE's identity, not `Product.listing`. */
export type ShopListing =
  | "loop-deck"
  | "loop-deck-architect"
  | "tnd-trilogy"
  | "starter-pack"
  | "sku";

/** Every dial that can move, so step 2 is uniform regardless of which one did.
 *  No "volume" member: the TnD volume switch changes product_id rather than a
 *  variant, and widening a closed union silently breaks historical charts. */
export type VariantKind =
  | "prop"
  | "loop_pack"
  | "loop_level"
  | "loop_length"
  | "loop_flavor"
  | "recipe";

/** Where checkout was initiated from. The two mobile sticky docks call
 *  store.startCheckout directly, so they report as "buy_button" for free. */
export type CheckoutSurface = "buy_button" | "cart_drawer";

function log(
  event:
    | "shop_product_viewed"
    | "shop_variant_selected"
    | "shop_add_to_cart"
    | "shop_cart_opened",
  metadata: Record<string, unknown>
): void {
  getActivityLogger().logActivity(event, "shop", metadata);
}

/** LoopConfig is a union of shapes (pack XOR dials XOR recipe) and `recipe` is
 *  an array of up to 8 slices — effectively unique per buyer. Flatten to the
 *  closed-union fields and drop the rest. */
function flattenLoopConfig(loopConfig?: LoopConfig): Record<string, unknown> {
  return {
    loop_pack: loopConfig?.pack ?? null,
    loop_level: loopConfig?.level ?? null,
    loop_length: loopConfig?.length ?? null,
    loop_flavor: loopConfig?.flavor ?? null,
  };
}

/* ── Step 1 ─────────────────────────────────────────────────────────────── */

/**
 * A shop entry page mounted. One event for both SKU pages and configurator
 * listings so the funnel has a single step 1.
 *
 * `product` is null on a configurator whose SKU hasn't resolved (or failed to);
 * `listing` always answers "which door did they come in", which is the
 * breakdown that matters here.
 */
export function trackProductViewed(
  listing: ShopListing,
  product: Product | null
): void {
  log("shop_product_viewed", {
    listing,
    product_id: product?.id ?? null,
    product_type: product?.type ?? null,
    price_cents: product?.price ?? null,
    is_preorder: product?.preorder ?? false,
    status: product?.status ?? null,
  });
}

/* ── Step 2 ─────────────────────────────────────────────────────────────── */

/**
 * A dial moved. `variant_value` is null for `recipe` (a buyer-authored slice
 * list has no bounded value) — `recipe_slice_count` carries its shape instead.
 */
export function trackVariantSelected(props: {
  listing: ShopListing;
  productId?: string | null;
  variantKind: VariantKind;
  variantValue?: string | null;
  recipeSliceCount?: number | null;
}): void {
  log("shop_variant_selected", {
    listing: props.listing,
    product_id: props.productId ?? null,
    variant_kind: props.variantKind,
    variant_value: props.variantValue ?? null,
    recipe_slice_count: props.recipeSliceCount ?? null,
  });
}

/**
 * The prop picker moved — the one variant every entry page shares, and the one
 * that was re-authored as an inline object literal at all five PropPicker
 * `onchange` handlers. Routing them through a named function means a future
 * change to this event's shape is a signature change every call site is forced
 * to answer, instead of four silently-diverging payloads and one updated one.
 */
export function trackPropSelected(
  listing: ShopListing,
  productId: string | null | undefined,
  propType: string
): void {
  trackVariantSelected({
    listing,
    productId,
    variantKind: "prop",
    variantValue: propType,
  });
}

/* ── Step 3 ─────────────────────────────────────────────────────────────── */

/** A line was pushed to the cart. Fired from BuyButton, which is the only
 *  place holding product + prop + config together; shop-cart.svelte.ts has no
 *  page context and stays uninstrumented. */
export function trackAddToCart(props: {
  listing: ShopListing;
  product: Product;
  propType?: string;
  loopConfig?: LoopConfig;
}): void {
  log("shop_add_to_cart", {
    listing: props.listing,
    product_id: props.product.id,
    product_name: props.product.name,
    product_type: props.product.type,
    unit_price_cents: props.product.price,
    // Null for guide/poster/material/digital/sampler — those pass no prop.
    prop_type: props.propType ?? null,
    ...flattenLoopConfig(props.loopConfig),
    qty: 1,
  });
}

/* ── Step 4 ─────────────────────────────────────────────────────────────── */

/**
 * Checkout was initiated. Both paths assign `window.location.href` immediately
 * after this returns, so the event has to survive the unload: `send_instantly`
 * skips PostHog's batch queue and `sendBeacon` hands the request to the browser
 * to deliver independently of the document. Batched, this event would be lost
 * on every conversion — the exact opposite of what the funnel needs. Same
 * treatment scan-analytics.ts gives its pagehide summary.
 *
 * That option passthrough is why this one goes through captureEvent rather than
 * logActivity (which takes no CaptureOptions). `category: "shop"` is set by
 * hand so the payload shape matches every other event in this module.
 */
export function trackCheckoutStarted(props: {
  surface: CheckoutSurface;
  productId?: string | null;
  lineItemCount: number;
  subtotalCents?: number | null;
  propType?: string;
  loopConfig?: LoopConfig;
  isPreorder?: boolean | null;
}): void {
  captureEvent(
    "shop_checkout_started",
    {
      category: "shop",
      surface: props.surface,
      product_id: props.productId ?? null,
      line_item_count: props.lineItemCount,
      subtotal_cents: props.subtotalCents ?? null,
      prop_type: props.propType ?? null,
      ...flattenLoopConfig(props.loopConfig),
      is_preorder: props.isPreorder ?? null,
    },
    { send_instantly: true, transport: "sendBeacon" }
  );
}

/* ── Step 5 ─────────────────────────────────────────────────────────────── */

const PURCHASE_TRACKED_PREFIX = "tka:shop:purchase-tracked:";

/**
 * The buyer landed on /shop/success. Deduped per Stripe session: a refresh or a
 * bookmarked success URL would otherwise re-fire and inflate conversion, which
 * is the difference between a trustworthy funnel and a broken one.
 *
 * No value_cents — order value isn't readable client-side here (it needs a
 * callable resolving the DraftOrder). Ship the valueless ping so the funnel
 * closes; inventing a number from stale localStorage cart state would be worse
 * than having none.
 */
export function trackPurchaseCompleted(stripeSessionId: string | null): void {
  const key = stripeSessionId ? `${PURCHASE_TRACKED_PREFIX}${stripeSessionId}` : null;
  if (key) {
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // Private-mode / blocked storage: fire anyway. A possible duplicate beats
      // a missing purchase step.
    }
  }
  getActivityLogger().logActivity("shop_purchase_completed", "shop", {
    // High-cardinality by design: the join key back to Stripe for revenue
    // reconciliation. Never use it as a breakdown dimension.
    stripe_session_id: stripeSessionId,
    has_session: stripeSessionId !== null,
  });
}

/* ── Supporting ─────────────────────────────────────────────────────────── */

/** Not a funnel step — this is how you tell "opened the cart and left" from
 *  "never opened the cart at all". */
export function trackCartOpened(itemCount: number, subtotalCents: number): void {
  log("shop_cart_opened", {
    item_count: itemCount,
    subtotal_cents: subtotalCents,
  });
}
