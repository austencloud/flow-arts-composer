# Google Merchant Center Setup

> **STATUS (2026-07-17): SHELVED at the product-upload step** until real product
> images exist. The resume path is the merchant product image pipeline spec:
> `docs/superpowers/specs/backlog/2026-07-17-merchant-product-image-pipeline-design.md`.
> Account is created and the website claim is done; every form value needed to
> finish is recorded below.

Why this exists: "kinetic alphabet" gets spell-corrected to "phonetic alphabet" in Google.
The fix is entity establishment, not a Google Business Profile (online-only shops are
ineligible for GBP, and GBP only affects Maps/local results anyway). Merchant Center is
the legitimate "register with Google as a business" path for tkaflowarts.com: it puts the
decks in free Shopping listings and adds a strong brand-entity signal tied to the domain.

## Already in place (verified 2026-07-16)

- **Search Console verification**: `static/googlec954fc3d206e6f49.html` is live, so
  tkaflowarts.com is verified under a Google account Austen controls. Merchant Center
  claims the website through this same verification. One click, no new DNS work.
- **Product structured data** on every shop surface, server-rendered (Merchant Center
  requires it in the initial HTML, not injected by JS):
  - `/shop/loop-deck`: Product + AggregateOffer ($35 preorder to $55 Architect regular),
    PreOrder availability, NewCondition
  - `/shop/tnd-trilogy`: Product + AggregateOffer ($30 x 3 volumes), InStock, NewCondition
  - `/shop/[productId]`: Product + Offer with live price/availability from the catalog
  - All carry `brand: The Kinetic Alphabet`
- **Organization entity** on the homepage with `disambiguatingDescription` (explicitly
  distinguishing from the NATO phonetic alphabet) and `knowsAbout`.

## What only Austen can do

Account creation and identity verification run through his Google account. Everything
below is prepared so those sessions are fill-in-the-blanks.

## Setup steps

1. Go to [merchants.google.com](https://merchants.google.com) signed in as
   austencloud@gmail.com and choose "Create account".
2. Business name: `The Kinetic Alphabet`. Country: United States. Time zone: America/Chicago.
3. Website: `https://tkaflowarts.com`. When asked to verify, pick "Search Console" and
   select the existing verified property. Claim completes immediately.
4. Business info:
   - Description: see "Profile copy" below
   - Customer support email: `support@tkaflowarts.com`
   - Address: Google requires one for identity verification. A home address works and
     can be kept non-public (Merchant Center does not publish it the way a Business
     Profile would).
5. Products: with a 3-listing catalog, add products manually in the UI rather than
   engineering a feed. For each product enter title, description, link, image, price,
   availability, condition (new). Values below. Alternative: choose "website crawl" as
   the feed source and let Google read the on-page structured data; both work, manual is
   more predictable at this size.
6. Shipping: flat-rate or table matching whatever the Stripe checkout charges. Keep it
   in sync with the shop; mismatches between site and Merchant Center trigger
   disapprovals.
7. Enable free listings (Growth > Manage programs > Free listings). Do NOT set up paid
   Shopping ads; not needed for the entity goal.
8. After approval, confirm products show under "All products" as Active, then check
   Search Console > Shopping tab for the merchant listing reports.

## Profile copy

Business description:

> The Kinetic Alphabet (TKA) is a notation system for flow arts. It gives prop spinners
> a written alphabet for choreography: compose sequences in the free web app, then read
> them back like sheet music. The shop sells printed choreography card decks generated
> from the notation, including the LOOP Deck and the Timing & Direction Trilogy.

## Product values

| Field        | LOOP Deck                                                                                          | Timing & Direction Trilogy (per volume)                                         |
| ------------ | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Title        | LOOP Deck: 54 Flow Sequence Playing Cards                                                          | TKA 1/2/3 (Learning Letters / Writing Words / Speaking Sentences)               |
| Link         | https://tkaflowarts.com/shop/loop-deck                                                             | https://tkaflowarts.com/shop/tka-1-learning-letters (etc.)                      |
| Price        | $35.00 (preorder; $45 regular after 2026-09-30)                                                    | $30.00                                                                          |
| Availability | preorder                                                                                           | in_stock                                                                        |
| Condition    | new                                                                                                | new                                                                             |
| Category     | Arts & Entertainment > Hobbies & Creative Arts                                                     | same                                                                            |
| Description  | 54 flow sequences printed as playing cards. Pick a transformation flavor and build your LOOP deck. | Three printed decks, every card color-coded by its timing and direction family. |

Preorder note: Merchant Center preorder availability requires an availability date.
The site's stated ship date is October 1 (LoopDeckConfiguratorPage/DeckArchitectPage:
"Preorder now. Decks ship October 1."), so enter **2026-10-01**. Update if it slips.

Product identifiers: the decks are small-batch handmade prints with no GTIN/UPC. Check
"I don't have a GTIN, UPC, EAN, JAN or ISBN" and let Google auto-assign, or enter the
listing slug (loop-deck, tka-1-learning-letters, ...) as the SKU.

Shipping values (source of truth: `firebase-functions/src/merch/checkoutParams.ts`):
US free, Canada $14.00, International $25.00, worldwide address collection.

Product images: do NOT use `/branding/og-image.png` — it is the app marketing banner
(headline, CTA buttons, FREE badge) and violates the no-promotional-overlay image
policy. Merchant-ready images composed from the real card renders live in
`C:/Users/Austen/Downloads/merchant-images/`:

- `loop-deck-fan.png` (2200x1800, five real cards fanned, white background) plus
  `loop-deck-card.png` (single card, 822x1122) as an additional view
- `tka-1-learning-letters.png`, `tka-2-writing-words.png`,
  `tka-3-speaking-sentences.png` (same fan treatment from the baked shop covers)

Known bug found while capturing (2026-07-16): the baked shop covers for TKA 3 on
Firebase Storage are byte-identical to TKA 2's (verified by sha256 of
`shop-covers/tka-2.../0.png` vs `shop-covers/tka-3.../0.png`). TKA 3 should show
half-turn variations. The coverCards reseed ran but the PNG bake for tka-3 did not.
Re-run the cover bake for tka-3-speaking-sentences, then regenerate its merchant image.

## Claude-in-Chrome walkthrough prompt

Paste this to Claude in Chrome after opening merchants.google.com:

```
Help me set up a Google Merchant Center account for my business. I am signed in as
austencloud@gmail.com. Walk me through each screen and fill fields with these values,
pausing for me to handle any password, 2FA, or identity verification steps:

- Business name: The Kinetic Alphabet
- Country: United States, time zone America/Chicago
- Website: https://tkaflowarts.com (verify via the existing Search Console property)
- Support email: support@tkaflowarts.com
- Business description: "The Kinetic Alphabet (TKA) is a notation system for flow arts.
  It gives prop spinners a written alphabet for choreography: compose sequences in the
  free web app, then read them back like sheet music. The shop sells printed
  choreography card decks generated from the notation, including the LOOP Deck and the
  Timing & Direction Trilogy."
- Skip paid ads onboarding; enable free listings only.
- Add products manually:
  1. LOOP Deck, $35.00 USD, preorder, condition new,
     link https://tkaflowarts.com/shop/loop-deck,
     image https://tkaflowarts.com/branding/og-image.png,
     description "54 flow sequences printed as playing cards. Pick a transformation
     flavor and build your LOOP deck."
  2. TKA 1: Learning Letters, $30.00 USD, in stock, condition new,
     link https://tkaflowarts.com/shop/tka-1-learning-letters
  3. TKA 2: Writing Words, $30.00 USD, in stock, condition new,
     link https://tkaflowarts.com/shop/tka-2-writing-words
  4. TKA 3: Speaking Sentences, $30.00 USD, in stock, condition new,
     link https://tkaflowarts.com/shop/tka-3-speaking-sentences
- Shipping: ask me for the current flat rate before entering it.
```

## Not doing (and why)

- **Google Business Profile**: online-only businesses without in-person customer contact
  are ineligible; 2026 video verification checks signage and interior at the claimed
  address. Attempting it risks suspension and publishes a home address. It also would
  not affect the phonetic-alphabet autocorrect, which is a web-search entity problem.
- **Wikidata entry**: strongest Knowledge Graph lever, but entries without independent
  published coverage get deleted. Revisit after press / Kickstarter coverage exists to
  cite.

## Related

- Entity schema: `src/routes/+page.svelte` (Organization block)
- Search Console token: `static/googlec954fc3d206e6f49.html`
- Catalog price source of truth: Firestore `products` collection
