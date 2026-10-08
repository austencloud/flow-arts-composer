---
status: active
value: 5
effort: S
remaining: "Re-verified 2026-08-02. Closed since the 2026-07-27 reconciliation: credentials rotated, remediation committed (afb0f2985a), and createCartCheckout/createMerchCheckout/handleMerchWebhook all deployed and listed in production. Austen-hands gates remaining: clear the Stripe payout requirement (past due) and complete Stripe Tax registration. Agent-runnable after that: configure the orders.expiresAt TTL policy, add shipBy metadata to both purchasable products, decide whether Stripe product images are still needed given the cover-card path, run a paid checkout/refund with tax and order-archive proof, then remove the /shop gate."
depends_on: "external: clear Stripe payout requirement and complete Stripe Tax registration"
plan_path: "docs/superpowers/plans/2026-06-26-shop-operations-go-live.md"
supersedes_context: ""
tags: [revenue, shop, store, stripe, go-live, fulfillment, tax]
last_triaged: 2026-10-07
work_state: blocked
---
# Shop Operations & Go-Live — Design Spec

**Queue evidence (2026-10-07):** The earlier uncommitted/undeployed claim is obsolete; remediation is committed and deployed, while Stripe and shop launch gates remain. See frontmatter for the remaining work.

**Date:** 2026-06-26
**Original status (historical):** Active but blocked. Local remediation is verified but not committed or deployed.
Continues the spin-up spec (`2026-06-23-shop-spin-up-design.md`).

## Reconciliation, 2026-07-27

**Queue placement:** `active/`, classified under the queue's blocked bucket by
`depends_on`. The implementation has started, so `backlog/` would be inaccurate.
The production success criteria are still open, so `shipped/` would also be
inaccurate.

The June build instructions no longer describe the repository or production state. This
table is the current resume point. It comes from source inspection, Firebase function
metadata, public Firestore reads, production HTTP responses, and sanitized Stripe API
queries performed on 2026-07-27.

| Area | Verified state | Result |
|---|---|---|
| Account | Live charges enabled; payouts disabled; one requirement is currently and past due | Open |
| Stripe Tax | Status `pending`; zero active registrations; no default shipping tax code | Open |
| Product tax setup | Four live deck prices have `tax_behavior: unspecified`; both live Stripe products have no product tax code | Open |
| Merch webhook | Live endpoint enabled for `checkout.session.completed`, `product.created/updated`, and `price.created/updated` | Done |
| Catalog | Live LOOP Deck and Deck Architect prices exist; placeholder `B8dDCYkEPunFCFVKiaBr` is absent | Done |
| Preorder data | Both purchasable products have preorder and cutoff fields; neither has `shipBy` | Partial |
| Product art | Stripe products have zero images, but Firestore has 60 baked cover cards and sampled Storage URLs returned PNG bytes | Partial, storefront art exists through the newer cover-card path |
| Functions | `createMerchCheckout` and `handleMerchWebhook` are active; `createCartCheckout` is absent | Open, current buy surfaces call the absent function |
| Storefront | `/shop` still server-renders “Shop opening soon”; direct LOOP routes return 200 and advertise the live preorder range in JSON-LD | Partial |
| Live orders | Twelve live Checkout sessions exist; none is paid and none has nonzero tax | Open, no paid smoke-test proof |

The uncommitted local remediation on 2026-07-27:

- moved both checkout paths onto one shipping-rate policy;
- added Stripe shipping tax code `txcd_92010001` to every rate;
- kept US shipping free when a cart contains a deck or sampler whose price includes it;
- routed cart checkout through the same preorder cutoff resolver as legacy checkout;
- added handler tests for write-before-Stripe ordering and the paid webhook transition;
- verified 44 merch tests, a clean functions TypeScript pass, and a root
  `npm run check` result of 0 errors with 4 warnings in files outside this change.

No Firebase or Stripe state was changed by this remediation. Do not deploy the local
function changes until the credentials exposed during this audit are rotated. After
rotation, deploy only `createCartCheckout`, `createMerchCheckout`, and
`handleMerchWebhook`, then prove the full paid-order path before opening `/shop`.

---

## Problem

The build/visibility half of the shop is done. The *operate-the-store* half is not: there
is no decided fulfillment workflow, no sales tax, no path from "test mode" to "taking real
money," no real product (only a hand-seeded test deck), and no product art. This spec covers
**taking real orders and shipping them** — the delta from "checkout works in test" to "a
stranger can buy a deck and Austen ships it, legally and for real money."

What already exists (verified 2026-06-26):
- `createMerchCheckout` (public, no-auth) → Stripe Checkout Session from
  `products/{id}.stripePriceId`; now carries `shipping_address_collection` (237 countries,
  `shippingCountries.ts`) + 3 buyer-selectable placeholder `shipping_options`.
- `handleMerchWebhook` already writes a full order to `orders/` on
  `checkout.session.completed` (email, shipping address, item, total, `status: "paid"`) **and**
  syncs Stripe `product.*` / `price.*` → Firestore `products/{stripeProductId}`. It is dormant:
  no webhook endpoint is registered and `STRIPE_WEBHOOK_SECRET` is unset for merch.
- No in-app order/fulfillment UI (grep-confirmed). The Stripe Dashboard shows each paid
  order with shipping address natively.
- Premium subs run on the installed `stripe/firestore-stripe-payments@0.3.4` extension —
  independent of this public merch flow.

## Locked Decisions (brainstorming, 2026-06-26)

| Decision | Choice |
|---|---|
| Fulfillment | **Stripe Dashboard is the fulfillment console.** `orders/` Firestore archive (already coded) is the backup source of truth. An in-app admin Orders view is a **deferred** later phase, triggered by volume. |
| Sales tax | **Stripe Tax (automatic).** Auto-rate per shipping address, nexus tracking, tax line in Checkout. |
| Launch shape | **Pre-order, one hero deck, small catalog (1–3 SKUs).** Take money now with honest "ships by [date]" messaging; print after demand validates. No upfront print capital. |
| Product art | **Rendered** from real pictographs via the worker-pool pipeline (no photography), uploaded, set as the Stripe product images. |
| Digital guides | **Deferred** — one-time digital delivery (download/access grant on payment) is unbuilt; its own later phase. |

## Philosophy / Tone

Pre-order and product copy follow the educational-resource tone, not sales energy
(`feedback_landing_page_tone`) and the AI writing guide (no superlatives, no "Whether
you're…", no em dashes, vary sentence length). The ship-by date must be honest — a pre-order
promise is a commitment, not marketing.

---

## Architecture

### 1. Fulfillment — Stripe Dashboard, Firestore archive

No build. The runbook (below) registers the webhook so `orders/` fills on each sale.
Austen fulfills from the Stripe Dashboard: open the payment, read the shipping address,
ship, mark fulfilled; Stripe sends the customer their receipt. `orders/` is the durable
record (admin-read per `firestore.rules`).

**Deferred (not this spec):** an in-app `/shop` admin Orders view over the `orders/`
collection with fulfillment-status toggles. Build it when Dashboard fulfillment stops
scaling, or when a custom/digital flow needs it. Noted here so it is a known phase, not a
surprise.

### 2. Sales tax — Stripe Tax (automatic)

**Code (`createMerchCheckout.ts`):**
- Add `automatic_tax: { enabled: true }` to the Checkout Session. Tax is computed from the
  shipping address (already collected).
- Each Stripe **price** needs a `tax_behavior` (`exclusive` recommended — tax added on top)
  or the account default tax behavior set. The **shipping rate** (`shipping_rate_data`) also
  needs a `tax_behavior` and a shipping `tax_code` so shipping is taxed correctly where
  applicable. Exact `txcd_*` codes resolved in the plan against current Stripe Tax docs
  (general tangible goods for the deck; the shipping tax code for the rate).

**Account config (Austen, Dashboard — physical blocker):** enable Stripe Tax, set the
origin address, register Illinois (and add jurisdictions as nexus thresholds trip — Stripe
Tax monitors this).

### 3. Launch catalog — pre-order, one deck

**Hero SKU:** the quartered-rotated-loops deck (`type: physical-deck`, `deckId:
l1-quartered-strict-rotated-8beat`). Real price + ship-by date are Austen-supplied.

**Pre-order signal (thin layer):**
- `product.ts` model gains `preorder?: boolean` and `shipBy?: string`.
- Carried in Stripe product **metadata** (`preorder: "true"`, `shipBy: "2026-09"`), so the
  Stripe Dashboard stays the editor. `handleMerchWebhook` product-sync maps both into the
  Firestore doc (`meta.preorder === "true"`, `meta.shipBy`).
- Rendered as a single *"Pre-order · ships by [date]"* line on `ProductCard` +
  `ProductDetailPage`, and a matching note near the Buy button. Space is reserved so toggling
  pre-order on/off causes **no layout shift** (`no-layout-shift`); when `preorder` is false
  the slot is empty, not removed.

Catalog stays 1–3 SKUs at launch (`feedback_card_display_limit` is generous; launch is
deliberately smaller). No cart — one product = direct checkout (unchanged).

### 4. Product art — rendered, uploaded, synced

- Render the deck **cover** + a few **sample card** images from real pictographs via the
  existing worker-pool pipeline (`project_worker_pool_card_rendering`:
  `pictograph-render.worker` + `AssetBundle` seeding). No photography, no hand-rolled SVG
  (`feedback_reuse_pictograph_renderer`).
- Upload to Firebase Storage (the project's existing storage; public-read product-art path),
  obtain stable URLs.
- Set the URLs as the Stripe product `images`. The webhook already maps
  `product.images → coverImageUrl` (first) + `previewImageUrls` (all). No storefront change.

### 5. Go-live runbook (ordered)

| # | Step | Owner |
|---|---|---|
| A | Clear the 3 past-due Stripe account tasks (identity/bank) → live charges enabled | Austen |
| B | Enable Stripe Tax: origin address + Illinois registration | Austen |
| C | Register the webhook endpoint in Stripe → events `checkout.session.completed`, `product.created/updated`, `price.created/updated` → copy signing secret → set `STRIPE_WEBHOOK_SECRET` in `firebase-functions/.env` → redeploy `handleMerchWebhook`. **Verify order capture in test mode first** (test checkout → `orders/` doc appears). | Austen + Claude |
| D | Render + upload product art (§4) | Claude |
| E | Create the real product in the Stripe Dashboard (live): price (tax_behavior), pre-order metadata (`preorder`, `shipBy`, `type`, `cardCount`, `deckId`, `sortOrder`), tax code, images. Webhook syncs it → Firestore. Delete the placeholder seed `B8dDCYkEPunFCFVKiaBr`. | Austen |
| F | Swap `rk_test` → `rk_live` key in `firebase-functions/.env`; redeploy `createMerchCheckout` + `handleMerchWebhook` (carries the tax + pre-order code) | Austen sets key, Claude deploys |
| G | Live smoke test: real card, small order → confirm Stripe Tax line + chosen shipping + `orders/` archive, then refund | Austen + Claude |
| H | Remove the Coming Soon gate (one line in `(public)/shop/+page.svelte` — render `ShopPage` for everyone) → public launch | Claude |

Test mode stays the default until F. C and D can be done in test mode ahead of A/B.

### 6. Code delta (small, all extend existing)

| File | Change | Type |
|---|---|---|
| `firebase-functions/src/merch/createMerchCheckout.ts` | `automatic_tax` enabled; `tax_behavior`/`tax_code` on the price + shipping rates | extend |
| `firebase-functions/src/merch/handleMerchWebhook.ts` | product-sync maps `meta.preorder`, `meta.shipBy` → Firestore | extend |
| `src/lib/features/store/domain/models/product.ts` | add `preorder?: boolean`, `shipBy?: string` | extend |
| `src/lib/features/store/components/ProductCard.svelte` | pre-order line (reserved space) | extend |
| `src/lib/features/store/ProductDetailPage.svelte` | pre-order line near Buy button (reserved space) | extend |
| `(public)/shop/+page.svelte` | gate removal one-liner (step H, launch only) | edit |

No new components. The pre-order line is a text element on existing cards, not a new
primitive (`never-hand-roll`).

### 7. Out of scope (deferred phases)

- In-app admin Orders view (fulfillment from Stripe Dashboard for launch).
- Digital-guide one-time delivery (download/access grant) — its own spec.
- Shopping cart, multi-item orders, inventory tracking.
- Waitlist email **delivery** (the "notify them" send to `shop_waitlist`).
- Custom/templated order emails (Stripe's built-in receipt covers launch).
- Destination-aware auto shipping-rate selection (buyer picks from listed rates; unchanged).

---

## Risks

| Risk | Mitigation |
|---|---|
| Pre-order ship-by slips → angry buyers / chargebacks | Honest, padded ship-by date; pre-order copy states it's a pre-order; refund-able via Stripe. |
| Stripe Tax misconfigured (wrong tax code → wrong tax) | Verify codes against current Stripe Tax docs in the plan; live smoke test (G) checks the tax line before public launch. |
| Webhook registered for wrong events / bad secret | Test-mode verification (C) before live; confirm an `orders/` doc and a product-sync both fire. |
| Live key committed or echoed | Key only in gitignored `firebase-functions/.env` or `functions:secrets:set`; never in chat/git (standing security rule). |
| Placeholder seed left alongside a real synced product | Step E deletes `B8dDCYkEPunFCFVKiaBr` after the real product syncs in. |
| Pre-order line resizes the card on toggle | Reserve the slot; render empty (not removed) when `preorder` is false (`no-layout-shift`). |

## Success Criteria

1. Stripe Tax shows a correct tax line in Checkout for a taxable destination; nexus tracking
   active in the Dashboard.
2. A real (live-mode) purchase completes, charges the right total (price + chosen shipping +
   tax), and writes a `paid` order to `orders/` with the shipping address.
3. The hero deck shows a *"Pre-order · ships by [date]"* line on card + detail with no layout
   shift when toggled; product art (cover + samples) renders from real pictographs.
4. Austen can fulfill end-to-end from the Stripe Dashboard (see order, address, mark
   fulfilled, customer receives receipt).
5. The placeholder seed is gone; the live catalog is the Stripe-authored product(s).
6. Removing the gate makes `/shop` public; `npm run check`, functions build, and `npm run
   build` are green.

## Blockers needing Austen

- The 3 past-due Stripe account-activation tasks.
- Final deck price + an honest ship-by date.
- Stripe Tax registration jurisdictions (Illinois confirmed; others as nexus trips).
