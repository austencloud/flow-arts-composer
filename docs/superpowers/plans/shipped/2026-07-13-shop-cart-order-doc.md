# Shop Cart + Order-Doc Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a buyer purchase multiple products (posters, guides, decks) in one order, backed by a draft order doc written to Firestore before payment so Stripe carries only a reference.

**Architecture:** Server-authoritative draft order. A new callable `createCartCheckout` resolves prices from `products/{id}`, writes a `pending` `orders/{id}` doc holding the full line-item array, builds an N-line Stripe session with `metadata.orderRef`, and the webhook flips the doc to `paid` by id. Cart lives in `localStorage`, drawer scoped to `/shop`. Single-buy, configurator, and architect all migrate onto the one-item form of the spine; the legacy metadata path stays until production cutover.

**Tech Stack:** SvelteKit + Svelte 5 runes, Firebase Cloud Functions (v1 `functions.https.onCall`), Stripe Checkout, Firestore, Vitest (client) + the firebase-functions test suite.

**Spec:** `docs/superpowers/specs/active/2026-07-13-shop-cart-order-doc-design.md`

---

## File map

**firebase-functions (backend):**
- Create: `firebase-functions/src/merch/loopConfigValidation.ts` — shared `validateLoopConfig`/`validateRecipe` + whitelists (extracted from `createMerchCheckout.ts`).
- Create: `firebase-functions/src/merch/cartCheckoutParams.ts` — `buildCartCheckoutParams` (N line_items + `orderRef` metadata).
- Create: `firebase-functions/src/merch/cartCheckoutParams.test.ts`.
- Create: `firebase-functions/src/merch/createCartCheckout.ts` — the callable.
- Modify: `firebase-functions/src/merch/createMerchCheckout.ts` — import shared validators.
- Modify: `firebase-functions/src/merch/handleMerchWebhook.ts` — `orderRef` branch.
- Modify: `firebase-functions/src/index.ts` — export `createCartCheckout`.

**Client:**
- Create: `src/lib/features/store/state/shop-cart.svelte.ts` — localStorage cart state.
- Create: `src/lib/features/store/state/shop-cart.test.ts`.
- Create: `src/lib/features/store/services/cart-checkout-creator.ts` — callable wrapper.
- Create: `src/lib/features/store/get-cart-checkout-creator.ts`.
- Create: `src/lib/features/store/components/CartDrawer.svelte`.
- Create: `src/lib/features/store/components/CartButton.svelte`.
- Modify: `src/lib/features/store/components/BuyButton.svelte` — `mode:"buy"|"add"`.
- Modify: `src/lib/features/store/domain/models/product.ts` — `"poster"` product type + draft-order line/order types.
- Modify: `src/routes/(public)/shop/+layout.svelte` — mount `CartButton` + `CartDrawer`.
- Modify: `firestore.rules` — TTL-friendly note on `orders` (rules already admin-only; add `expiresAt` shape comment only).

---

## Phase 1 — Backend spine

### Task 1: Extract shared LOOP-config validators

**Files:**
- Create: `firebase-functions/src/merch/loopConfigValidation.ts`
- Modify: `firebase-functions/src/merch/createMerchCheckout.ts:10-152` (remove inlined validators + whitelists, import instead)
- Test: reuse `firebase-functions/src/merch/checkoutParams.test.ts` (unchanged; proves no regression)

- [ ] **Step 1: Create the shared module** (verbatim move of the constants + validators currently in `createMerchCheckout.ts`, plus the request interfaces they use)

Create `firebase-functions/src/merch/loopConfigValidation.ts`:

```ts
import * as functions from "firebase-functions";

export interface RecipeSliceRequest {
  count?: number;
  flavor?: string;
  level?: number;
  steps?: number;
  maxTurns?: number;
}

export interface LoopConfigRequest {
  pack?: string;
  recipe?: RecipeSliceRequest[];
  level?: string;
  length?: string;
  flavor?: string;
  custom?: {
    maxTurns?: number;
    levelBalance?: string;
    excludeFlavors?: string[];
  };
}

// Mirrors of the client whitelists (src/lib/features/store/domain/
// shop-prop-options.ts and loop-config.ts) — the client codebase can't be
// imported from the functions build. Keep in sync.
export const SHOP_PROP_TYPES = ["staff", "club", "fan", "triad", "buugeng"] as const;
const LOOP_LEVELS = ["1", "2", "3", "mix"] as const;
const LOOP_LENGTHS = ["8", "12", "16", "mix"] as const;
const LOOP_FLAVORS = [
  "variety", "rotated", "mirrored", "flipped", "swapped", "inverted", "rewound",
  "mirrored-swapped", "mirrored-inverted", "mirrored-rotated", "rotated-swapped",
  "rotated-inverted", "swapped-inverted", "mirrored-swapped-inverted",
  "mirrored-inverted-rotated", "mirrored-rotated-swapped",
  "mirrored-rotated-inverted-swapped",
] as const;
const LEVEL_BALANCES = ["mostly-1", "even", "mostly-spicy"] as const;
const LOOP_PACKS = ["mild", "medium", "spicy"] as const;
const DECK_SIZE = 54;
const MAX_RECIPE_SLICES = 8;
const RECIPE_STEPS = [4, 8, 12, 16] as const;

function validateRecipe(slices: RecipeSliceRequest[], bad: (msg: string) => void): void {
  if (!Array.isArray(slices) || slices.length === 0) bad("Recipe needs at least one slice");
  if (slices.length > MAX_RECIPE_SLICES) bad("Too many recipe slices");
  let total = 0;
  for (const s of slices) {
    if (!Number.isInteger(s.count) || (s.count as number) < 1) bad("Bad slice count");
    total += s.count as number;
    if (
      typeof s.flavor !== "string" ||
      s.flavor === "variety" ||
      !LOOP_FLAVORS.includes(s.flavor as never)
    )
      bad("Unknown slice flavor");
    if (![1, 2, 3].includes(s.level as number)) bad("Bad slice level");
    if (!RECIPE_STEPS.includes(s.steps as never)) bad("Bad slice steps");
    if (s.level === 1) {
      if (s.maxTurns !== undefined) bad("Level 1 slices carry no turns");
    } else {
      const t = s.maxTurns;
      if (typeof t !== "number" || t < 0.5 || t > 3 || (t * 2) % 1 !== 0)
        bad("Bad slice turn ceiling");
      else if (s.level === 2 && t % 1 !== 0) bad("Half turns are Level 3 only");
    }
  }
  if (total !== DECK_SIZE) bad(`Recipe must total exactly ${DECK_SIZE} cards`);
}

export function validateLoopConfig(cfg: LoopConfigRequest): void {
  const bad = (msg: string) => {
    throw new functions.https.HttpsError("invalid-argument", msg);
  };
  const dialsPresent =
    cfg.level !== undefined ||
    cfg.length !== undefined ||
    cfg.flavor !== undefined ||
    cfg.custom !== undefined;
  if (cfg.pack !== undefined) {
    if (!LOOP_PACKS.includes(cfg.pack as never)) bad("Unknown loop pack");
    if (dialsPresent || cfg.recipe !== undefined) bad("Pack orders carry no dial fields");
    return;
  }
  if (cfg.recipe !== undefined) {
    if (dialsPresent) bad("Recipe orders carry no dial fields");
    validateRecipe(cfg.recipe, bad);
    return;
  }
  if (!LOOP_LEVELS.includes(cfg.level as never)) bad("Unknown loop level");
  if (!LOOP_LENGTHS.includes(cfg.length as never)) bad("Unknown loop length");
  if (!LOOP_FLAVORS.includes(cfg.flavor as never)) bad("Unknown loop flavor");
  if (cfg.custom) {
    if (cfg.custom.maxTurns !== undefined) {
      const t = cfg.custom.maxTurns;
      if (typeof t !== "number" || t < 0.5 || t > 3 || (t * 2) % 1 !== 0)
        bad("Unknown max turns");
    }
    if (
      cfg.custom.levelBalance !== undefined &&
      !LEVEL_BALANCES.includes(cfg.custom.levelBalance as never)
    )
      bad("Unknown level balance");
    if (cfg.custom.excludeFlavors !== undefined) {
      if (
        !Array.isArray(cfg.custom.excludeFlavors) ||
        cfg.custom.excludeFlavors.some((f) => !LOOP_FLAVORS.includes(f as never))
      )
        bad("Unknown excluded flavor");
    }
  }
}
```

- [ ] **Step 2: Rewrite `createMerchCheckout.ts` to import them.** Delete lines 10-152 (the `RecipeSliceRequest`/`LoopConfigRequest` interfaces, all the `const` whitelists, `validateRecipe`, `validateLoopConfig`) and the now-duplicate `SHOP_PROP_TYPES`. Replace the top imports/usages so the file reads:

```ts
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import Stripe from "stripe";
import { defineString } from "firebase-functions/params";
import { buildMerchCheckoutParams } from "./checkoutParams";
import {
  validateLoopConfig,
  SHOP_PROP_TYPES,
  type LoopConfigRequest,
} from "./loopConfigValidation";

const stripeSecretKey = defineString("STRIPE_SECRET_KEY");
const appBaseUrl = defineString("APP_BASE_URL", { default: "https://tkaflowarts.com" });

interface CheckoutRequest {
  productId: string;
  propType?: string;
  loopConfig?: LoopConfigRequest;
}

interface CheckoutResponse {
  url: string;
}

export const createMerchCheckout = functions.https.onCall(
  async (data: CheckoutRequest): Promise<CheckoutResponse> => {
    const { productId, propType, loopConfig } = data;

    if (!productId || typeof productId !== "string") {
      throw new functions.https.HttpsError("invalid-argument", "productId is required");
    }
    if (
      propType !== undefined &&
      !SHOP_PROP_TYPES.includes(propType as (typeof SHOP_PROP_TYPES)[number])
    ) {
      throw new functions.https.HttpsError("invalid-argument", "Unknown propType");
    }
    if (loopConfig !== undefined) validateLoopConfig(loopConfig);

    const stripe = new Stripe(stripeSecretKey.value());
    const productDoc = await admin.firestore().collection("products").doc(productId).get();
    if (!productDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Product not found");
    }
    const product = productDoc.data()!;
    if (product.status !== "active") {
      throw new functions.https.HttpsError(
        "failed-precondition", "Product is not available for purchase"
      );
    }
    const baseUrl = appBaseUrl.value();
    const session = await stripe.checkout.sessions.create(
      buildMerchCheckoutParams({
        product: product as { name: string; stripePriceId: string },
        productId,
        baseUrl,
        propType,
        loopConfig,
      })
    );
    if (!session.url) {
      throw new functions.https.HttpsError("internal", "Failed to create checkout session");
    }
    return { url: session.url };
  }
);
```

- [ ] **Step 3: Build the functions package to confirm the extraction compiles**

Run: `cd firebase-functions && npm run build`
Expected: clean TypeScript build, no unused-symbol or missing-import errors.

- [ ] **Step 4: Run the existing param test (proves no behavior regression)**

Run: `cd firebase-functions && npm test -- checkoutParams`
Expected: PASS (all `buildMerchCheckoutParams` cases green).

- [ ] **Step 5: Commit**

```bash
git add firebase-functions/src/merch/loopConfigValidation.ts firebase-functions/src/merch/createMerchCheckout.ts
git commit -m "refactor(shop): extract shared LOOP-config validators for reuse" -- firebase-functions/src/merch/loopConfigValidation.ts firebase-functions/src/merch/createMerchCheckout.ts
```

---

### Task 2: Cart checkout params builder

**Files:**
- Create: `firebase-functions/src/merch/cartCheckoutParams.ts`
- Test: `firebase-functions/src/merch/cartCheckoutParams.test.ts`

- [ ] **Step 1: Write the failing test**

Create `firebase-functions/src/merch/cartCheckoutParams.test.ts`:

```ts
import { buildCartCheckoutParams } from "./cartCheckoutParams";

describe("buildCartCheckoutParams", () => {
  const base = {
    orderRef: "order_abc",
    baseUrl: "https://tkaflowarts.com",
    lineItems: [
      { stripePriceId: "price_deck", quantity: 1 },
      { stripePriceId: "price_poster", quantity: 3 },
    ],
  };

  it("emits one Stripe line item per cart line, preserving quantity", () => {
    const p = buildCartCheckoutParams(base);
    expect(p.line_items).toEqual([
      { price: "price_deck", quantity: 1 },
      { price: "price_poster", quantity: 3 },
    ]);
  });

  it("carries ONLY orderRef in metadata (no per-item cram)", () => {
    const p = buildCartCheckoutParams(base);
    expect(p.metadata).toEqual({ orderRef: "order_abc" });
  });

  it("enables automatic tax and explicit card payments", () => {
    const p = buildCartCheckoutParams(base);
    expect(p.automatic_tax).toEqual({ enabled: true });
    expect(p.payment_method_types).toEqual(["card"]);
  });

  it("collects worldwide shipping with tax_behavior on every rate", () => {
    const p = buildCartCheckoutParams(base);
    expect((p.shipping_address_collection?.allowed_countries ?? []).length).toBeGreaterThan(100);
    for (const o of p.shipping_options ?? []) {
      expect(o.shipping_rate_data?.tax_behavior).toBe("exclusive");
    }
  });

  it("builds success + cancel urls from baseUrl (cancel returns to cart)", () => {
    const p = buildCartCheckoutParams(base);
    expect(p.success_url).toBe(
      "https://tkaflowarts.com/shop/success?session_id={CHECKOUT_SESSION_ID}"
    );
    expect(p.cancel_url).toBe("https://tkaflowarts.com/shop");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd firebase-functions && npm test -- cartCheckoutParams`
Expected: FAIL — "Cannot find module './cartCheckoutParams'".

- [ ] **Step 3: Write the implementation** (reuses the same shipping constants shape as `checkoutParams.ts`)

Create `firebase-functions/src/merch/cartCheckoutParams.ts`:

```ts
import type Stripe from "stripe";
import { SHIPPING_COUNTRIES } from "./shippingCountries";

// Same PLACEHOLDER flat rates as checkoutParams.ts — one shipment per order.
const MERCH_SHIPPING_OPTIONS: Stripe.Checkout.SessionCreateParams.ShippingOption[] = [
  { shipping_rate_data: { type: "fixed_amount", display_name: "US shipping", tax_behavior: "exclusive", fixed_amount: { amount: 500, currency: "usd" } } },
  { shipping_rate_data: { type: "fixed_amount", display_name: "Canada shipping", tax_behavior: "exclusive", fixed_amount: { amount: 1400, currency: "usd" } } },
  { shipping_rate_data: { type: "fixed_amount", display_name: "International shipping", tax_behavior: "exclusive", fixed_amount: { amount: 2500, currency: "usd" } } },
];

export interface CartCheckoutLine {
  stripePriceId: string;
  quantity: number;
}

export function buildCartCheckoutParams(opts: {
  orderRef: string;
  baseUrl: string;
  lineItems: CartCheckoutLine[];
}): Stripe.Checkout.SessionCreateParams {
  const { orderRef, baseUrl, lineItems } = opts;
  return {
    mode: "payment",
    payment_method_types: ["card"],
    line_items: lineItems.map((l) => ({ price: l.stripePriceId, quantity: l.quantity })),
    automatic_tax: { enabled: true },
    shipping_address_collection: { allowed_countries: SHIPPING_COUNTRIES },
    shipping_options: MERCH_SHIPPING_OPTIONS,
    success_url: `${baseUrl}/shop/success?session_id={CHECKOUT_SESSION_ID}`,
    // Cart checkout has no single product to cancel back to — return to the shop.
    cancel_url: `${baseUrl}/shop`,
    metadata: { orderRef },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd firebase-functions && npm test -- cartCheckoutParams`
Expected: PASS (all 5 cases).

- [ ] **Step 5: Commit**

```bash
git add firebase-functions/src/merch/cartCheckoutParams.ts firebase-functions/src/merch/cartCheckoutParams.test.ts
git commit -m "feat(shop): cart checkout params builder (N line items, orderRef metadata)" -- firebase-functions/src/merch/cartCheckoutParams.ts firebase-functions/src/merch/cartCheckoutParams.test.ts
```

---

### Task 3: `createCartCheckout` callable

**Files:**
- Create: `firebase-functions/src/merch/createCartCheckout.ts`
- Modify: `firebase-functions/src/index.ts:65-66` (add export)

- [ ] **Step 1: Write the callable**

Create `firebase-functions/src/merch/createCartCheckout.ts`:

```ts
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import Stripe from "stripe";
import { defineString } from "firebase-functions/params";
import { buildCartCheckoutParams, type CartCheckoutLine } from "./cartCheckoutParams";
import {
  validateLoopConfig,
  SHOP_PROP_TYPES,
  type LoopConfigRequest,
} from "./loopConfigValidation";

const stripeSecretKey = defineString("STRIPE_SECRET_KEY");
const appBaseUrl = defineString("APP_BASE_URL", { default: "https://tkaflowarts.com" });

const PENDING_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CART_ITEMS = 20;

interface CartItemRequest {
  productId: string;
  quantity: number;
  propType?: string;
  loopConfig?: LoopConfigRequest;
}

interface CartCheckoutRequest {
  items: CartItemRequest[];
}

interface CheckoutResponse {
  url: string;
}

export const createCartCheckout = functions.https.onCall(
  async (data: CartCheckoutRequest): Promise<CheckoutResponse> => {
    const items = data?.items;
    if (!Array.isArray(items) || items.length === 0) {
      throw new functions.https.HttpsError("invalid-argument", "Cart is empty");
    }
    if (items.length > MAX_CART_ITEMS) {
      throw new functions.https.HttpsError("invalid-argument", "Too many items in cart");
    }

    const db = admin.firestore();

    // Resolve every line server-side: price + status come from the product doc,
    // never the client. Validate any LOOP config with the shared validators.
    const lineItems: CartCheckoutLine[] = [];
    const orderLines: Record<string, unknown>[] = [];
    let subtotal = 0;

    for (const item of items) {
      if (!item?.productId || typeof item.productId !== "string") {
        throw new functions.https.HttpsError("invalid-argument", "Line missing productId");
      }
      const qty = item.quantity;
      if (!Number.isInteger(qty) || qty < 1 || qty > 99) {
        throw new functions.https.HttpsError("invalid-argument", "Bad line quantity");
      }
      if (
        item.propType !== undefined &&
        !SHOP_PROP_TYPES.includes(item.propType as (typeof SHOP_PROP_TYPES)[number])
      ) {
        throw new functions.https.HttpsError("invalid-argument", "Unknown propType");
      }
      const isLoopDeck = item.loopConfig !== undefined;
      if (isLoopDeck) {
        validateLoopConfig(item.loopConfig as LoopConfigRequest);
        if (qty !== 1) {
          throw new functions.https.HttpsError("invalid-argument", "Configured decks are qty 1");
        }
      }

      const snap = await db.collection("products").doc(item.productId).get();
      if (!snap.exists) {
        throw new functions.https.HttpsError("not-found", `Product ${item.productId} not found`);
      }
      const product = snap.data()!;
      if (product.status !== "active") {
        throw new functions.https.HttpsError(
          "failed-precondition", `Product ${item.productId} is not available`
        );
      }
      const stripePriceId = product.stripePriceId as string;
      const unitPrice = (product.price as number) ?? 0;
      if (!stripePriceId) {
        throw new functions.https.HttpsError(
          "failed-precondition", `Product ${item.productId} has no price`
        );
      }

      lineItems.push({ stripePriceId, quantity: qty });
      subtotal += unitPrice * qty;
      orderLines.push({
        kind: isLoopDeck ? "loopDeck" : "sku",
        productId: item.productId,
        stripePriceId,
        name: product.name ?? "",
        unitPrice,
        qty,
        ...(item.propType && { propType: item.propType }),
        ...(isLoopDeck && { loopConfig: item.loopConfig }),
      });
    }

    // Write the pending order BEFORE Stripe so the webhook has a doc to flip.
    const now = admin.firestore.Timestamp.now();
    const expiresAt = admin.firestore.Timestamp.fromMillis(now.toMillis() + PENDING_TTL_MS);
    const orderRef = db.collection("orders").doc();
    await orderRef.set({
      status: "pending",
      lineItems: orderLines,
      subtotal,
      createdAt: now,
      expiresAt,
    });

    const stripe = new Stripe(stripeSecretKey.value());
    const session = await stripe.checkout.sessions.create(
      buildCartCheckoutParams({
        orderRef: orderRef.id,
        baseUrl: appBaseUrl.value(),
        lineItems,
      })
    );
    if (!session.url) {
      throw new functions.https.HttpsError("internal", "Failed to create checkout session");
    }
    await orderRef.update({ stripeSessionId: session.id });
    return { url: session.url };
  }
);
```

- [ ] **Step 2: Export it from the functions index**

In `firebase-functions/src/index.ts`, directly after line 65 (`export { createMerchCheckout } ...`), add:

```ts
export { createCartCheckout } from "./merch/createCartCheckout";
```

- [ ] **Step 3: Build to confirm it compiles**

Run: `cd firebase-functions && npm run build`
Expected: clean build.

- [ ] **Step 4: Commit**

```bash
git add firebase-functions/src/merch/createCartCheckout.ts firebase-functions/src/index.ts
git commit -m "feat(shop): createCartCheckout callable writes pending order before Stripe" -- firebase-functions/src/merch/createCartCheckout.ts firebase-functions/src/index.ts
```

---

### Task 4: Webhook `orderRef` branch

**Files:**
- Modify: `firebase-functions/src/merch/handleMerchWebhook.ts:34-94`

- [ ] **Step 1: Add the orderRef branch ahead of the legacy path.** Replace the `if (event.type === "checkout.session.completed") { ... }` block (lines 34-94) with:

```ts
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const shippingDetails = session.collected_information?.shipping_details;
      const shippingAddress = shippingDetails?.address
        ? {
            name: shippingDetails.name || "",
            line1: shippingDetails.address.line1 || "",
            line2: shippingDetails.address.line2 || "",
            city: shippingDetails.address.city || "",
            state: shippingDetails.address.state || "",
            postalCode: shippingDetails.address.postal_code || "",
            country: shippingDetails.address.country || "",
          }
        : null;

      // NEW spine: the order doc already exists (pending), created by
      // createCartCheckout. Flip it to paid and attach Stripe fields. Clear
      // expiresAt so the Firestore TTL policy never reaps a paid order.
      if (session.metadata?.orderRef) {
        const orderRef = admin.firestore().collection("orders").doc(session.metadata.orderRef);
        await orderRef.set(
          {
            status: "paid",
            stripePaymentIntentId: session.payment_intent as string,
            customerEmail: session.customer_details?.email || "",
            shippingAddress,
            totalAmount: session.amount_total || 0,
            paidAt: admin.firestore.FieldValue.serverTimestamp(),
            expiresAt: admin.firestore.FieldValue.delete(),
          },
          { merge: true }
        );
        console.log(`Order ${session.metadata.orderRef} marked paid`);
        res.status(200).send("OK");
        return;
      }

      // LEGACY path: single-product orders whose config rode in metadata.
      // Kept for in-flight sessions created before the cart cutover; remove
      // once no legacy sessions remain (see plan Task 12).
      if (!session.metadata?.productId) {
        res.status(200).send("Not a merch checkout, skipping");
        return;
      }
      const order = {
        stripeSessionId: session.id,
        stripePaymentIntentId: session.payment_intent as string,
        customerEmail: session.customer_details?.email || "",
        shippingAddress,
        items: [{
          productId: session.metadata.productId,
          productName: session.metadata.productName || "",
          ...(session.metadata.propType && { propType: session.metadata.propType }),
          ...(session.metadata.loopPack && { loopPack: session.metadata.loopPack }),
          ...(session.metadata.loopRecipe && { loopRecipe: session.metadata.loopRecipe }),
          ...(session.metadata.loopLevel && {
            loopLevel: session.metadata.loopLevel,
            loopLength: session.metadata.loopLength || "",
            loopFlavor: session.metadata.loopFlavor || "",
            ...(session.metadata.loopCustom && { loopCustom: session.metadata.loopCustom }),
          }),
          quantity: 1,
          unitPrice: session.amount_subtotal || 0,
        }],
        totalAmount: session.amount_total || 0,
        status: "paid",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      await admin.firestore().collection("orders").add(order);
      console.log(`Order created for product ${session.metadata.productId}`);
    }
```

Note: the shared `shippingAddress` extraction now sits once above both branches (the legacy block previously built it inline).

- [ ] **Step 2: Build to confirm it compiles**

Run: `cd firebase-functions && npm run build`
Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add firebase-functions/src/merch/handleMerchWebhook.ts
git commit -m "feat(shop): webhook flips pending order to paid via orderRef" -- firebase-functions/src/merch/handleMerchWebhook.ts
```

---

### Task 5: Firestore TTL note on orders

**Files:**
- Modify: `firestore.rules:1343-1347`

`orders` is already client-write-denied (admin SDK only) — no rule change needed for security. Document the `expiresAt` contract so a future editor doesn't add a client write or drop the TTL field.

- [ ] **Step 1: Replace the orders comment block** (lines 1343-1347) with:

```
    // ── STORE: ORDERS (admin only; Cloud Functions use the Admin SDK) ──
    // createCartCheckout writes a `pending` doc with `expiresAt` (now + 24h);
    // the Stripe webhook flips it to `paid` and DELETES `expiresAt`. A Firestore
    // TTL policy on `orders.expiresAt` reaps abandoned pending docs — it deletes
    // purely on the timestamp, so paid orders MUST clear the field (they do).
    // Never allow client writes here: prices/status are resolved server-side.
    match /orders/{orderId} {
      allow read: if isAdmin();
      allow write: if false; // Admin SDK bypasses rules; clients never write.
    }
```

- [ ] **Step 2: Deploy note (manual, not code).** Add the TTL policy in the Firebase console / CLI once (not part of this commit): Firestore → TTL → collection `orders`, field `expiresAt`. Record this in the plan's rollout checklist below.

- [ ] **Step 3: Commit**

```bash
git add firestore.rules
git commit -m "docs(shop): document orders TTL contract; deny client writes explicitly" -- firestore.rules
```

---

## Phase 2 — Client cart

### Task 6: Cart state module

**Files:**
- Create: `src/lib/features/store/state/shop-cart.svelte.ts`
- Test: `src/lib/features/store/state/shop-cart.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/features/store/state/shop-cart.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { createShopCart, type CartLine } from "./shop-cart.svelte";

const poster: CartLine = {
  kind: "sku", productId: "poster_a", name: "Mandala Poster",
  unitPrice: 2500, stripePriceId: "price_poster", qty: 1,
};
const deck = (id: string): CartLine => ({
  kind: "loopDeck", productId: "loop_deck", name: "LOOP Deck",
  unitPrice: 3000, stripePriceId: "price_deck", qty: 1,
  propType: "staff", loopConfig: { pack: "mild" }, configKey: id,
});

describe("createShopCart", () => {
  beforeEach(() => localStorage.clear());

  it("starts empty", () => {
    const cart = createShopCart();
    expect(cart.lines).toEqual([]);
    expect(cart.count).toBe(0);
    expect(cart.subtotal).toBe(0);
  });

  it("adds a SKU and reflects count + subtotal", () => {
    const cart = createShopCart();
    cart.add(poster);
    expect(cart.count).toBe(1);
    expect(cart.subtotal).toBe(2500);
  });

  it("dedupes a re-added SKU by bumping quantity, not adding a line", () => {
    const cart = createShopCart();
    cart.add(poster);
    cart.add(poster);
    expect(cart.lines.length).toBe(1);
    expect(cart.lines[0].qty).toBe(2);
    expect(cart.subtotal).toBe(5000);
  });

  it("keeps distinct configured decks as separate lines (never deduped)", () => {
    const cart = createShopCart();
    cart.add(deck("cfg1"));
    cart.add(deck("cfg2"));
    expect(cart.lines.length).toBe(2);
  });

  it("locks configured-deck quantity to 1 even if setQty asks for more", () => {
    const cart = createShopCart();
    cart.add(deck("cfg1"));
    cart.setQty(cart.lines[0].key, 5);
    expect(cart.lines[0].qty).toBe(1);
  });

  it("clamps SKU quantity to >= 1 and removes on 0", () => {
    const cart = createShopCart();
    cart.add(poster);
    cart.setQty(cart.lines[0].key, 0);
    expect(cart.lines.length).toBe(0);
  });

  it("persists across instances via localStorage", () => {
    const a = createShopCart();
    a.add(poster);
    const b = createShopCart();
    expect(b.count).toBe(1);
    expect(b.lines[0].productId).toBe("poster_a");
  });

  it("clears everything", () => {
    const cart = createShopCart();
    cart.add(poster);
    cart.clear();
    expect(cart.count).toBe(0);
  });

  it("exports checkout items in the callable's shape", () => {
    const cart = createShopCart();
    cart.add(poster);
    cart.add(deck("cfg1"));
    expect(cart.toCheckoutItems()).toEqual([
      { productId: "poster_a", quantity: 1 },
      { productId: "loop_deck", quantity: 1, propType: "staff", loopConfig: { pack: "mild" } },
    ]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/features/store/state/shop-cart.test.ts`
Expected: FAIL — cannot find module `./shop-cart.svelte`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/features/store/state/shop-cart.svelte.ts`:

```ts
/**
 * Shop cart — a localStorage-backed line list scoped to /shop. No Firestore
 * writes until checkout: the draft order is created server-side by
 * createCartCheckout (spec 2026-07-13-shop-cart-order-doc-design). SKU lines
 * dedupe by productId; configured decks are unique (configKey) and qty-locked
 * to 1, since each deck is generated fresh at fulfillment.
 */
import type { LoopConfig } from "../domain/loop-config";

const STORAGE_KEY = "tka:shop:cart";

interface BaseLine {
  productId: string;
  name: string;
  unitPrice: number; // cents, last-known; server re-resolves at checkout
  stripePriceId: string;
  qty: number;
}
export interface SkuLine extends BaseLine {
  kind: "sku";
}
export interface LoopDeckLine extends BaseLine {
  kind: "loopDeck";
  qty: 1;
  propType?: string;
  loopConfig: LoopConfig;
  /** Distinguishes two decks with the same productId but different configs. */
  configKey: string;
}
export type CartLine = SkuLine | LoopDeckLine;

/** A stored line plus a stable UI key. */
type StoredLine = CartLine & { key: string };

export interface CheckoutItem {
  productId: string;
  quantity: number;
  propType?: string;
  loopConfig?: LoopConfig;
}

function lineIdentity(line: CartLine): string {
  return line.kind === "loopDeck"
    ? `deck:${line.productId}:${line.configKey}`
    : `sku:${line.productId}`;
}

function load(): StoredLine[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StoredLine[]) : [];
  } catch {
    return [];
  }
}

export function createShopCart() {
  let lines = $state<StoredLine[]>(load());

  function persist() {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
  }

  function add(line: CartLine) {
    const key = lineIdentity(line);
    if (line.kind === "sku") {
      const existing = lines.find((l) => l.key === key);
      if (existing) {
        existing.qty += line.qty;
        persist();
        return;
      }
    }
    lines.push({ ...line, key });
    persist();
  }

  function setQty(key: string, qty: number) {
    const line = lines.find((l) => l.key === key);
    if (!line) return;
    if (line.kind === "loopDeck") {
      line.qty = 1; // configured decks are always singular
      persist();
      return;
    }
    if (qty < 1) {
      remove(key);
      return;
    }
    line.qty = qty;
    persist();
  }

  function remove(key: string) {
    lines = lines.filter((l) => l.key !== key);
    persist();
  }

  function clear() {
    lines = [];
    persist();
  }

  function toCheckoutItems(): CheckoutItem[] {
    return lines.map((l) =>
      l.kind === "loopDeck"
        ? {
            productId: l.productId,
            quantity: 1,
            ...(l.propType && { propType: l.propType }),
            loopConfig: l.loopConfig,
          }
        : { productId: l.productId, quantity: l.qty }
    );
  }

  return {
    get lines() { return lines; },
    get count() { return lines.reduce((n, l) => n + l.qty, 0); },
    get subtotal() { return lines.reduce((n, l) => n + l.unitPrice * l.qty, 0); },
    add,
    setQty,
    remove,
    clear,
    toCheckoutItems,
  };
}

export type ShopCart = ReturnType<typeof createShopCart>;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/features/store/state/shop-cart.test.ts`
Expected: PASS (all 9 cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/store/state/shop-cart.svelte.ts src/lib/features/store/state/shop-cart.test.ts
git commit -m "feat(shop): localStorage cart state (dedupe SKUs, lock deck qty)" -- src/lib/features/store/state/shop-cart.svelte.ts src/lib/features/store/state/shop-cart.test.ts
```

---

### Task 7: Cart checkout creator (client callable wrapper)

**Files:**
- Create: `src/lib/features/store/services/cart-checkout-creator.ts`
- Create: `src/lib/features/store/get-cart-checkout-creator.ts`

- [ ] **Step 1: Write the callable wrapper** (mirrors `merch-checkout-creator.ts`)

Create `src/lib/features/store/services/cart-checkout-creator.ts`:

```ts
import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "$lib/shared/auth/firebase";
import type { CheckoutItem } from "../state/shop-cart.svelte";

export async function createCartCheckoutSession(items: CheckoutItem[]): Promise<string> {
  const functions = getFunctions(app);
  const createCartCheckout = httpsCallable<{ items: CheckoutItem[] }, { url: string }>(
    functions,
    "createCartCheckout"
  );
  const result = await createCartCheckout({ items });
  return result.data.url;
}
```

- [ ] **Step 2: Write the accessor** (mirrors `get-merch-checkout-creator.ts`)

Create `src/lib/features/store/get-cart-checkout-creator.ts`:

```ts
import * as cartCheckoutCreator from "./services/cart-checkout-creator";

export function getCartCheckoutCreator() {
  return cartCheckoutCreator;
}
```

- [ ] **Step 3: Typecheck (warm checker)**

Run: `npm run check:fast`
Expected: no new errors in the two created files.

- [ ] **Step 4: Commit**

```bash
git add src/lib/features/store/services/cart-checkout-creator.ts src/lib/features/store/get-cart-checkout-creator.ts
git commit -m "feat(shop): client wrapper for createCartCheckout callable" -- src/lib/features/store/services/cart-checkout-creator.ts src/lib/features/store/get-cart-checkout-creator.ts
```

---

### Task 8: Cart drawer component

**Files:**
- Create: `src/lib/features/store/components/CartDrawer.svelte`

Reuses `src/lib/shared/foundation/ui/Drawer.svelte` + `DrawerHeader.svelte`. Qty steppers are buttons (no checkbox). Checkout calls the creator from Task 7 with `cart.toCheckoutItems()`.

- [ ] **Step 1: Read the Drawer primitive's prop contract** so the wrapper passes the right props.

Run: `sed -n '1,60p' src/lib/shared/foundation/ui/Drawer.svelte`
Expected: note the `open`/`onClose`/side/title props (adapt the snippet below to the actual prop names if they differ — Drawer is the source of truth).

- [ ] **Step 2: Write the component**

Create `src/lib/features/store/components/CartDrawer.svelte`:

```svelte
<!--
  CartDrawer — the /shop cart, wrapping the shared Drawer primitive. Lists cart
  lines with button-based qty steppers (no checkboxes), a subtotal, and a
  Checkout button that hands cart.toCheckoutItems() to createCartCheckout.
  Scoped to /shop; never mounted in app-wide chrome.
-->
<script lang="ts">
  import Drawer from "$lib/shared/foundation/ui/Drawer.svelte";
  import type { ShopCart } from "../state/shop-cart.svelte";
  import { getCartCheckoutCreator } from "../get-cart-checkout-creator";

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
      window.location.href = url;
    } catch (e) {
      error = "Checkout isn't available right now. Try again in a moment.";
      console.error("[Cart] checkout failed:", e);
    } finally {
      isCheckingOut = false;
    }
  }
</script>

<Drawer {open} {onClose} title="Your cart" side="right">
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
```

- [ ] **Step 3: Typecheck**

Run: `npm run check:fast`
Expected: no new errors. If `Drawer.svelte`'s props differ (e.g. `onclose` vs `onClose`, or a `header` snippet instead of `title`), adjust the `<Drawer>` usage to match its actual signature from Step 1.

- [ ] **Step 4: Commit**

```bash
git add src/lib/features/store/components/CartDrawer.svelte
git commit -m "feat(shop): cart drawer on shared Drawer primitive" -- src/lib/features/store/components/CartDrawer.svelte
```

---

### Task 9: Cart button + mount in /shop layout

**Files:**
- Create: `src/lib/features/store/components/CartButton.svelte`
- Modify: `src/routes/(public)/shop/+layout.svelte`

The cart state is created once in the layout and shared with the button + drawer (module-scoped singleton so every /shop route sees the same cart). Not placed in global nav.

- [ ] **Step 1: Add a shared cart singleton accessor to the cart module.** Append to `src/lib/features/store/state/shop-cart.svelte.ts`:

```ts
// One cart per browser tab, shared across /shop routes. Created lazily so SSR
// (no localStorage) doesn't touch storage at import time.
let sharedCart: ShopCart | null = null;
export function getShopCart(): ShopCart {
  if (!sharedCart) sharedCart = createShopCart();
  return sharedCart;
}
```

- [ ] **Step 2: Write the cart button**

Create `src/lib/features/store/components/CartButton.svelte`:

```svelte
<!--
  CartButton — cart affordance + count badge. Rendered ONLY inside the /shop
  layout header, never in app-wide navigation (deliberate: no global commerce
  chrome — spec 2026-07-13-shop-cart-order-doc-design).
-->
<script lang="ts">
  import type { ShopCart } from "../state/shop-cart.svelte";
  interface Props { cart: ShopCart; onOpen: () => void; }
  let { cart, onOpen }: Props = $props();
</script>

<button class="cart-button" aria-label="Open cart ({cart.count} items)" onclick={onOpen}>
  <i class="fas fa-shopping-bag" aria-hidden="true"></i>
  {#if cart.count > 0}
    <span class="badge" aria-hidden="true">{cart.count}</span>
  {/if}
</button>

<style>
  .cart-button {
    position: relative; width: 44px; height: 44px; border-radius: 12px; cursor: pointer;
    display: inline-flex; align-items: center; justify-content: center; font-size: 18px;
    border: 1px solid var(--theme-stroke, rgba(255,255,255,0.14));
    background: var(--theme-card-bg, rgba(255,255,255,0.06));
    color: var(--theme-text, #fff);
  }
  .badge {
    position: absolute; top: -6px; right: -6px; min-width: 20px; height: 20px; padding: 0 5px;
    border-radius: 10px; display: inline-flex; align-items: center; justify-content: center;
    font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums;
    background: var(--theme-accent, #60a5fa); color: var(--theme-text-on-accent, #fff);
  }
</style>
```

- [ ] **Step 3: Mount button + drawer in the /shop layout.** Replace the entire contents of `src/routes/(public)/shop/+layout.svelte` with:

```svelte
<script lang="ts">
  // The cosmic background, SiteHeader, and cosmic theme tokens for every /shop
  // route come from the persistent MarketingChrome (root layout). This layout
  // adds the shop-scoped cart affordance (button + drawer) — deliberately NOT
  // in the app-wide nav.
  import CartButton from "$lib/features/store/components/CartButton.svelte";
  import CartDrawer from "$lib/features/store/components/CartDrawer.svelte";
  import { getShopCart } from "$lib/features/store/state/shop-cart.svelte";

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
```

- [ ] **Step 4: Typecheck + build**

Run: `npm run check:fast`
Expected: no new errors.

- [ ] **Step 5: Visual verification (ask Austen — browser use needs verbal OK per project rules).** State: "Cart button + drawer mounted on /shop. I can't verify visually without permission. Please open [localhost:5173/shop](https://localhost:5173/shop), click the cart button, and tell me: does the drawer slide in, is the button clear of the header, and does the badge update when you add an item?" Do not screenshot without an explicit yes.

- [ ] **Step 6: Commit**

```bash
git add src/lib/features/store/state/shop-cart.svelte.ts src/lib/features/store/components/CartButton.svelte "src/routes/(public)/shop/+layout.svelte"
git commit -m "feat(shop): mount cart button + drawer in /shop layout (scoped, no global badge)" -- src/lib/features/store/state/shop-cart.svelte.ts src/lib/features/store/components/CartButton.svelte "src/routes/(public)/shop/+layout.svelte"
```

---

### Task 10: Add-to-cart on BuyButton

**Files:**
- Modify: `src/lib/features/store/components/BuyButton.svelte:14-63`

Add a `mode: "buy" | "add"` prop. `"buy"` keeps the current direct-checkout behavior (still the conversion primary). `"add"` pushes a line onto the shared cart. Deck lines need a `configKey`; derive it from the loopConfig so two different configs stay distinct.

- [ ] **Step 1: Edit the script block.** Replace lines 14-36 (the `Props` interface, the destructure, and the `available` derived) with:

```svelte
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
  }

  let {
    product,
    propType,
    loopConfig,
    label = "Buy Now",
    waitlistText = "Not on sale yet. Leave an email and you'll hear the moment it is.",
    mode = "buy",
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
      });
    }
  }
```

- [ ] **Step 2: Add the imports.** In the same `<script>`, after the existing `import type { LoopConfig } ...` line, add:

```svelte
  import { getShopCart } from "../state/shop-cart.svelte";
```

- [ ] **Step 3: Branch the click handler.** Replace the `<button class="buy-button" ...>` opening tag (lines 39-43) with:

```svelte
  <button
    class="buy-button"
    onclick={() => (mode === "add" ? addToCart() : state.startCheckout(product.id, propType, loopConfig))}
    disabled={mode === "buy" && state.isCheckingOut}
  >
```

And replace the label body (lines 44-49) with:

```svelte
    {#if mode === "buy" && state.isCheckingOut}
      <span class="spinner" aria-hidden="true"></span>
      Opening checkout...
    {:else}
      {label}
    {/if}
```

- [ ] **Step 4: Typecheck**

Run: `npm run check:fast`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/store/components/BuyButton.svelte
git commit -m "feat(shop): BuyButton add-to-cart mode alongside direct buy" -- src/lib/features/store/components/BuyButton.svelte
```

---

## Phase 3 — Posters, migration, cutover

### Task 11: Poster product type + Add-to-cart on product detail

**Files:**
- Modify: `src/lib/features/store/domain/models/product.ts:4-9` (product type union) and `:73-101` (order/line types for the new draft shape)
- Modify: `src/lib/features/store/ProductDetailPage.svelte` (add a secondary Add-to-cart under the primary Buy)

- [ ] **Step 1: Extend `ProductType` and add draft-order types.** In `product.ts`, replace lines 4-9 with:

```ts
export type ProductType =
  | "physical-deck"
  | "sampler-pack"
  | "digital"
  | "guide"
  | "material"
  | "poster";
```

Then append the draft-order shapes at the end of the file (the pre-payment doc written by `createCartCheckout`, distinct from the legacy `Order`/`OrderItem` which stay for legacy paid docs):

```ts
/** A line in a pre-payment draft order (orders/{id} with status "pending").
 *  Written server-side by createCartCheckout; the webhook flips the doc to
 *  paid. Distinct from OrderItem (the legacy metadata-reconstructed shape). */
export type DraftOrderLine =
  | {
      readonly kind: "sku";
      readonly productId: string;
      readonly stripePriceId: string;
      readonly name: string;
      readonly unitPrice: number;
      readonly qty: number;
      readonly propType?: string;
    }
  | {
      readonly kind: "loopDeck";
      readonly productId: string;
      readonly stripePriceId: string;
      readonly name: string;
      readonly unitPrice: number;
      readonly qty: 1;
      readonly propType?: string;
      readonly loopConfig: Record<string, unknown>;
      /** Reserved for the approve/reject preview phase. */
      readonly sequenceIds?: string[];
    };

export type DraftOrderStatus = "pending" | "paid" | "expired";

export interface DraftOrder {
  readonly id: string;
  readonly status: DraftOrderStatus;
  readonly lineItems: readonly DraftOrderLine[];
  readonly subtotal: number;
  readonly stripeSessionId?: string;
  readonly stripePaymentIntentId?: string;
  readonly customerEmail?: string;
  readonly shippingAddress?: ShippingAddress | null;
  readonly totalAmount?: number;
}
```

- [ ] **Step 2: Add a secondary Add-to-cart on the product detail page.** Locate the `<BuyButton ... />` usage in `ProductDetailPage.svelte` (grep for it in Step 2a) and render a second instance in add mode directly beneath the primary.

Run first: `grep -n "BuyButton" src/lib/features/store/ProductDetailPage.svelte`
Then, immediately after the existing primary `<BuyButton .../>` (same `product`/`propType` props, no `mode` — stays the conversion primary), add:

```svelte
      {#if product.stripePriceId}
        <BuyButton {product} {propType} mode="add" label="Add to cart" />
      {/if}
```

(If the primary passes a `loopConfig`, pass the same `loopConfig` to the add-mode button so a configured deck adds correctly. For plain SKUs like posters there is no `loopConfig` and this is a straight add.)

- [ ] **Step 3: Typecheck**

Run: `npm run check:fast`
Expected: no new errors.

- [ ] **Step 4: Visual verification (ask Austen).** State: "Posters can be created as active products in the Stripe dashboard (type `poster`); the shop grid + detail page list them via the existing product loader, and the detail page now shows Add to cart under Buy. Please add a test poster product in Stripe (or point me at one), open its [/shop](https://localhost:5173/shop) detail page, click Add to cart, and confirm the badge increments and the drawer shows the poster."

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/store/domain/models/product.ts src/lib/features/store/ProductDetailPage.svelte
git commit -m "feat(shop): poster product type, draft-order types, add-to-cart on detail" -- src/lib/features/store/domain/models/product.ts src/lib/features/store/ProductDetailPage.svelte
```

---

### Task 12: Migrate single-buy onto the spine

**Files:**
- Modify: `src/lib/features/store/state/store-state.svelte.ts:94-110` (route `startCheckout` through the cart creator, one-item)

Single-buy (BuyButton `mode="buy"`, configurator, architect) currently calls `checkoutCreator.createCheckoutSession` → legacy `createMerchCheckout`. Point it at the cart callable with a one-item array so every purchase rides the spine and produces a `pending` order doc. The `CheckoutCreator` interface stays; we swap what it wraps.

- [ ] **Step 1: Change the injected creator to the cart wrapper.** The store state is constructed with a `checkoutCreator`. Rather than thread a new dependency, translate inside `startCheckout`. Replace lines 94-110 with:

```ts
  async function startCheckout(
    productId: string,
    propType?: string,
    loopConfig?: LoopConfig
  ) {
    isCheckingOut = true;
    checkoutError = null;
    try {
      // Single-buy rides the same spine as the cart: a one-item draft order.
      const url = await checkoutCreator.createCheckoutSession(productId, propType, loopConfig);
      window.location.href = url;
    } catch (e) {
      checkoutError = "Checkout isn't available yet. Try again later.";
      console.error("[Store] Checkout failed:", e);
    } finally {
      isCheckingOut = false;
    }
  }
```

(No behavior change here yet — the swap happens at the injection site so the store stays agnostic.)

- [ ] **Step 2: Point the injected creator at the cart callable.** Find where `createStoreState` is constructed with `getMerchCheckoutCreator()`.

Run: `grep -rn "getMerchCheckoutCreator\|createStoreState" src/lib src/routes`

At each construction site, replace the injected creator with an adapter that maps the single-buy signature onto the cart callable. Create the adapter once:

Create `src/lib/features/store/services/single-buy-checkout-creator.ts`:

```ts
import { createCartCheckoutSession } from "./cart-checkout-creator";
import type { LoopConfig } from "../domain/loop-config";

/** Adapts the legacy single-product checkout signature onto the cart spine:
 *  one item becomes a one-line draft order via createCartCheckout. */
export async function createCheckoutSession(
  productId: string,
  propType?: string,
  loopConfig?: LoopConfig
): Promise<string> {
  return createCartCheckoutSession([
    { productId, quantity: 1, ...(propType && { propType }), ...(loopConfig && { loopConfig }) },
  ]);
}
```

Then, at each `createStoreState(...)` call site currently passing `getMerchCheckoutCreator()`, pass this module instead:

```ts
import * as singleBuyCheckoutCreator from "$lib/features/store/services/single-buy-checkout-creator";
// ...
createStoreState(productLoader, singleBuyCheckoutCreator, initialProduct);
```

- [ ] **Step 3: Typecheck (full — cross-file injection change)**

Run: `npm run check > /tmp/check.log 2>&1; grep -niE "error" /tmp/check.log | head -30`
Expected: no errors introduced by the swap. `singleBuyCheckoutCreator` satisfies the `CheckoutCreator` interface (one method, matching signature).

- [ ] **Step 4: Visual verification (ask Austen).** State: "Single-buy now routes through createCartCheckout (one-item draft order). Please run a test purchase from the LOOP listing 'Preorder now' end to end in Stripe test mode and confirm: checkout opens, a `pending` order doc appears in `orders`, and after paying it flips to `paid` with `expiresAt` cleared." (Backend behavior — needs a real Stripe round trip; can't be unit-verified.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/store/state/store-state.svelte.ts src/lib/features/store/services/single-buy-checkout-creator.ts <the-edited-call-sites>
git commit -m "feat(shop): route single-buy through the cart spine (one-item draft order)" -- src/lib/features/store/state/store-state.svelte.ts src/lib/features/store/services/single-buy-checkout-creator.ts <the-edited-call-sites>
```

(Replace `<the-edited-call-sites>` with the exact file paths grep found in Step 2.)

---

### Task 13: Configurator + Architect add-to-cart; confirmation copy

**Files:**
- Modify: `src/lib/features/store/LoopDeckConfiguratorPage.svelte` (secondary Add to cart)
- Modify: `src/lib/features/store/DeckArchitectPage.svelte` (secondary Add to cart)
- Modify: `src/lib/features/store/components/OrderConfirmation.svelte:11` (generalize deck-specific copy)

- [ ] **Step 1: Add secondary Add-to-cart to the configurator.** These pages build their own checkout call (`store.startCheckout(...)`). Add an add-to-cart alongside "Preorder now" using the shared cart directly. In `LoopDeckConfiguratorPage.svelte`, add near the top of `<script>`:

```ts
  import { getShopCart } from "./state/shop-cart.svelte";
```

Wait — path is `../state` from the page? The page lives in `src/lib/features/store/`, so import is `./state/shop-cart.svelte`. Use:

```ts
  import { getShopCart } from "./state/shop-cart.svelte";
```

Add an `addToCart` helper that mirrors the deck-line shape (uses the page's existing `customSku`, `propType`, `loopConfig`):

```ts
  function addDeckToCart() {
    if (!customSku?.stripePriceId) return;
    getShopCart().add({
      kind: "loopDeck",
      productId: customSku.id,
      name: customSku.name,
      unitPrice: customSku.price,
      stripePriceId: customSku.stripePriceId,
      qty: 1,
      ...(propType && { propType }),
      loopConfig,
      configKey: JSON.stringify(loopConfig) + (propType ?? ""),
    });
  }
```

Render a secondary button next to the primary "Preorder now" (button styling per the page's existing secondary-action pattern — reuse it, don't invent):

```svelte
  <button class="secondary-action" onclick={addDeckToCart}>Add to cart</button>
```

- [ ] **Step 2: Mirror the same in `DeckArchitectPage.svelte`** using that page's recipe `loopConfig` (the `{ recipe: [...] }` shape) and its SKU/price variables. The add-line is identical in shape; `configKey = JSON.stringify(loopConfig) + (propType ?? "")` keeps distinct recipes distinct.

- [ ] **Step 3: Generalize the confirmation copy** (it says "Your deck is on its way" but orders can now be posters/guides/mixed). In `OrderConfirmation.svelte` replace line 11:

```svelte
    <p>Your order is on its way. You'll get a receipt from Stripe at the email you provided.</p>
```

- [ ] **Step 4: Typecheck**

Run: `npm run check > /tmp/check.log 2>&1; grep -niE "error" /tmp/check.log | head -30`
Expected: no new errors. (Adjust variable names in Steps 1-2 to the pages' actual SKU/config identifiers — grep each page for its existing `startCheckout(` call to find them.)

- [ ] **Step 5: Visual verification (ask Austen).** State: "Configurator + Architect now have Add to cart beside Preorder now; confirmation copy generalized. Please add a configured deck + a poster to the cart and check out together — confirm both appear as line items in Stripe and one `orders` doc holds both lines."

- [ ] **Step 6: Commit**

```bash
git add src/lib/features/store/LoopDeckConfiguratorPage.svelte src/lib/features/store/DeckArchitectPage.svelte src/lib/features/store/components/OrderConfirmation.svelte
git commit -m "feat(shop): add-to-cart on configurator + architect; generalize confirmation copy" -- src/lib/features/store/LoopDeckConfiguratorPage.svelte src/lib/features/store/DeckArchitectPage.svelte src/lib/features/store/components/OrderConfirmation.svelte
```

---

## Rollout checklist (post-implementation, operator actions)

- [ ] Deploy functions (`createCartCheckout` + webhook `orderRef` branch).
- [ ] Add the Firestore **TTL policy** on `orders.expiresAt` (console/CLI, one-time). Verify it does NOT touch `paid` docs (they clear `expiresAt`).
- [ ] Create poster products in Stripe (type `poster`, one price each) — they mirror to `products/{id}` via the existing sync.
- [ ] Test purchase in Stripe test mode: single-buy, cart with poster + deck, confirm `pending → paid`.
- [ ] Monitor for one live cycle. Once no legacy (`createMerchCheckout`) sessions remain in flight, remove `createMerchCheckout` + the legacy webhook branch + the now-unused `checkoutParams.ts` if nothing else uses it (separate cleanup commit).

## Self-review notes

- **Spec coverage:** draft-order spine (T3/T4), server-authoritative pricing (T3), localStorage cart (T6), CartDrawer/CartButton scoped to /shop (T8/T9), posters as SKUs (T11), single-buy migration (T12), configurator/architect (T13), TTL contract (T5). Approve/reject reserved via `sequenceIds` on `DraftOrderLine`/order doc (T11) — not built, per non-goals.
- **Type consistency:** `CartLine`/`SkuLine`/`LoopDeckLine`/`CheckoutItem` defined in T6, consumed unchanged in T7/T8/T10/T13. `CartCheckoutLine` (functions) defined T2, consumed T3. `configKey` used consistently for deck identity (T6/T10/T13).
- **Known adjust-on-contact points (flagged inline, not placeholders):** `Drawer.svelte` prop names (T8 Step 1 reads them first), configurator/architect SKU+config variable names (T13 greps each page), single-buy call sites (T12 greps them). These are "read the real signature, then match" steps with the surrounding code fully specified — not deferred work.
