# Public Pages Audit — Styling, Message, Navigation, Visual Balance

**Date:** 2026-07-16
**Scope:** every public-facing page — landing, /about, /roots, /notation, /composer, /glossary, /learn/staff-spinning-choreography, /guide tree, /shop tree, /support, /terms, /privacy, /delete-account, plus nav (SiteHeader, LandingFooter, MarketingChrome).
**Method:** 5 parallel code-reading agents over every page + component, plus a live browser pass at 1600×900. All file:line claims verified in source.

---

## Verdict in one paragraph

The site is one product wearing five different outfits, telling the same three stories on repeat, with its best content unreachable. `/composer` proves the winning formula — prose alternating with live demos — and no other page uses it. Three pages have literally zero visuals. The guide is three unrelated design systems under one URL. The nav's footer doesn't match its header, two dev tools ship in the public route tree, and 34 SEO-indexed guide pages have no human click-path. None of this is hard to fix; almost all of it is reuse, not new construction.

---

## 1. Navigation & information architecture

### 1.1 Header vs footer mismatch

- Header nav (`SiteHeader.svelte:127-135`): Notation, Composer, Roots, Guide, About, Shop, Support + "Open Flow Arts Composer" → `/create`.
- Footer (`LandingFooter.svelte:34-41`): About, Notation, Roots, "Flow Arts Composer" → `/composer`, Shop, Sign in → `/create?sheet=auth`, Terms, Privacy.
- Footer is **missing Guide and Support**; header is missing Terms/Privacy (fine — legal belongs in the footer, but Guide/Support absence is not fine).
- Sign-in mechanism differs: header opens a modal in place; footer navigates to `/create?sheet=auth`.

### 1.2 The Composer/create label collision

"Composer" (nav) → `/composer` (marketing page). "Open Flow Arts Composer" (CTA) → `/create` (the app). "Flow Arts Composer" (footer) → `/composer`. Three near-identical labels, two destinations. A user cannot predict which they'll get. Recommendation: nav item and footer link should be visibly _about_ the app (e.g. "Why Composer" or keep "Composer" but make every _open the app_ CTA start with a verb), or collapse `/composer` content into the funnel more deliberately.

### 1.3 Orphaned and near-orphaned pages

| Page                                 | Status                                                                                                                                                                                                                                               |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/render`                            | Dev tool in the public tree. Zero inbound links. Remove or move under a dev route.                                                                                                                                                                   |
| `/about/compare`                     | Copy A/B dev tool, noindexed but publicly routable, ~360 lines of its own design system. Zero inbound links. Remove from the public tree (the source doc `docs/archive/swarm-2026-10-14/about-page-three-versions.md` already preserves the drafts). |
| `/learn/staff-spinning-choreography` | Sitemap priority 0.8 "pillar page" with **zero internal links to it**. Search-engine-only entry. Needs links from /guide, /notation, and/or nav.                                                                                                     |
| 34 × `/guide/level-1/[slug]`         | All prerendered + sitemapped, **no human click-path** (hub deliberately doesn't link them — owned by the guide-rewrite workstream, but the end state must close this).                                                                               |
| `/glossary`                          | Linked once from /notation body copy. No header/footer entry, no marketing chrome.                                                                                                                                                                   |
| `/delete-account`                    | Reachable only via footer → /privacy → link. Play-Store-mandated page; fine to keep obscure, but it should carry site chrome (see 1.4).                                                                                                              |
| `/store/*`                           | Redirect-only compat shim. Correct as-is.                                                                                                                                                                                                            |

### 1.4 Chrome coverage holes (`+layout.svelte:99-105`)

`MARKETING_EXACT`/`MARKETING_SUBTREES` give SiteHeader + cosmic background to `/`, /about, /roots, /support, /guide (hub only), /notation, /composer, /shop/\*. **Not covered:** /glossary, /learn/staff-spinning-choreography (both real content pages that read like the marketing site but land with no header — confirmed in browser: /glossary opens with only a "← Flow Arts Notation" back-pill), /terms, /privacy, /delete-account (three separately hand-rolled dark pages, no nav out except "Back"), guide sub-levels (intentional). A visitor landing on /delete-account from the Play Store has no path into the site.

### 1.5 Guide namespace confusion

Hero quicklink → `/guide`; GuidesSection cards → `/guides/level-1.pdf` (different namespace, PDF download); footer links to neither. One concept, three behaviors.

---

## 2. Styling consistency

### 2.1 Landing page has no shared section primitive

Every section reimplements heading/container/padding in its own `<style>` block:

| Section     | h2 size                      | h2 weight | container | padding  |
| ----------- | ---------------------------- | --------- | --------- | -------- |
| HowTkaWorks | **none — no heading at all** | —         | 1400px    | 80px     |
| PlayWithIt  | 2–3rem                       | 400       | 1600px    | 80px     |
| Guides      | 1.6–2.2rem                   | 500       | 1200px    | 96px     |
| ShopCta     | 1.6–2.2rem                   | 500       | 1200px    | 96px     |
| FAQ         | 2–3rem                       | **700**   | **760px** | 80–120px |

- **FAQ heading renders in the wrong font family**: `FaqAccordion.svelte` section-variant h2 declares no `font-family`, so it inherits `system-ui` instead of `--landing-heading-font` (Playfair, set at `+page.svelte:218`). Every other section heading is serif; the FAQ's is bold sans. The single most visible drift on the page.
- Hero h1 uses **Fraunces**; every other heading uses **Playfair Display**. Two display serifs on one page.
- Card radius/background drift: 16px/0.04 (HowTkaWorks, Guides) vs 12px/0.03 (FAQ).
- Fix: one `LandingSection` wrapper (h2 + subtitle + container + padding) or at minimum shared CSS custom properties for the five values above.

### 2.2 The guide is three design systems

1. Hub: cosmic background + Playfair (marketing language).
2. Level-1 `[slug]`: light warm book page, Cormorant Garamond + Tangerine.
3. Level-2: the **retired** dark-OKLCH/Inter scroller Level-1 abandoned (`level-2/_styles/guide.css` literally `@import`s Level-1's legacy stylesheet).

Plus a live contrast bug: `level-2/+page.svelte:63-107` hardcodes light-mode colors (`#666`, `#888`, `#e5e5e5` borders) on the layout's near-black background. And `level-2/+layout.svelte:21` loads a Playfair Google Font that nothing uses.

### 2.3 The shop is four templates

1. StorePage tiles (24px-radius glass).
2. /shop/choreography-cards — the only shop page on `public-editorial.css`.
3. The "config-page" family (loop-deck, architect, starter-pack, tnd-trilogy) — internally consistent **but the CSS is copy-pasted per file** (`.buy-rail`, `.eyebrow`, `.assurance` duplicated 3-4×), already drifting (preview-box height clamps: 340-600 / 400-480 / 320-430).
4. ProductDetailPage — its own fifth thing (flat 1.75rem h1, unique two-column grid).

Also: three h1 systems across seven shop pages; price shown as `$30` on some pages and `$30.00` on others; JSON-LD present on some funnel pages, absent on StorePage/starter-pack/architect.

### 2.4 Legal pages: same design, built three times

/terms, /privacy, /delete-account each contain an independent full copy of near-identical navy-gradient card CSS (~150-530 lines each), no shared component, no site chrome. One `LegalPageShell` would replace all three.

---

## 3. Message & cohesion

### 3.1 The same three stories, told with no canon

- **"It started on paper"** origin story: told on /notation ("It Started on Paper"), /composer ("Built on The Kinetic Alphabet"), /learn/staff-spinning-choreography ("Why Staves"). No cross-links.
- **"Built on VTG"**: told on /roots, /notation, /learn/staff-spinning-choreography. /roots — the page whose whole job this is — is not linked from either of the others.
- **Alpha/beta/gamma explainer**: /about (prose only), /notation (with PositionTrioGrid), /glossary (prose only). /about's "How It Works" is a near-duplicate of /notation's "What It Is".
- /about's live copy is byte-identical to the "Fire Jam" tab of the orphaned /about/compare dev page.

Recommendation: each story gets ONE home (origin → /roots or /notation; VTG lineage → /roots; positions → /notation + glossary anchors), and the other pages get one sentence + a link. Right now /about and /notation compete for the same job; sharpen /about = why/who/vision, /notation = what/how.

### 3.2 Landing narrative

- HowTkaWorksSection — the page's core explainer — has **no heading or intro sentence**. After the hero, the user hits unlabeled cards.
- HowTkaWorks card 6 ("Watch it move") is immediately followed by PlayWithIt (also "watch it move") — two consecutive spin-animation climaxes with no differentiating copy.
- ShopCta body says "Coming soon. Join the waitlist." but the button says "Visit the shop" — and /shop currently shows non-admins the ComingSoon page, so the button under-delivers twice.
- No repeat app CTA after PlayWithIt or Guides — interest peaks with no ask until the footer.
- FAQ answers foundational questions ("What is TKA?", "Is it free?") at the very bottom, after the shop pitch.

### 3.3 Dead weight

~2,600 lines of dead landing components (19 files: old HeroSection, FeaturesSection, HearthSection, LOOPsSection, NotationSection(s), VideoShowcase, EducatorsSection, etc.) + all of `landing-content.ts` (143 lines, every export consumed only by dead components). `HowTkaAnimationCard` is LIVE — don't sweep it. Candidates for deletion or a deliberate archive.

---

## 4. Text-only pages & missed visual opportunities (the big one)

Visual asset count per page, today:

| Page                                  | Words (approx) | Visuals                                          | Verdict                                         |
| ------------------------------------- | -------------- | ------------------------------------------------ | ----------------------------------------------- |
| /composer                             | ~750           | **6 live interactive demos**                     | The model to copy                               |
| /notation                             | ~460           | 1 (PositionTrioGrid)                             | Front-loaded; 4 sections of straight text after |
| /about                                | ~850–900       | **0**                                            | Wall of text                                    |
| /roots                                | ~450–500       | **0**                                            | Wall of text                                    |
| /glossary                             | ~3,500–4,000   | **0**                                            | Largest text mass on the site                   |
| /learn/staff-spinning-choreography    | ~505           | **0**                                            | Wall of text                                    |
| /guide/level-2 (turns + double-turns) | 63 paragraphs  | **0** — plus **39 `TODO: add diagram` comments** | Describes visual motion entirely in prose       |
| /shop (all 7 pages)                   | light          | renders only — **0 photographs**                 | Story/imagery gap (see below)                   |

Per-page highest-value additions (mostly reuse, not new builds):

1. **/about** — drop `PositionTrioGrid` into "How It Works" (the exact component /notation uses for the near-identical paragraph). Zero new assets. Add an `InlineAnimationPlayer` moment for "The Vision"/"Why This Matters".
2. **/notation** — "How I Show People" narrates a live phone demo in prose ("boop, boop, boop… it's animated"); embed the demo it describes — `ComposerHeroDemo`/`InlineAnimationPlayer` already exist. Two acknowledged empty image slots (`+page.svelte:137-139` archival hand-drawn pages) await Austen's photos.
3. **/roots** — the most diagram-friendly page on the site has zero diagrams: a three-source lineage graphic (VTG + Siteswap + music theory → TKA) for "The Synthesis"; a same-vs-opposite-direction mini-pictograph pair for the VTG vocabulary list; one example siteswap string ("531") rendered visually.
4. **/glossary** — Positions/Letter Types/Motions categories define inherently visual terms in words only, while position PNGs and live pictograph rendering already exist. Inline thumbnails next to those categories' terms would transform the page. (Also: the "Related:" links render with no spacing after commas — confirmed in browser.)
5. **/learn/staff-spinning-choreography** — tells a first-timer to practice "an isolation" and "a four-petal antispin" with no video or gif. A beginner cannot execute unnamed techniques from text. Highest-value single missing visual on the site. Also has an acknowledged empty image slot (`+page.svelte:85-86`).
6. **Guide Level-2** — 39 diagram placeholders across `_sections/ch20`/`ch21`. Level-1's live-pictograph machinery (`GuidePictograph`, `pictographGroup`, `SequenceShowcase`) already exists and is proven across 34 topics; Level-2 never adopted it.
7. **Shop** — zero photographs of the physical product anywhere, while the copy leans hard on "printed, guillotine-cut, and packed in Chicago by hand" (StorePage:373-378 and 3 more pages). One photo session (deck in hand, box open, cutting table) closes the story/imagery gap. The only place a card _animates_ is buried 3 clicks deep (Architect → slice → lightbox) despite StorePage promising "Watch it move"; surface `InlineAnimationPlayer` on the LOOP/T&D listing pages. `SleeveArt.svelte` is a self-labeled CSS placeholder awaiting a real holder photo. `SampleCardCarousel` on ProductDetailPage is fully built but no product populates `previewImageUrls` — dead slot.

---

## Status update — 2026-07-16 fix pass

Everything in §5 plus nav parity, chrome coverage, the legal shell, shop CSS dedup,
and the reuse-first visual infusion shipped the same day (agent fleet + Fable copy).
Items that remain open, needing either Austen's assets or their own project:

- Shop photography session; archival paper photos (2 slots); /learn technique clips.
- Guide Level-2's 39 diagram TODOs (needs Level-1 pictograph machinery adoption — its own workstream).
- Message canonicalization was done as cross-links only; the repeated tellings were
  kept (Austen's voice) with links to the canonical page added instead of trims.
- Discovered + fixed during the pass: domains.ts and app.html boot lists disagreed —
  /learn/staff-spinning-choreography booted landing-lite but sat behind the app
  splash for the 15s safety timeout; /composer, /glossary, /guide booted the full
  Firebase app stack behind prerendered marketing pages. Both lists harmonized.

## 5. Concrete defect list (small, shippable)

1. `FaqAccordion.svelte` section-variant h2: add `font-family: var(--landing-heading-font, ...)`.
2. `level-2/+page.svelte:63-107`: light-mode colors on dark background (low contrast).
3. `level-2/+layout.svelte:21`: unused Playfair font load.
4. ShopCtaSection: reconcile "join the waitlist" copy with "Visit the shop" CTA (and with the admin-gated /shop reality).
5. HowTkaWorksSection: add an h2 + one-line intro.
6. Glossary "Related:" term links: missing separator spacing.
7. Footer: add Guide + Support; align "Flow Arts Composer" link destination with header behavior.
8. /composer hero demo rendered as an empty box at screenshot time (1600×900, cold load) — verify the lazy-mount isn't racing; caption claimed "animating live" over a blank panel.
9. Remove /render and /about/compare from the public tree.
10. Dead landing components + landing-content.ts: delete or archive (~2,750 lines).

---

## 6. Recommended sequence

1. **Bugs & nav (a day):** items in §5, footer parity, chrome for /glossary + /learn pillar.
2. **Landing section primitive:** shared heading/container/rhythm; HowTkaWorks heading; CTA after PlayWithIt.
3. **Visual infusion, reuse-first:** PositionTrioGrid → /about; InlineAnimationPlayer → /notation + shop listings; glossary thumbnails. (No new asset production required.)
4. **New assets, one batch:** shop photography session; archival paper photos (two slots already waiting); 2-3 technique clips for /learn.
5. **Structural:** legal-page shell; shop config-page CSS dedup; Level-2 adopts Level-1 pictograph machinery (39 TODOs); message canonicalization across /about, /notation, /roots.

Items already owned by other workstreams (guide Level-1 linking/rewrite) are flagged, not planned here.
