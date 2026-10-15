# SEO Content Roadmap (2026-07-09)

Keyword-mapped content strategy for tkaflowarts.com. Produced for the SEO
overhaul (`docs/superpowers/specs/shipped/2026-07-09-seo-overhaul-design.md`, Phase 3).

Implementation note (2026-10-14): `/notation` redirects with 301 to `/history`, owned by `src/routes/(public)/notation/+page.ts`. Individual `/notation/*` pages remain. The proposed pillar-page replacement below is the July strategy, not current routing.

## Business Summary

The Kinetic Alphabet (TKA) is a notation system and web app for flow arts
choreography (staff, poi, fans, clubs). It has a free multi-chapter learning
guide (`/guide/level-1/*`), a shop selling physical choreography card decks
(Loop Deck, T&D Trilogy), and the core app for building/reading/writing
sequences. It occupies a real gap: dance and circus disciplines have movement
card decks (aerial hoop, belly dance, pole), and formal dance notation exists
(Labanotation, Benesh), but nothing purpose-built for flow arts notation or
card-based practice exists today. That gap is the wedge for every page below.

## Current Content Landscape

- Landing page (`/`), free guide (`/guide/level-1/*`), shop (`/shop`,
  `/shop/loop-deck`, `/shop/tnd-trilogy`), `/about`.
- Content health: strong product/app depth, thin top-of-funnel. No blog, no
  standalone informational pages targeting "how to learn X" or "what is X"
  queries. Everything existing is bottom-funnel (products) or deep-funnel
  (guide chapters assume the visitor already found the app). The gap is the
  entire top and middle of the funnel.

## Competitive Landscape

- **Movement/choreography card decks:** Moody Street Circus (aerial hoop,
  belly dance choreography cards), Dance Ed Tips (general movement cards),
  Etsy sellers (pole dance cards). None target staff/poi/flow arts — wide open.
- **Flow arts instruction:** Flowtoys (products + lessons, no notation system),
  Home of Poi (poi community/tutorials), YouTube channels (Nick Woolsey, Drex).
  They rank for "learn poi" / "learn staff spinning" generically but don't own
  "choreography" or "notation" as a concept.
- **Movement notation:** dominated by formal dance notation references
  (Britannica, Harvard Library, Labanotation/Benesh academia). Zero
  flow-arts-specific notation content exists. "Flow arts notation" is
  unclaimed keyword territory — first-mover advantage.
- **Net read:** TKA can win "choreography card deck" + "flow arts notation"
  outright, and compete on "learn poi/staff choreography" by being more
  systematic than tutorial-style competitors (notation system vs video
  library is the differentiator to lead with).

## Keyword Clusters

### Cluster 1: Flow Arts Choreography (informational → commercial)

- "flow arts choreography" — informational, hub
- "how to choreograph a flow arts routine" — informational
- "flow arts sequence ideas" — informational
- "flow arts routine structure" — informational
- "flow arts choreography software" / "flow arts choreography app" — commercial

### Cluster 2: Flow Arts Notation (informational, low competition — own this)

- "flow arts notation" — informational
- "movement notation for staff spinning" — informational
- "poi notation system" — informational
- "how to write down a flow arts sequence" — informational
- "dance notation vs flow arts notation" — informational (borrows authority
  from Labanotation searches)

### Cluster 3: Choreography Card Games / Movement Card Decks (commercial)

- "choreography card deck" — commercial
- "movement card game" — commercial
- "flow arts card deck" — commercial
- "staff spinning cards" / "poi practice cards" — commercial
- "dance choreography cards" (adjacent high-volume category term) — commercial

### Cluster 4: Learn Staff Spinning Choreography (informational → commercial)

- "learn staff spinning" — informational
- "staff spinning choreography for beginners" — informational
- "staff spinning tricks in sequence" — informational
- "how to build a staff routine" — informational
- "staff spinning practice tool" — commercial

### Cluster 5: Learn Poi Choreography (informational → commercial)

- "learn poi choreography" — informational
- "poi choreography for beginners" — informational
- "how to sequence poi moves" — informational
- "poi practice routine" — informational
- "poi choreography app" — commercial

Scope note (per `.claude/rules/tka-domain.md`): TKA is built for double staves; Poi Lab is
planned, not built. Poi pages must be honest — lead with staff, mention poi
where genuinely supported, never overclaim poi tooling that doesn't exist.

### Cluster 6: Flow Arts Practice Tools / Drills (commercial)

- "flow arts practice tools" — commercial
- "flow arts drills" — informational
- "prop spinning practice app" — commercial
- "flow arts training system" — commercial
- "choreography practice tool" — commercial

### Cluster 7: Flow Arts Gifts / Merch (commercial, seasonal)

- "flow arts gift ideas" — commercial, seasonal
- "gifts for poi spinners" / "gifts for staff spinners" — commercial
- "flow arts card deck gift" — commercial
- "circus performer gifts" — commercial, adjacent

## Topic Authority Map

### Pillar 1: Flow Arts Choreography

Hub: **create `/learn/flow-arts-choreography`**

- How to Choreograph a Flow Arts Routine — informational
- Flow Arts Sequence Ideas for Beginners — informational
- Flow Arts Choreography Software Compared — commercial
- Links down into `/guide/level-1` chapters as the "go deeper" path

### Pillar 2: Flow Arts Notation

Hub: **create `/notation`** (replaces the 301 redirect)

- What Is Flow Arts Notation? — informational
- The Kinetic Alphabet vs. Dance Notation (Labanotation comparison)
- How to Write Down a Staff or Poi Sequence
- Links directly into `/guide/level-1`

### Pillar 3: Choreography Card Games / Card Decks

Hub: `/shop/loop-deck` (optimize) + **create `/shop/choreography-cards`**
(category page)

- What Is a Choreography Card Deck? — top-of-funnel into shop
- Loop Deck product page — "flow arts card deck", "staff spinning cards"
- T&D Trilogy product page — "poi practice cards"
- "Movement Card Decks for Every Discipline" comparison — positions against
  aerial hoop/belly dance decks, captures that traffic

### Pillar 4: Learn Staff Spinning Choreography

Hub: **create `/learn/staff-spinning-choreography`**

- Staff Spinning Choreography for Beginners
- How to Build a Staff Routine Step by Step
- Staff Spinning Practice Tools
- Deep link into `/guide/level-1` chapter 1

### Pillar 5: Learn Poi Choreography

Hub: **create `/learn/poi-choreography`** (honestly scoped)

- Poi Choreography for Beginners
- How to Sequence Poi Moves
- Deep link into `/guide/level-1`, poi framing

### Pillar 6: Flow Arts Practice Tools

Hub: `/` landing (optimize) + possible `/practice` page later

- Flow Arts Practice Tools Compared
- Flow Arts Drills for Daily Practice

### Pillar 7: Flow Arts Gifts / Merch

Hub: **create `/shop/gifts`** (seasonal, lightweight)

- Flow Arts Gift Guide
- Gifts for Poi and Staff Spinners
- Feeds `/shop/loop-deck` and `/shop/tnd-trilogy`

## Content Gap Analysis

| Gap Topic                                      | Why It Matters                                                              | Priority   |
| ---------------------------------------------- | --------------------------------------------------------------------------- | ---------- |
| "What is flow arts notation" definitional page | Zero competitors own the term; the site's actual unique value prop          | High       |
| "Choreography card deck" category page         | Adjacent decks rank for the category term; no flow arts entry exists        | High       |
| "Learn staff spinning choreography" landing    | High-intent beginner traffic currently only reachable via generic tutorials | High       |
| "Learn poi choreography" landing               | Same gap for poi searchers; scope honestly (Poi Lab not built)              | Medium     |
| Labanotation comparison piece                  | Borrows search volume from a much bigger category                           | Medium     |
| Seasonal gift guide                            | Cheap; converts shop traffic in gift windows                                | Medium     |
| Practice tools/drills content                  | Lower distinct volume; overlaps app landing copy                            | Low-Medium |

## Prioritized Roadmap: First 4 New Pages

1. **`/notation` — "What Is Flow Arts Notation?"** Zero competition, defines
   the category TKA owns; every other page links into it as the authority
   source. Highest-leverage single page.
   Internal links: from `/` hero, from every guide chapter, from `/about`.
2. **`/shop/choreography-cards` — "Choreography Card Decks for Flow Arts."**
   Captures existing adjacent-category volume, funnels straight to revenue.
   Internal links: from `/shop`, cross-links both product pages.
3. **`/learn/staff-spinning-choreography`.** Staff is TKA's canonical prop —
   most honest, highest-converting beginner funnel into `/guide/level-1`.
   Internal links: from `/`, from `/notation`, deep link to guide chapter 1.
4. **`/learn/poi-choreography`** — honestly scoped poi landing.
   Internal links: from `/`, from `/notation`, into guide, cross-link staff page.

Deferred: `/shop/gifts` (next gift window), Labanotation comparison (citation
care), practice-tools page (redundant with landing copy for now).

## 12-Week Content Calendar

Month 1 (foundation): the four pillar pages above, one per week.
Month 2 (expansion): How to Choreograph a Flow Arts Routine · TKA vs. Dance
Notation · How to Build a Staff Routine Step by Step · How to Sequence Poi Moves.
Month 3 (authority): Movement Card Decks for Every Discipline · Flow Arts
Sequence Ideas for Beginners · Flow Arts Gift Guide · Flow Arts Drills for
Daily Practice.

## Internal Linking Plan

- `/` becomes the top-of-funnel router: links to `/notation`, both `/learn/*`
  pages, and `/shop/choreography-cards`.
- `/notation` is the authority hub every page links back to for "why notation."
- The two `/learn/*` pages cross-link each other and deep-link into specific
  guide chapters, not just the guide index.
- `/shop/choreography-cards` sits between `/shop` and the product pages,
  cross-linking both directions.
- Every guide chapter links up to `/notation` and across to the relevant shop
  product (the physical deck version of what they're reading).
- `/about` links to `/notation` as "the system we built."

## Quick Wins

1. Retitle `/shop/loop-deck` and `/shop/tnd-trilogy` to include "choreography
   card deck" + "flow arts" in title tags and H1s.
2. Add a "what is flow arts notation" summary paragraph on the landing page
   linking to `/notation`.
3. Once `/shop/choreography-cards` exists, consolidate overlapping category
   copy there; trim product pages to product-specific detail (avoids
   duplicate-content dilution).

## Metrics to Track

- Organic traffic to `/notation`, `/learn/*`, `/shop/choreography-cards`.
- Rankings for "flow arts notation", "choreography card deck", "learn staff
  spinning choreography", "learn poi choreography".
- Production velocity vs the 12-week calendar.
- Click-through from `/notation` and `/learn/*` into `/guide/level-1` and
  `/shop` (internal funnel conversion).
