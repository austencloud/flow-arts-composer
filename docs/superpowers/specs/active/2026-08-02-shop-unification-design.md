---
status: active
value: 4
effort: S
remaining: "ACTIVE, but no longer for the reason recorded in 2026-08. The push gate is spent: a422744d6 (phase 1), 0beba2808 (phase 2) and e84ee4ab4 (round 13) are all on origin/main, verified 2026-09-13. What actually remains: (1) SALES_LIVE is still false in purchase-state.ts, gated on Austen clearing the Stripe payout requirement and Tax registration - every product still resolves to notify; (2) all four items under Decisions Austen owns are untouched - three Chicago fulfilment claims still render (DeckArchitectPage:392, LoopDeckConfiguratorPage:557, TnDTrilogyPage:80), the catalog sequence-id migration is undone so the R8 do-not-key-a-cache-on-sequence-id-alone workaround still stands, and claimUsername is unchanged; (3) round 13 embed chrome trim has no test; (4) the five deferred Codex follow-ups. Do NOT re-implement the front door, the shared shell, the five re-seated PDPs, the cross-sell rail, the 308 redirect or the nav rewire - all shipped."
depends_on: ""
plan_path: ""
tags: []
last_triaged: 2026-08-02
---
# Shop Unification — Catalog Front Door + Shared Product Shell

- **Date:** 2026-08-02
- **Status:** Approved (Approach A chosen by Austen in-session; full autonomy granted, iterate-on-result mode)
- **Supersedes as nav/IA authority:** the piecemeal link structure from `2026-06-23-shop-spin-up-design.md` and `2026-07-09-shop-conversion-rebuild-design.md` (their PDP work is retained and re-seated)
- **Owner loop:** Fable orchestrates + reviews; Opus 5 executors implement; Codex second view before ship

## Why

The shop grew piecemeal: six sibling destinations behind a nav dropdown, the front door
(`/shop`) permanently gated to Coming Soon for non-admins, nav leading with a mid-funnel
explainer, product pages that dead-end into the locked door (including the post-purchase
success page), and no lateral cross-sell anywhere. The bones are good — rich PDPs, deployed
Stripe checkout + cart, a 5-step PostHog funnel — but there is no spine. Austen's goal:
**establish the brand line.** Make the shop feel singular, well thought through, legible:
"I know what this is, what I'm buying, and where to click."

## Decisions (locked in-session)

1. **Primary goal:** establish the brand line (coherence/legitimacy), not short-term conversion.
2. **Product family model:** a growing catalog — distinct products sharing a brand; future
   axes: more decks, apparel/merch, digital products, books/learning material.
3. **Explainer content lives inside product pages** (rich PDPs). No standalone explainer
   destinations in shop nav.
4. **Approach A:** catalog front door + shared product shell; cohesion by construction
   (same playbook as `SequenceViewerShell`).
5. **Gate opens.** Browse layer goes public now. Real charging remains blocked on Austen's
   two Stripe items (payout requirement, tax registration) → per-product purchase state
   keeps CTAs honest until then.
6. **Device-fit strategy:** reuse the approach proven by `/test/smart-collections`
   (Austen: "a wonderful example of making a flow and a layout fit on EVERY device").
   Recon digest: `scratchpad/digest-smart-collections-strategy.md` (session scratchpad).

## Information Architecture

### Routes

| Route | Fate |
|---|---|
| `/shop` | **Ungated catalog front door** (new page, replaces `ShopComingSoon` for everyone) |
| `/shop/loop-deck` | Stays; re-seated in `ShopProductShell` |
| `/shop/loop-deck/architect` | Stays; re-seated; linked as LOOP Deck's power-user variant |
| `/shop/tnd-trilogy` | Stays; re-seated |
| `/shop/starter-pack` | Stays; re-seated |
| `/shop/[productId]` | Stays (book/one-off SKUs); re-seated |
| `/shop/choreography-cards` | **Retired: 301 → `/shop`.** Card-anatomy + live-QR content absorbed into shell "how it works" sections; brand story compressed into `/shop` hero |
| `/shop/success` | Stays; gains cross-sell rail (no more dead end into the old gate) |

### Nav (header dropdown + footer column + launchpad tile, kept lockstep)

- "Shop" itself → `/shop` (the catalog).
- Dropdown/footer items: LOOP Deck, T&D Trilogy, Starter Pack. "How Choreo Cards Work"
  leaves the nav. Launchpad tile points to `/shop`.
- All inbound pointers to `/shop/choreography-cards` (landing `ShopCtaSection`, launchpad
  tile, footer) update to `/shop`.

## The `/shop` Front Door

Top to bottom:

1. **Brand-line hero** — what Choreo Cards are in one held moment: a real card, the live
   scannable QR (portable component from the explainer page), one sentence of story.
2. **The catalog** — shelves showing only what exists: **Decks** (LOOP Deck; Deck Architect
   surfaced as its power-user variant), **Books** (T&D Trilogy, printed guide),
   **Bundles** (Starter Pack). Grid grammar absorbs future shelves (Merch, Digital) without
   recomposition. No empty shelves, no coming-soon tiles.
3. **Onward band** — one path into the free product (Composer/guide) for people who won't
   buy today.

Visual direction — **CHOSEN 2026-08-02: the hybrid (C's hero on B's body).** Austen picked it
from three mockups (`static/sketches/2026-08-02-shop-front-door-{a,b,c}.html`, compare page
`...-shop-direction-compare.html`): direction C's teaching hero ("Every card is a sequence.
Scan it and it moves." + the live QR card) compressed to ~60% of the viewport, then direction
B's shelf grid — chip row (All · Decks · Books · Bundles) + uniform tiles with cover art, name,
one-liner, price, status chip. Sketch copy caveats to resolve against reality before ship:
"printed and packed in Chicago" claim, and the guide book's price (sketch showed $30 with no
seed-data backing).

## ShopProductShell

`src/lib/features/store/components/shell/ShopProductShell.svelte` (final path may follow
module conventions — executor confirms against `new-module`/store layout).

Owns the grammar every product page shares:

- Catalog context strip (back to `/shop`, product family breadcrumb)
- Hero band: media + title + price block + CTA cluster (one visual system for all PDPs)
- "How it works" section slot (card anatomy, QR demo — fed per-product)
- Specs/details slot
- **Cross-sell rail** ("More from the line") — data-driven from the product catalog; also
  rendered on `/shop/success`
- Purchase-state-aware CTA: `active` → Buy (existing `BuyButton`/cart spine), `preorder` →
  Pre-order, `notify` → per-product notify-me (reuses waitlist capture, tagged by product)

Host pages stay thin: data + per-product sections through the shell's slots/props.
Deltas go through props, never forked chrome (anti-drift, per `sequence-viewer-shell.md`
precedent). Existing shop-funnel analytics events keep firing unchanged.

## Purchase-State Honesty

Product data gains/uses an explicit status: `active` / `preorder` / `notify`.
Until Austen completes Stripe payout + tax registration, nothing renders a charge-now Buy
that would fail: flip-to-live is a data change, not a redesign. The shop-wide waitlist
band survives on `/shop` (bottom, subdued) since it's the only capture reaching casual
visitors today.

## Quality Bar

- Every route passes the full 7-viewport sweep (375×667, 960×412, 820×1180, 1440×900,
  1920×1080, 2560×1440, 3840×2160) per `visual-verification-mandatory.md`; 4K rules per
  `4k-native-layout.md` (1680 seam, `--shell-w`, rem-based ramp).
- No layout shift (`no-layout-shift.md`), primitives reused (`never-hand-roll.md`,
  `chip-primitives.md`, `crossfade-primitive.md`), copy per `ai-writing-guide` voice.
- Codex second-view review + full `npm run check` before ship.

## Execution Ledger

- [x] Recon: shop surface map (session)
- [x] Recon digests: smart-collections strategy; store module inventory
- [x] Direction mockups (3) → Austen picked the hybrid (C hero + B grid)
- [x] Phase 1: `ShopProductShell` + purchase-state resolver — `a422744d68`
- [x] Phase 2: `/shop` catalog front door (ungated) + waitlist band — `0beba28088`
- [x] Phase 3: re-seat 5 surfaces + success rail — `8ac5104819..801094ba52` (7 commits)
- [x] Phase 4: explainer absorption + 308 redirect + nav rewire — `c0df410868`
- [x] Phase 5: review harness (`b75732fbae`) + Fable 7-viewport loop → fix batch `395c25d85b`
- [x] Phase 6: Codex second view (15 findings → 8 fixed `4b1bd29c89`, 7 deferred below);
      full `npm run check` green (0 errors / 0 warnings); scoped commits throughout
- [x] Spec updated with chosen direction + shipped state

## Hero iteration rounds (2026-08-02..03, post-ship feedback loop)

- [x] R1 `430e0b0`: animated front+back hero — live CardBack, mandala drawn by prop-tip
      trails (ShapeMatrixDrill recipe), phone-silhouette scan cue, 8s auto cycle
- [x] R2a `7a16c396bc`: sweep scoped to the QR cell (runtime-derived rect); mandala overlay
      centre measured, 0.7px delta (was 132px — grid start-alignment bug)
- [x] R2b `2a43ee89f1`: hero pinned to the card bake (staffs/back theme/light mode — 3
      profile leaks closed); printed-card trail preset (no glow, print inks); size drift
      re-anchored to trailed-tip reach (drawn/printed 1.021 → 0.991)
- [x] R3 `16a2bef0f9`: scan flow button-triggered ("Scan the code" → "Scan again",
      ActionButton + ghost-sizer), engine lazy-mounts on first press, no auto-repeat
- [x] R4 `0cfcc0e026`: shuffle ("Deal another card", pool without replacement) + auto-scan
      on land; start-position cell fixed (ensureStepPlacement read path — the
      PictographPreparer warning WAS this bug; console fully clean since); onward-band CTA
      href /composer → /create (siblings fixed in `5126812d89`)
- [x] R5 `2df5c40748`: **Hero v2 — the phone shows the real thing.** Iframe of the literal
      `/q/<code>?demo=1` (demo flag suppresses PostHog + scan logging + Firestore scan
      ledger — 4 guards in the /q host/layout); read-only `findExistingCodeForSequence`
      (never mints codes client-side); iframe pointer-inert + "Open this scan" pill
      (real visit, no demo flag); live-draw mandala machinery deleted. Fix batch
      `1f27c3cc26`: pill seated below phone, 960×412 fold restored; the 366×0
      animation-pane scare = emulation-mode-toggle artifact, NOT a product bug (real
      phone scans animate — proven three ways).
- [x] R6 `9d28611e89`: scan is an ENTRANCE — rest = two cards only; press → cards tighten,
      phone swings in from off-stage in front (z 3); camera view de-warped (card 64% of
      screen, room visible, opposite-drift parallax); hydration mismatch NOT reproducible
      (likely mid-HMR SSR/client skew; hero SSR markup proven branch-free); the failing
      Firestore username write on /shop belongs to shared auth (`claimUsername` via the
      global auth listener's repair path) — NOT shop code, unfixed, flagged to Austen.
- [x] R7 `27a8d5468f`: deal flourish — all three stage objects in one 730ms gesture
      (lift/fan + phone step-back → stacked exit → dealt-in entrance w/ overshoot);
      iframe internal height DERIVED from the measured screen box (was hardcoded 812 →
      69% of /q's bottom bar hidden; now scrollHeight == clientHeight, nav flush).
- [x] R8 forensics + repair (2026-08-04): Austen scanned an A card (0 turns) and got the
      0.5-turn variant. Verdict: THREE id-keyed caches, one root cause — **the catalog
      reuses one sequence id across turn variants** (`tnd-split-same-aaaa` = 3 different
      sequences across the trilogy; LOOP decks duplicate too). (1) hero scan-code memo →
      fixed `d44f2287c1`/`e0321598cc` (memo keys on encoder string + hero decodes the
      QR on the displayed cover and hides scan on mismatch); (2) cover render cache
      (key fixed `4b1bd29c89`; the 11 stale wrong-card bakes in Storage — TKA-3 wearing
      TKA-2's art+QR, 5 LOOP covers wrong word — repaired 2026-08-04: cleared + re-baked
      55/55, ZXing sweep 60/60 correct, zero byte-dup renders); (3) DeckFanCover art
      cache → fixed `752964102d` (per-card discriminators). Physical PRINTED cards
      unaffected (print pipeline resolves codes per card, never touches these caches).
      Shortcode infra proven innocent: turns ARE encoded; 852 shortcode docs join on
      those seed ids — which is why the id migration was STOPPED (see Decisions).
- [x] R9 `29d5c912a8`: deal RESETS the stage — cards + phone (if out) exit in one gesture,
      two fresh cards deal in side by side, scan re-earned (auto-scan deleted; iframe
      unmounts at the swap frame, next press boots fresh). Supersedes R6's phone-stays
      and R4/R7 auto-scan. Commit message's "NOT YET VISUALLY VERIFIED" caveat is stale:
      verified 2026-08-04 after the DevTools MCP reconnect — 5 frames, 190-rAF rect
      stability (1 distinct rect set outside the scene), phase trace matches design
      within a frame, 960×412 fold identical across all states, zero console noise,
      R8 guard fired zero times. Unit tests: hero-scan-timeline-stage 6/6.

- [x] R10 `dc4f037186` (Austen's copy: headline = the product name, three new steps,
      two typo fixes) + `5a60ff7058`: **the scanned state spreads.** The parted
      composition was one stack at every width — back 37% unoccluded, front 70%
      (the phone ate its code corner). Austen: "the cards should be more visible
      while animation is playing ... we have lots of space on 4K" and "the words
      Choreo Cards are so far to the left with a big space in between the
      animation." Two changes, one geometry: (1) both faces hang off the scene's
      CENTRE through an `--x` offset in card-heights instead of being pinned to
      left:0/right:0, and container tiers on .card-stage (640px / 900px, px on
      purpose — fitting three objects is a pixel question, not a type-scale one)
      widen the scene box AND walk the parted cards further left inside it, the
      card paying for the room via `--scene-fit`; (2) the hero's copy column is
      `fit-content(38rem)` with a capped gap, so the slack it never used goes to
      the stage. Measured unoccluded, scanned: 100/100 at 3840, 2560, 1920;
      76/100 at 1440 and 820 (mid tier); 38/70 unchanged at 960x412 and 375,
      where the trade is a third of the card for a sliver of the back. Copy→scene
      dead field 426→108 (1920) and ~716→184 (3840). Card size is held or grown
      everywhere except tablet portrait (416→321) and 1920 (432→423). The REST
      pair stays centred in the wider scene on purpose — it sits in the stage's
      glow and under the trigger — so the rest-state gap (274 at 1920, 420 at
      3840) is 0.33 card-heights wider than the scanned one BY CONSTRUCTION:
      that translation is the parting gesture. Shifting rest left buys ~25% of it
      back and costs the same amount of gesture; flagged for Austen, not taken.
      Verified: rest+scanned frames at 3840/2560/1920/1440/820/960x412/375, zero
      layout shift across scan→deal→scan (hero box and scene width identical in
      all four states), 960x412 fold and pill guarantees intact, zero page
      console errors.

- [x] R11 `7176d242dc`: **the phone goes live.** Austen: "is this the most
      realistic we can make the phone look ... do we want to make it so that we
      can actually interact with it by clicking the navigation ... on my 4K
      device I actually could click each one of these buttons very easily."
      Three decisions, all approved:

      1. **CSS materiality** (no device-frame asset, no brand cosplay). A conic
         gradient masked to the border box replaces the flat inset hairline, so
         the frame catches light on the upper-left and lower-right chamfers and
         goes near-dark between them — the lean and the entrance now read as an
         object turning. Power + volume nubs hang off the frame edges (widths in
         % of phone width, heights in % of phone height, so they hold at every
         size the stage hands the component). A punch-hole camera sits ON the
         display just below its top edge (3.7% of body width — the viewer's top
         bar runs under it, not around it), and the old 26%-wide "speaker" bar
         that straddled the screen seam is now a thin earpiece slit entirely on
         the bezel. A 118° two-band glare sweeps the glass at 11% white max,
         `mix-blend-mode: screen`, aria-hidden and pointer-inert. Kept intact:
         the derived `frameH`, the entrance/lean/opened transform ladder,
         reduced motion, and the host's `--phone-h` contract.

      2. **Live when big enough, inert below.** The iframe was pointer-inert at
         every size ("a depiction, not a control surface"). It now gates on the
         MEASURED screen width — the same ResizeObserver binding `frameH` uses,
         never a media query. Threshold **scale ≥ 0.9**, because the viewer's
         44px floor lands at `44 × scale` and below ~40px it stops being a
         control anyone can hit on purpose. Measured:

         | viewport | screen px | scale | 44px lands at | verdict |
         |---|---|---|---|---|
         | 3840×2160 | 399 | 1.064 | 46.8 | live |
         | 2560×1440 | 347 | 0.925 | 40.7 | live |
         | 1920×1080 | 255 | 0.680 | 29.9 | inert |
         | 1440×900 | 217 | 0.579 | 25.5 | inert |
         | 960×412 | 75 | 0.200 | 8.8 | inert |
         | 375×667 | 110 | 0.293 | 12.9 | inert |

         The line falls in the empty gap between 0.680 and 0.925 — no tier is
         near it, so 0.9 is stable rather than lucky. The only chatter risk is a
         resize dragged across it, so the gate has hysteresis: opens at 0.9,
         closes at 0.86. Live adds a cyan halo on the body and a "This screen is
         live" chip absolutely placed above the phone (no layout shift; it can
         only appear at sizes where there is room above the stage). The pointer
         affordance is the embedded page's own hover states — a cursor rule out
         here cannot reach inside the frame. "Open this scan" stays in both
         states.

      3. **Everything real, no fences.** Nothing on /q was touched. Verified at
         3840 with real trusted clicks (`isTrusted: true`) passing through
         `.card-stage → .scene → .phone-holder → .phone` (3D rotated) `→ .screen
         → .viewport` (scaled) `→ iframe`: bottom-nav Side-by-Side → Tunnel →
         2D Animation each switched the view; the Playback panel opened inside
         the phone and "Step-by-step playback mode" toggled to `aria-pressed
         true`; step cells select and move the playhead. `elementFromPoint` over
         all five nav tabs returns the IFRAME (nothing above swallows), each tab
         measures 72×47 px on screen, and the inner document's
         `scrollHeight === clientHeight`, so a wheel over the live screen chains
         to the page instead of trapping. Two findings, neither fenced: the
         viewer's **X navigates the IFRAME to `/browse/gallery`** — the outer
         /shop page is untouched, the pill still points at `/q/<code>`, and
         "Deal another card" unmounts and re-arms the phone, so it is
         recoverable, but the phone then shows the browse app instead of the
         scan; and the 2D view's corner play/pause is auto-hiding chrome parked
         above the frame (`visibility: hidden`), so it never appears in the
         embed — playback is still reachable through the Playback panel.

      Verified: rest + scanned frames at 3840/2560/1920/1440/820/960×412/375;
      gate table above measured with `evaluate_script`; before/after interaction
      frames at 3840; 960×412 fold intact (pill bottom 317, trigger bottom 386
      of 412) and zero horizontal overflow at 960 and 375; zero page console
      errors on a clean load through a full scan. Harness note for the next
      session: DevTools MCP's `click` ignores the iframe's CSS `transform:
      scale()`, so it lands at `target / scale` and cannot reach the bottom ~6%
      of the screen. Sizing the window so the scale is exactly 1.0 (3840×1553)
      makes it land true — that is how the nav-tab clicks above were driven.

- [x] R12 `208e352383`: **the page-wide layout pass.** Every round so far had
      been the hero. Austen, on the page around it: "no matter how I resize my
      webpage or no matter what device I have it feels like it is designed for
      that device ... right now there's stuff peeking out from the bottom that
      doesn't feel right ... the content is not just the size of the container
      that it's in ... the shop is[n't] open yet and not buying today, things
      have so much vertical space between them as well as so much horizontal
      space that they take up in the first place." Three problems, one pass.

      1. **THE FOLD — the first screen is the hero plus the shelf filter.**
         Measured before: the grid's top edge landed 61px above the fold at
         1920×1080, 155px at 2560×1440 and 27px at 820×1180 — dark tile shells
         cut mid-shape with nothing readable in them. A designed peek was the
         other option and was rejected on arithmetic: it needs the hero ~140px
         SHORTER, and the hero's height is the card stage, which R10 had just
         widened on purpose. So the gap is closed: `min-height: calc(100svh -
         var(--shop-header-h) - var(--shop-fold-reserve))`. `min-height` only
         ever grows the band, so it is a no-op wherever the hero already
         overflows (375: natural 850 vs a 503 budget) and cannot pull anything
         back above the fold. `ShopFrontDoor` declares both variables — the
         reserve is the filter band plus the catalog's top padding — so the
         hero is not guessing at what sits between it and the first tile.
         Result: −1px at 1920, −1px at 2560, −1px at 820, +15px at 1440.

         **Above 3000px the rule stops.** At 4K@100% the leftover below the
         filter is ~655px against a ~690px tile row, so the right answer up
         there is the whole first row, not a filled screen — filling it would
         have added 655px of dead hero, the exact failure the old 60svh floor
         had. The 4K padding-block drops to `clamp(1.5rem, 2vh, 2.75rem)` to
         buy that row its last 30px: first-row bottom 2129 of 2160. Tight by
         design, and it degrades to today's behaviour (a cut row) rather than
         breaking if a future product title wraps to two lines at 4K.

         The `min-height: 41rem` guard keeps the rule off the wide-and-short
         tier. 960×412 is byte-identical to R11: hero 356, "See the catalog"
         324–368, scan trigger 335–386, grid 108px below the fold.

      2. **TILES — the art box is derived from the fan, not from a clamp.**
         `height: clamp(11rem, 15vw, 18rem)` grew with the viewport while
         `DeckFanCover` stayed capped at `maxCardWidth` 150, so at 3840 a
         438×238 fan sat in a 733×432 panel — 40% of it — and at 820 the same
         clamp went the other way and CLIPPED the fan's outer corners (fan 186
         in a 176 box). Both ends are now arithmetic. A fan of n cards spans
         `cardW · (1 + 0.82(n-1)) · 1.05` — 3.633 for four, 2.772 for three —
         so the card is `boxW / pitch` and the box is `boxW · 1.65 / pitch`,
         written as `calc(100cqi × ratio + 12px)`. `100cqi` is the tile
         container's CONTENT width, which IS the art box's width (verified
         with a probe: a `@container (min-width: 500px)` query does not match a
         534px-border-box / 479px-content-box tile), so the height resolves at
         first layout — no measurement, no shift.

         The card size is passed as both `cardWidth` and `maxCardWidth`, which
         is what makes every tile draw the SAME card. Left alone the fan
         spreads whatever it is given across the box, and the trilogy ships
         three cover cards where the decks ship five: its three came out a
         third bigger than everyone else's and 40px taller than the box. The
         count switches 3→4 at 448px of art width, and the `@container` tier
         is the same 448 because both read the content box.

         Measured card width / art box, before → after: 1920 107/288 →
         131/230; 2560 143/347 → 176/304; 3840 150/432 → 201/345; 1440
         ~110/230 → 132/230; 820 113/176-clipped → 112/198; 375 91/176 →
         95/169. Art grows with its tile everywhere and fills it in both
         directions. Type and padding already ramped (`--font-size-min` and
         `--font-size-compact` are rem), so nothing was frozen in px.

      3. **GRID — pinned counts, centred remainders.** Counts stay 1 / 2 / 3,
         but each tier runs double tracks with `grid-column: span 2`, so the
         final row can sit on half-tile boundaries: a remainder of two steps in
         one track (`:nth-last-child(2) { grid-column: 2 / span 2 }`), a
         remainder of one centres (`:last-child { grid-column: 3 / span 2 }`).
         Five products now read 3 + a centred 2 instead of 3 + 2 stranded
         against an empty track. It also fixes a worse case the old rule owned:
         `wideColumns` returned 1 for a single item, so the Books and Bundles
         shelves rendered ONE tile stretched across the whole 1669px band.
         That tile is now one column wide, centred (x 688, w 534, in a band
         centred on 955).

      4. **BANDS — one row of two cards.** The notify and onward bands were
         consecutive full-width rows, each a mostly-empty panel with a
         paragraph at one end and a control at the other, 76px between them and
         a 101px margin under the pair. They are a pair, so they share a row:
         a two-column `.exits` grid above 60rem, stacked below, each card a
         column with its control on `margin-top: auto` so both actions land on
         the same foot. The `52ch` cap came off the paragraphs (4k rule 3) —
         they are one-sentence lines in a half-band card and the cap only made
         the card taller. Page height at 1920: 3190 → 2913, with the two bands'
         combined 422px of stacked height becoming a single 259px row.
         `SALES_LIVE` gating, both copy strings and the waitlist wiring are
         untouched.

      Also folded in, at Austen's word: the hero's kicker element was empty
      (`<p class="kicker"><span aria-hidden></span></p>`) and nothing is going
      back in it — removed with its dead CSS, so the copy block tightens by a
      blank line plus a column gap. And the tile's purchase-state variable was
      renamed off `state`: adding `$state` for the art measurement made Svelte
      5 read the token as a store auto-subscription of that variable
      (`store_rune_conflict`, `reference_svelte5_store_rune_conflict`). Caught
      by check, not by eye — the page rendered.

      Verified: fold, catalog and bands/footer frames at 3840×2160, 2560×1440,
      1920×1080, 1440×900, 820×1180, 960×412, 375×667. No slivers, no orphan or
      stretched tiles, no art floating in padding, no horizontal overflow
      (scrollWidth < innerWidth at every tier). The scan flow runs end to end at
      1920 — iframe `/q/5DL9?demo=1` mounts, "Deal another card" appears — with
      hero height 896, stage width 1099 and grid top 1079 IDENTICAL before and
      after, so the fold rule changed none of the hero's sizing inputs. Zero
      page console errors. `check:fast`: 19 errors repo-wide, byte-identical to
      the HEAD baseline (measured by restoring HEAD's tile and re-running),
      none in these files.

- [x] R13 `e84ee4ab4b` + `122a9b0cb6`: **the live screen answers a mouse, and
      the embed loses the exits.** Austen: "we don't want it to navigate back
      to browse we should just deactivate the buttons that don't make sense in
      this context show the bottom five buttons as navigatable and actually use
      them right now when I try to click on them inside the fake phone it still
      does not work." Two causes, both closed.

      1. **The gate was measuring the wrong pointer.** R11's single threshold,
         0.9, came from the app's 44px touch-target floor — and 44px is a TOUCH
         norm, the size of a fingertip. Applied to a mouse it made 4K@200%
         Windows scaling (a 1920 CSS viewport — Austen's own machine) inert.
         The floor now follows `(hover: hover) and (pointer: fine)`. For a fine
         pointer the governing number is WCAG 2.2's Target Size (Minimum), 24
         CSS px, against the smallest real control in the frame — a bottom-nav
         tab, measured 67.6 × 44.0 CSS px — so 24 / 44 = 0.545 → **0.55**
         (hysteresis 0.52). Coarse keeps R11's 0.9 / 0.86 verbatim.

         | viewport | screen px | scale | tab lands at | fine | coarse |
         |---|---|---|---|---|---|
         | 3840×2160 | 399 | 1.064 | 46.8 | live | live |
         | 2560×1440 | 347 | 0.925 | 40.7 | live | live |
         | 1920×1080 | 255 | 0.680 | 29.9 | **live** | inert |
         | 1440×900 | 217 | 0.579 | 25.5 | **live** | inert |
         | 820×1180 | 194 | 0.517 | 22.8 | inert | inert |
         | 960×412 | 75 | 0.200 | 8.8 | inert | inert |
         | 375×667 | 110 | 0.293 | 12.9 | inert | inert |

         Both lines sit in empty gaps in that ladder (0.55 between 0.517 and
         0.579; 0.9 between 0.680 and 0.925). 820 falls just under the fine
         line on purpose: 22.8px is below the 24px minimum, and a real 820-wide
         device reports a coarse pointer anyway. Pointer type is a media query
         with a `change` listener rather than a sample, so a convertible
         folding into tablet mode flips it without a resize.

      2. **/q edits are now sanctioned, and they went through the prop seam.**
         R11 found the viewer's X navigating the IFRAME to `/browse/gallery`.
         The fix is one shell prop, `embedded`, passed by the /q host only when
         `demo=1` — no forked chrome, no host-side header, no theme vars, the
         768 breakpoint untouched. Hidden rather than disabled: a visible
         button that ignores a press reads as broken, which is worse than a
         button that was never there. Per control:

         | control | verdict | why |
         |---|---|---|
         | Close (X) | hidden | the embed has nowhere to close TO |
         | Account entry | hidden | auth trapped in a marketing iframe; its signed-in variant is a link to /browse/gallery |
         | Share | hidden | `getViewerShareDetails()` seeds from `window.location.href` — in here that is the `?demo=1` URL, so sharing would put demo-flagged links (which suppress scan analytics by design) into the world |
         | More → Open TKA / Remix / Guide | hidden | each navigates the frame away |
         | More → Favorite / Save | hidden | open the sign-in gate |
         | More → publish / unpublish / delete / video upload | hidden | a marketing page must not be able to publish or delete a sequence |
         | More → motion Left/Right | KEPT | pure view state; the menu degrades to a plain title when the sequence is not paired |
         | Practice, bottom-nav, rail, playback, step cells | KEPT | this is what the hero is there to show |

         Dropping the account entry also clears `accountCrowded`, which hands
         the More trigger back to the centered title slot — the embed gets its
         header title ("Sequence Viewer") back, which the 375-wide layout had
         traded away for room. **The keyboard path is not the shell's**:
         Escape reaches `onClose` through the ORCHESTRATOR, so `closeViewer`
         in the /q host no-ops under `isDemo`. Hiding the button alone would
         have left Escape navigating the frame to the gallery.

      Verified at 1920 (fine pointer): `.phone.live`, `.viewport`
      `pointer-events: auto`, the cue chip visible, `elementFromPoint` over all
      five nav tabs returns the IFRAME, and every one of the five switches the
      view (Side by Side → 2D Animation → Card → Mandala → Tunnel, each ending
      as the sole `active` tab) with before/after frames on the 2D→Card step.
      Same viewport under emulated touch: `pointer: coarse`, live false,
      `pointer-events: none`, no cue — the coarse rule intact, and at 3840 the
      coarse gate still opens. Frames at 3840/2560/1920/1440/375; 820, 960×412
      and 375 inert; no horizontal overflow at 960 or 375. In the embed
      close/share/account count 0 and the More menu holds only Left/Right;
      Escape leaves the frame on `/q/<code>?demo=1`. Real `/q/5DL9` with no
      flag is unchanged — close/share/account 1, header carries Open TKA +
      Share + Close, Escape still exits to `/browse/gallery`. Contract test
      19/19. Zero page console errors on a clean load through a full scan.
      `check:fast`: 19 errors repo-wide, none in the three touched files.

      Session note: a parallel session ran `git pull --rebase --autostash`
      mid-round, which stashed this work out of the tree for ~2 minutes. It
      came back intact when the rebase popped its autostash. A `stash@{0}:
      autostash` entry is still listed afterwards — not ours to drop, flagged
      rather than touched.

## Shipped state

> **Correction, 2026-09-13 (spec reconciliation).** This section was headed
> "2026-08-02, local commits — NOT pushed" and the paragraph below describes a
> push Austen had yet to sequence. That is no longer true: `git branch -r
> --contains` puts `a422744d6` (phase 1), `0beba2808` (phase 2) and `e84ee4ab4`
> (round 13) on `origin/main`. The shop is pushed and the unified surface is
> live. What still holds the store closed is `SALES_LIVE = false` in
> `purchase-state.ts`, which is a payment gate on Austen's Stripe payout and Tax
> registration — a real gate, deliberately preserved here, not drift.
>
> Two other small corrections from the same pass. The IA table calls the retired
> route a 301; the implementation is a **308**, chosen on purpose to preserve the
> path and method and to match the `/store` shim
> (`src/routes/(public)/shop/choreography-cards/+page.ts`) — the code is right.
> And two ledger SHAs do not resolve in this repository: `0cfcc0e026` (round 4,
> which appears to be `48d392b35`) and `5126812d89`. Every one of the other 26
> cited SHAs resolves.

### Original note (2026-08-02, local commits — NOT pushed)

All work is committed locally. **Pushing main deploys production (CF Pages)** and would take
the ungated shop live; Austen sequences that. Blocking the push, deliberately:

1. `SiteHeader.svelte`, `SiteFooter.svelte`, `launchpad-tiles.ts` (+ `sitemap.xml/+server.ts`,
   `test/landing-directions/*`) hold BOTH our shop nav rewiring AND another session's
   uncommitted "Notation→History" relabel — left uncommitted per
   `commit-only-your-own-changes.md`. The committed `landing-route-morph.test.ts` expects the
   new launchpad tile href, so those files and that test must land in the same push.
2. `SALES_LIVE` remains `false` (`src/lib/features/store/domain/purchase-state.ts`) until
   Stripe payout + tax registration are done; every CTA renders notify-mode. Flip is a
   one-line change.

## Deferred follow-ups (from the Codex review round + build)

- `Date.now()` captured once in catalog-listings / LoopDeckConfiguratorPage / TnDTrilogyPage:
  preorder pricing won't cross the Sept 30 cutoff while a tab stays open. Low urgency.
- `cover-front-renderer.ts`: bootstrap failure permanently resolves (no retry); cached blob
  URLs never revoked (session-length leak). Pre-existing service behavior.
- `StorePage.svelte` orphaned (only a route-morph test reads it); deleting it strands
  `BakeCoversButton.svelte`, which needs an admin route home first.
- `PropPicker`/`ShopPropPicker` fork (pre-existing).
- Mobile: floating cart button overlaps the "Custom" difficulty chip on /shop/loop-deck at
  375 (pre-existing, outside shop files).

## Decisions Austen owns

- Three "Chicago" claims render on shop surfaces: Deck Architect product description
  ("Hand-cut and packed in Chicago" — Firestore data), and the assurance lines on
  LOOP/T&D/Architect PDPs ("printed and cut by hand in Chicago, small batches" — page copy
  predating this work). Confirm true, or say the word and they come out.
- Duplicate Firestore doc `products/prod_UsGN7MufXHI8VI` ("LOOP Deck", no `listing`):
  code now dedupes it, but the prod data doc should be fixed or deleted (not touched).
- T&D Trilogy shelves under **Decks** (its SKUs are `type: physical-deck`), so chips read
  All 5 · Decks 3 · Books 1 · Bundles 1. If the trilogy belongs under "Books" as the
  teaching line, that's a product-data change, not a layout change.
- **Catalog sequence-id migration (approved in principle 2026-08-04, STOPPED at
  investigation — a catalog-identity decision, not a scoped repair).** The seed ids
  (`tnd-split-same-aaaa` etc.) are shared across turn variants and joined by 852 live
  `shortcodes` docs (resolution strategies parse them), 60 `decks` + 60 `catalogs` docs
  incl. `l1-tnd-motions` (TND_BASE_CATALOG_ID), and id-PARSING code
  (`deck-composer.ts` seedWordOf, `canonical-tnd-pool.ts`). Three caches have now
  failed on this landmine (R8). Recommended scheme when done: the existing
  `${seedId}__t_${pattern}` convention from `canonical-tnd-pool.ts:70`. Open question
  the migration must answer: do product covers fork from the base catalog, or does the
  base catalog move with them? Renaming also forks provenance for codes that may be on
  printed cards. Until migrated: NEVER key a cache on sequence id alone — add
  deckId/deckName discriminators (three precedents in R8's fixes).
- The failing Firestore write on every signed-in page load (`claimUsername` →
  `users/<uid>` update, failed-precondition; owner: shared auth,
  `username-validator.ts:108-137` via the global auth listener's repair path) — found
  during R6, not shop code, still firing.
