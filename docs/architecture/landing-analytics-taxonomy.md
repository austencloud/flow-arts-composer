# Landing + Shop Analytics Taxonomy

Status: design, ready to implement
Date: 2026-07-21
Scope: public marketing surfaces (site chrome, homepage launchpad, /composer landing) and the
shop conversion funnel. Does NOT cover in-app (`/create`) telemetry.

## The one-line convention

**`<domain>_<object>_<verb>`, all snake_case, properties snake_case, past-tense verb for a
completed state transition and a plain verb for a click** — e.g. `shop_checkout_started`,
`landing_cta_click`. Domains in use: `landing_`, `shop_`, `auth_`. This is the convention the
repo already runs on (`landing_cta_click`, `shop_loop_pack_selected`, `user_signed_up`); no
second convention is introduced.

---

## 1. What got cut, and why

Six scouts mapped ~80 candidate seams. This taxonomy ships **13 event names, 9 of them new**.
The cuts are the most important part of the design.

PostHog is configured with `autocapture: true` and `capture_pageview: "history_change"`
(`src/lib/shared/analytics/services/posthog.ts`). That means **every `<a href>` click is already
captured as `$autocapture` with element text and href, and every resulting navigation is already
a `$pageview`.** A custom event for a plain link that navigates adds nothing but noise and
maintenance cost.

| Cut | Count | Why |
|---|---|---|
| `nav_logo_click`, `nav_link_click` | 2 | Plain `<a>` navigations — `$autocapture` + `$pageview` already answer "who clicked the logo". |
| `nav_dropdown_item_click` (13 dests × 2 surfaces) | 1 event, 26 call sites | The href already implies the group (`/notation/*` → notation). `$autocapture` carries text + href. |
| `footer_link_click` (19 column links) | 1 event, 19 call sites | Same. 19 hand-wired call sites to re-derive what autocapture gives free. |
| `footer_bottom_link_click` (Support/Terms/Privacy) | 1 | Legal-sheet open rate is not a question anyone will ask. |
| `nav_dropdown_open`, `nav_mobile_menu_toggle`, `nav_mobile_group_toggle`, `nav_account_menu_open` | 4 | Disclosure fidget. Autocapture records the button; the disclosure itself has no business question attached. |
| `auth_sign_out` | 1 | Out of scope (lifecycle, not marketing funnel) and not derivable-value enough to justify 2 call sites. |
| `auth_modal_email_expanded`, `auth_modal_mode_toggle` | 2 | Intra-modal fidget between `opened` and `submitted`; the funnel already brackets it. |
| Composer error-retry reroll (`+page.svelte:336`) | 1 | Error recovery is not user intent. Conflating it with `try_another` corrupts the demo-engagement metric. **Decision: leave untracked.** |
| PlayWithIt tempo slider | 1 | Fidget, and `bpm` is a near-continuous property. |
| PlayWithIt effect swap | 1 | Deep fidget on a marketing demo, and it needs a new `$effect` watcher. Effect adoption is better measured in-app where the choice is real. |
| StorePage `/shop` grid card click | 1 | Currently admin-gated (`shop/+page.svelte:103-114` shows `ShopComingSoon` to non-admins). Not a live funnel entry. Revisit at launch. |

### Dead functions that stay dead

Requirement: every seam a written helper fits must route to that helper. Three helpers fit
nothing, and inventing a seam for them would be worse than leaving them unused:

- **`trackDemoVisible()`** — carries no discriminator at all. `trackSectionView(section, page)`
  strictly dominates it for every candidate seam. Leave in place, unused.
- **`trackVideoPlay(videoIndex)`** — no video surface exists on any page in scope (confirmed by
  the composer scout). Leave unused. Do not invent a video seam to justify it.
- **`trackBackgroundChange(backgroundType)`** — no background picker on the landing surfaces in
  scope. Leave unused.

---

## 2. Shared property contract

### Base properties (every custom event in this taxonomy)

| Property | Type | Source |
|---|---|---|
| `page` | bounded route pattern | **`page.route.id` from `$app/state`** — e.g. `/shop/[id]`, `/(public)/composer`. Never `page.url.pathname`. |
| `surface` | `"desktop" \| "mobile" \| "footer"` | Only on site-wide chrome events where the same action has multiple call sites. |

**Why `page.route.id` and not `page.url.pathname`:** PostHog attaches `$current_url` to every
event automatically, but that value carries query strings and real ids (`/shop/loop-deck-mild?ref=x`),
which explodes as a breakdown dimension. `page.route.id` is the SvelteKit route *pattern* — a
bounded set of ~60 values that stays bounded forever. Use it as the segmentation key; leave
`$current_url` for drill-down.

**Correction to scout intel:** `SiteHeader.svelte:13` imports `page` from `$app/state`, but
**`SiteFooter.svelte` does not** (verified — its only import is `LegalSheet`). WS-NAV must add
`import { page } from "$app/state";` to SiteFooter.

### Cardinality discipline

| Rejected property | Why | Bounded alternative |
|---|---|---|
| raw `href` on nav/footer/launchpad links | Unbounded as new pages ship; duplicates autocapture | `tile_id` / `variant_value` from a known enum; drop href entirely |
| `page.url.pathname` | Real ids + query strings | `page.route.id` |
| `loopConfig` serialized whole | `recipe` is an array of up to 8 slices — effectively unique per buyer | Flatten to `loop_pack`, `loop_level`, `loop_length`, `loop_flavor` (all closed unions in `domain/loop-config.ts`), plus `recipe_slice_count` (1–8) for Architect orders |
| `configKey` (`JSON.stringify(loopConfig) + propType`) | Unique per configuration by construction | `variant_kind` + `variant_value` |
| free-text labels (chip label, link label) | Copy changes silently break historical charts | stable id (`tile_id`, `chip_id`) |
| timestamps as properties | PostHog owns event time | never send |
| `stripe_session_id` | **High cardinality — deliberate exception.** It is the join key to Stripe for revenue reconciliation and for deduping. | Send it, but document it as a **join key, never a breakdown dimension**. It is the only high-cardinality property this taxonomy permits. |

---

## 3. The shop funnel (priority)

Five ordered steps, chartable end to end in a PostHog funnel. This is what unblocks
cart-abandonment analysis on the live Stripe preorder.

```
shop_product_viewed → shop_variant_selected → shop_add_to_cart → shop_checkout_started → shop_purchase_completed
                                                    ↑ optional (direct "buy" skips the cart)
                                          shop_cart_opened
```

`shop_add_to_cart` is deliberately **optional in the funnel** — `BuyButton` in `mode="buy"` goes
straight from variant to checkout. Build the PostHog funnel in *non-strict* order so both the
cart path and the direct-buy path count.

### Step 1 — `shop_product_viewed`

Fires once per shop entry page mount. One event for both SKU pages and configurator listings so
the funnel has a single step 1.

| Property | Type | Notes |
|---|---|---|
| `listing` | `"loop-deck" \| "loop-deck-architect" \| "tnd-trilogy" \| "starter-pack" \| "sku"` | bounded |
| `product_id` | string \| null | `Product.id` (no separate sku/slug field exists). Null on configurator listings that span SKUs. |
| `product_type` | `ProductType` \| null | closed union in `domain/models/product.ts:4` |
| `price_cents` | number \| null | `Product.price` |
| `is_preorder` | boolean | `Product.preorder ?? false` |
| `status` | `ProductStatus` \| null | `"active" \| "draft" \| "sold-out"` |

Call sites: `ProductDetailPage.svelte:47`, `LoopDeckConfiguratorPage.svelte:82`,
`TnDTrilogyPage.svelte:30`, `StarterPackPage.svelte:31`, `DeckArchitectPage.svelte:68`.

> `DeckArchitectPage` already fires `shop_loop_architect_opened`. Keep it **and** add
> `shop_product_viewed`. They answer different questions: the existing one is a feature-usage
> gate (its own comment in `activity-event.ts:61` says "if nobody fires these, the feature goes"),
> the new one is funnel step 1. Do not delete either as a "duplicate".

### Step 2 — `shop_variant_selected`

One event for every dial, so the step is uniform regardless of which control moved.

| Property | Type | Notes |
|---|---|---|
| `listing` | as above | |
| `product_id` | string \| null | |
| `variant_kind` | `"prop" \| "loop_pack" \| "loop_level" \| "loop_length" \| "loop_flavor" \| "recipe"` | bounded |
| `variant_value` | string \| null | prop types (~6), levels (4), lengths (4), flavors (17) — all closed unions. **Null for `recipe`.** |
| `recipe_slice_count` | number \| null | 1–8, only when `variant_kind === "recipe"` |

Call sites: `ProductDetailPage.svelte:111`, `LoopDeckConfiguratorPage.svelte:667`,
`DeckArchitectPage.svelte:543`, `TnDTrilogyPage.svelte:162`, `StarterPackPage.svelte:189`.

> Overlaps by design with the existing `shop_loop_pack_selected` / `shop_loop_custom_entered`.
> Those stay as deployed feature-gate telemetry; `shop_variant_selected` is the funnel step.
> Noted here so a future reader does not "clean up" one of them.

### Step 3 — `shop_add_to_cart`

| Property | Type |
|---|---|
| `product_id`, `product_name`, `product_type`, `listing` | as above |
| `unit_price_cents` | number (`Product.price`) |
| `prop_type` | string \| null (**null for guide/poster/material/digital/sampler-pack** — `ProductDetailPage.svelte:116` passes undefined for these) |
| `loop_pack`, `loop_level`, `loop_length`, `loop_flavor` | string \| null (flattened, never the object) |
| `qty` | number (always 1 at this call site) |

Single call site: `BuyButton.svelte:41` `addToCart()`. **Do not instrument
`shop-cart.svelte.ts` `add()`** — it has no product/page context in scope; `BuyButton` already
holds `product`, `propType`, and `loopConfig`.

### Step 4 — `shop_checkout_started`

**Three independent code paths exist.** Two are covered by one edit; the third needs its own.

| Path | Where | Coverage |
|---|---|---|
| BuyButton `mode="buy"` | `BuyButton.svelte:73` → `store-state.svelte.ts:94` | instrument `startCheckout` |
| Mobile sticky docks (×2) | `LoopDeckConfiguratorPage.svelte:758`, `DeckArchitectPage.svelte:646` | **free** — they call `store.startCheckout` directly. Do NOT add a second call. |
| Cart drawer | `CartDrawer.svelte:25` | **own call** — `checkout()` goes straight to `getCartCheckoutCreator()` and never touches `store-state.svelte.ts`. |

| Property | Type |
|---|---|
| `surface` | `"buy_button" \| "cart_drawer"` |
| `product_id` | string \| null (null for multi-line cart checkout) |
| `line_item_count` | number (1 for direct buy, `cart.count` for the drawer) |
| `subtotal_cents` | number |
| `prop_type`, `loop_pack`, `loop_level`, `loop_length`, `loop_flavor` | string \| null (direct buy only) |
| `is_preorder` | boolean |

> `startCheckout` receives only `(productId, propType?, loopConfig?)`. To emit `subtotal_cents`
> and `is_preorder` it needs the price — resolve from `selectedProduct` inside the state module,
> and fall back to omitting rather than guessing.

### Step 5 — `shop_purchase_completed`

The highest-value gap in the codebase: `OrderConfirmation.svelte` has a literally empty
`<script>` block, so the purchase step does not exist at all today.

| Property | Type | Notes |
|---|---|---|
| `stripe_session_id` | string | From `page.url.searchParams.get("session_id")`. **Join key only** — the sanctioned high-cardinality exception. |
| `has_session` | boolean | False when a user lands on /shop/success without a session id (bookmark, refresh) |

**Two implementation constraints, both mandatory:**

1. **Dedupe on refresh.** A success-page reload would re-fire the purchase event and inflate
   conversion. Before capturing, check a `sessionStorage` key
   (`tka:shop:purchase-tracked:<session_id>`); skip if present, set it after firing. Nobody
   flagged this in scouting — it is the difference between a trustworthy funnel and a broken one.
2. **No `+page.ts` change needed.** `page.url.searchParams` is available client-side in
   `onMount`. The existing `success/+page.ts` (58 bytes, `prerender`/`ssr` flags only) stays as is.

**Revenue is explicitly deferred.** There is no client-side access to order value on /shop/success
— it needs a callable resolving the `DraftOrder` (`domain/models/product.ts:151`). Ship the
valueless completion ping now so the funnel closes, and backfill `value_cents` as a named
follow-up. Do not invent a value from stale localStorage cart state.

### Supporting event — `shop_cart_opened`

Not a funnel step; it is how you tell "opened the cart and left" from "never opened the cart".

| Property | Type |
|---|---|
| `item_count` | number (`cart.count`) |
| `subtotal_cents` | number (`cart.subtotal`) |

Call site: `CartButton.svelte:12` (wired at `shop/+layout.svelte:16`).

---

## 4. The auth funnel

Genuinely uninstrumented and genuinely not derivable: the modal opens without navigation, so
there is no `$pageview`, and the auth method is not reliably readable from DOM text.

```
auth_modal_opened → auth_modal_submitted → user_signed_up (existing, enriched)
                 ↘ auth_modal_abandoned
```

**Context is captured once, at `opened`, and never re-threaded.** `AuthModal` is mounted from
three hosts with two different open mechanisms (`SiteHeader`'s local `authModalOpen` boolean vs
the app-wide `authDrawerState`), and its child forms (`SocialAuthCompact`, `EmailLinkAuth`,
`EmailPasswordAuth`) have no access to `page` or to "which CTA opened me". Passing `from_page`
down four component layers to satisfy a property contract is not worth it — correlate
`submitted`/`abandoned` back to `opened` via PostHog's automatic session/distinct_id instead.

| Event | Properties |
|---|---|
| `auth_modal_opened` | `page` (route id), `cta` (`"header_desktop_signin" \| "header_mobile_signin"`) |
| `auth_modal_submitted` | `method` (`"google" \| "google_one_tap" \| "facebook" \| "magic_link" \| "password"`), `auth_mode` (`"signin" \| "signup"`, password only) |
| `auth_modal_abandoned` | `dismiss` (`"close_button" \| "backdrop_or_escape"`) |
| `user_signed_up` *(existing, enrich)* | add `method` and `auth_mode` to the current `{ scan_source_code }` payload |

**Out of scope, flagged:** the footer "Sign in" link (`SiteFooter.svelte:120`) is a hard nav to
`/create?sheet=auth` — a fourth entry point that bypasses `openSignIn()` entirely. The
`?sheet=auth` handler was not traced in scouting. It gets a `$pageview` to `/create` and is not
instrumented here. Trace it before adding it to this funnel.

---

## 5. Landing events

### Reused — `landing_cta_click` (`trackCtaClick`)

The composer CTA is the primary marketing conversion. Four call sites:

| Call site | `location` |
|---|---|
| `SiteHeader.svelte:424` "Open Flow Arts Composer" | `"header_desktop"` *(new union member)* |
| `SiteHeader.svelte` `.compact-cta`, the bar's Composer button beside the menu at 1024px and below | `"header_mobile"` *(new union member)* |
| `SiteFooter.svelte:94` composer CTA | `"footer"` *(already valid)* |
| `HomeHero.svelte:59` "What is TKA?" → /about | `"hero"` *(already valid)* |

The existing caller at `composer/+page.svelte:199` is untouched.

### Reused — `landing_scroll_section` (`trackSectionView`)

Ten activation points on /composer, all instrumented by editing **two function bodies plus four
one-line consts** — zero template changes:

- `composer/+page.svelte:73` `whenNear` → the 6 wing sections (Construct, Generate, Mandala, Games, Connect, Library)
- `:219` tunnel, `:221` choreo_cards, `:223` viewer_3d, `:225` play_with_it

`activateWhenNear` (`src/lib/actions/activate-when-near.ts:24`) is already one-shot and
self-disconnecting, which pairs naturally with `trackSectionView`'s internal dedupe Set. **Do not
write a second IntersectionObserver for analytics.**

### Reused — `landing_demo_interact` (`trackDemoInteraction`)

| Seam | `action` |
|---|---|
| `HomeHero.svelte:46` reroll (wrap `onReroll={heroAct.advanceNow}`) | `"try_another"` |
| `composer/+page.svelte:124` `rerollDemo()` | `"try_another"` |
| `PlayWithItInner.svelte:149` `handlePropChange` | `"change_prop"` + `prop_type` |
| `PlayWithItInner.svelte:166` `togglePlayPause` (3 affordances, 1 handler) | `"toggle_play"` *(new union member)* + `is_playing` |

**Do not add tracking inside `SequenceHeroDemo.svelte`.** It is shared by 16+ files and has no
page context; a new prop would have to be threaded to every consumer. Wrap the callback at the
homepage-local call site instead.

### New — `landing_launchpad_click`

Three proposed events (tile / chip / strip) collapse into **one**, so the whole homepage
launchpad charts as a single breakdown. This directly serves the active launchpad-curation work.

| Property | Type |
|---|---|
| `target` | `"tile" \| "chip" \| "strip"` |
| `tile_id` | one of `composer \| choreo-cards \| guide \| notation \| faq \| glossary` (null for strip) |
| `chip_id` | slug of the chip (null unless `target === "chip"`) |
| `strip_id` | slug of the strip link (null unless `target === "strip"`) |

**Implementation note (load-bearing):** put the tracking call as the **first line of
`handleActivate` in `LaunchpadTile.svelte`, before the `if (!isAction || ...) return;`
early-exit.** All six production tiles have `activate` unset, so `isAction` is false and the
handler currently returns immediately — tracking placed after the guard would never fire. Chips
(`LaunchpadTile.svelte:213`) and strip links (`LaunchpadGrid.svelte:184`) are separate `<a>`
siblings and need their own handlers.

---

## 6. Event count

| | Count |
|---|---|
| Reused existing names | 3 (`landing_cta_click`, `landing_scroll_section`, `landing_demo_interact`) |
| New names | 10 (`landing_launchpad_click`, `auth_modal_opened/submitted/abandoned`, `shop_product_viewed/variant_selected/add_to_cart/cart_opened/checkout_started/purchase_completed`) |
| Enriched existing | 1 (`user_signed_up`) |
| **Total distinct event names** | **13** |

---

## 7. PREREQUISITE — the foundation agent

**This runs to completion and lands before any workstream starts.** Every workstream imports
from these files; none of them may edit these files.

### Foundation owns exactly these paths

- `src/lib/shared/analytics/domain/models/activity-event.ts`
- `src/routes/landing/landing-analytics.ts`
- `src/lib/shared/analytics/landing-events.ts` *(new)*
- `src/lib/shared/analytics/auth-events.ts` *(new)*

### 7.1 The closed union — typecheck WILL fail without this

`ActivityEventType` in `activity-event.ts:24-66` is a **closed string-literal union**. It gates
`logActivity(eventType, ...)` only — it does **not** gate `captureEvent`. The shop feature's
established pattern is `getActivityLogger().logActivity(...)` (3 live call sites), so the six new
shop names must be registered. Landing and auth events go through `captureEvent` directly and
need **no** union entry.

Add to `ActivityEventType`, after the existing shop block:

```ts
  // Shop conversion funnel (spec: docs/architecture/landing-analytics-taxonomy.md)
  | "shop_product_viewed"
  | "shop_variant_selected"
  | "shop_add_to_cart"
  | "shop_cart_opened"
  | "shop_checkout_started"
  | "shop_purchase_completed";
```

`ActivityCategory` already has `"shop"` — no change needed there.

### 7.2 Fix the lib → routes dependency inversion

`landing-analytics.ts` lives in `src/routes/landing/`, but `LaunchpadTile.svelte` and
`HomeHero.svelte` live under `src/lib/`. A lib file importing a routes file inverts this
codebase's dependency direction.

1. Move the module to **`src/lib/shared/analytics/landing-events.ts`** (contents unchanged except
   the signature edits below).
2. Leave `src/routes/landing/landing-analytics.ts` as a thin re-export, so the existing caller at
   `composer/+page.svelte:199` keeps working untouched.

### 7.3 Signature changes (all safe — these functions have zero callers)

```ts
// widen: header CTAs need two more locations; page must cover any route
export function trackCtaClick(
  location: "hero" | "viewer_3d" | "footer" | "header_desktop" | "header_mobile",
  props?: { platform?: string; cta_type?: string; page?: string; destination?: string }
): void

// add page, and dedupe on the PAIR — the module-level Set never resets, so
// bare section keys collide across pages within one SPA session
export function trackSectionView(section: string, page: string): void

// additive union member for the PlayWithIt play/pause control
export function trackDemoInteraction(
  action: "try_another" | "change_prop" | "toggle_dark_mode" | "toggle_play",
  props?: { prop_type?: string; is_playing?: boolean; page?: string }
): void
```

`trackDemoVisible`, `trackVideoPlay`, `trackBackgroundChange` are untouched and stay unused
(see §1).

### 7.4 New `auth-events.ts`

Model it on `src/lib/shared/analytics/services/onboarding-events.ts` — thin typed wrappers over
`captureEvent`, no DI, no `logActivity`:

```ts
export function trackAuthModalOpened(page: string, cta: AuthCta): void
export function trackAuthModalSubmitted(method: AuthMethod, authMode?: "signin" | "signup"): void
export function trackAuthModalAbandoned(dismiss: "close_button" | "backdrop_or_escape"): void
```

### 7.5 Do not touch the dev gate

`captureEvent` is hard-gated by `if (!browser || !initialized || import.meta.env.DEV) return;`.
Every event in this taxonomy is a deliberate no-op on localhost. That is correct. Do not add
per-function dev guards (redundant), and do not work around the gate to "verify locally" —
verification happens against a prod/preview build, or by unit-testing the `captureEvent`
arguments directly.

---

## 8. Implementation assignment

Five disjoint workstreams. **No file appears in two workstreams.** All run after the foundation
agent lands.

### WS-NAV — site chrome + sign-in funnel

Events: `landing_cta_click` (×3), `auth_modal_opened`, `auth_modal_submitted`,
`auth_modal_abandoned`, enrich `user_signed_up`.

```
src/lib/shared/landing/components/SiteHeader.svelte
src/lib/shared/landing/components/SiteFooter.svelte
src/lib/shared/auth/components/AuthModal.svelte
src/lib/shared/auth/components/SocialAuthCompact.svelte
src/lib/shared/auth/components/EmailLinkAuth.svelte
src/lib/shared/auth/components/EmailPasswordAuth.svelte
src/lib/shared/auth/state/auth-state.svelte.ts
```

Notes: add `import { page } from "$app/state"` to **SiteFooter** (it does not have it).
`NavDropdown.svelte` and `MarketingChrome.svelte` are **explicitly not in scope** — every
NavDropdown seam was cut, and MarketingChrome has no interactive elements of its own.
`SiteHeader.svelte.test.ts` exists — keep it green.

### WS-LAUNCHPAD — homepage

Events: `landing_launchpad_click`, `landing_cta_click` (hero), `landing_demo_interact` (reroll).

```
src/routes/+page.svelte
src/lib/shared/landing/components/HomeHero.svelte
src/lib/shared/landing/components/launchpad/LaunchpadTile.svelte
src/lib/shared/landing/components/launchpad/LaunchpadGrid.svelte
```

Notes: `+page.svelte` renders `<LaunchpadGrid />` with zero props and likely needs no edit — it is
assigned here so ownership is unambiguous. Read §5 on the `handleActivate` early-exit before
writing anything. Do not touch `SequenceHeroDemo.svelte` (shared by 16+ files).

### WS-COMPOSER — /composer landing

Events: `landing_scroll_section` (×10), `landing_demo_interact` (×3).

```
src/routes/(public)/composer/+page.svelte
src/routes/landing/components/PlayWithItInner.svelte
```

Notes: all 10 section views land by editing two function bodies (`whenNear` at :73, the
`activate*WhenNear` consts at :219-226) — no template changes. Leave the error-retry reroll at
:336 untracked. Do not modify `AnimationPanel` (app-wide shared component).

### WS-SHOP — the funnel

Events: all six `shop_*` names.

```
src/lib/features/store/analytics/shop-funnel.ts          (new — typed wrappers over logActivity)
src/lib/features/store/components/BuyButton.svelte
src/lib/features/store/components/CartDrawer.svelte
src/lib/features/store/components/CartButton.svelte
src/lib/features/store/components/OrderConfirmation.svelte
src/lib/features/store/state/store-state.svelte.ts
src/lib/features/store/ProductDetailPage.svelte
src/lib/features/store/LoopDeckConfiguratorPage.svelte
src/lib/features/store/DeckArchitectPage.svelte
src/lib/features/store/TnDTrilogyPage.svelte
src/lib/features/store/StarterPackPage.svelte
```

Notes: do **not** instrument `shop-cart.svelte.ts` (no context in scope) and do **not** add
checkout tracking to the two mobile docks (covered free by `store-state.svelte.ts`). The
success-page dedupe in §3 step 5 is mandatory. `TnDTrilogyPage` and `StarterPackPage` render only
`mode="buy"` BuyButtons, so `shop_add_to_cart` cannot fire from them — that is a UX gap, not a
tracking gap; do not "fix" it here.

### WS-SOURCEMAPS — readable stack traces in PostHog

No events. Makes `capture_exceptions` output legible.

```
package.json                    (build script chain)
vite.config.ts                  (build.sourcemap at :934)
scripts/trim-deploy-assets.js
.github/workflows/*             (expected: no change — see below)
```

**Decision: CLI-in-npm-script, not a GitHub Action.** Cloudflare Pages deploys via
git-integration and runs its own dashboard-configured build command; `web-ci.yml` is
validate-only with no deploy step. A sourcemap step added to any workflow would run against a
non-deploying checkout and have **zero effect on the shipped artifact**. The step must live
inside the `build` script itself, between `vite build` and `trim-deploy-assets.js`:

```
... vite build --logLevel error \
  && posthog-cli sourcemap inject --directory .svelte-kit/cloudflare \
  && posthog-cli sourcemap upload --directory .svelte-kit/cloudflare --delete-after-upload \
  && node scripts/trim-deploy-assets.js
```

**Address the security comment, do not override it silently.** `vite.config.ts:932` says
"Source maps disabled in production for security (exposes original source)". That rationale is
satisfied, not ignored: `--delete-after-upload` removes the `.map` files in the same build
invocation that CF snapshots for deploy, so maps reach PostHog and never reach the CDN. Update
the comment to say so. Also note `VITE_SOURCEMAP` is referenced only in that stale comment —
nothing reads it.

Env vars already exist: `POSTHOG_PERSONAL_API_KEY` and `POSTHOG_PROJECT_ID` in `.env`, and as a
GitHub secret + repo variable respectively. The CF dashboard build env needs them added — that is
a dashboard change outside this repo and requires Austen.

---

## 9. Verification

`captureEvent` is a no-op in DEV by design. Do not claim any event "works" from localhost.
Acceptable proof:

1. A unit/component test spying on the `captureEvent` / `logActivity` export and asserting the
   exact event name and property object.
2. PostHog's live-events view against a preview or production build.

Nothing else counts.
