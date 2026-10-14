# /notation/caps Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/notation/caps` into a single-viewport Bento hub ("what are CAPs, that's exciting") with the existing editorial history kept as scroll-down depth, and repair the broken video embeds.

**Architecture:** A new full-viewport `CapsHub.svelte` (the verified `test/caps-hero` prototype, using the real `LaunchpadTile` + `YutaCapLiveDemo`) renders first. The current editorial sections stay below it as depth; hub tiles anchor-scroll to them. Broken YouTube iframes become CSP-safe thumbnail cards. `YutaCapLiveDemo` gains a static poster (SSR + reduced-motion). One caps-domain data record is added.

**Tech Stack:** SvelteKit, Svelte 5 runes, existing `public-editorial.css` shell, `LaunchpadTile` primitive, Chrome DevTools MCP for layout verification.

**Working location:** main (per `worktree-workflow.md`). Commit scoped per `commit-only-your-own-changes.md`.

**Already shipped (not a task):** the ghost-mandala alignment fix (`YutaCapLiveDemo.svelte`, `clubTipDx = 150`) is live and verified; do not redo it.

---

## File structure

- **Create** `src/routes/(public)/notation/caps/_components/CapsHub.svelte` — full-viewport Bento hub: title block + centered live demo + six framing tiles. Owns hub layout/CSS only.
- **Create** `src/routes/(public)/notation/caps/_components/CapsVideoCard.svelte` — one CSP-safe YouTube thumbnail card (poster image + click to open, fallback on missing thumb).
- **Modify** `src/routes/(public)/notation/caps/+page.svelte` — render `<CapsHub/>` first; convert the old live-demo hero into a text "What is a CAP?" section; add `id` anchors; swap the iframe grid for `CapsVideoCard`; strip em dashes; drop the now-redundant `editorial-header`.
- **Modify** `src/routes/(public)/notation/caps/_components/YutaCapLiveDemo.svelte` — static poster (`/caps/yuta-cap.svg`) for SSR first paint and `prefers-reduced-motion` (no visible pause control; Austen's "no play/pause" stands, reduced-motion gets a still).
- **Modify** `packages/caps-domain/src/data/contributors.ts` — add a Yuta namesake record.

**On the shared-primitive question:** `LaunchpadTile` is reused in place from
`$lib/shared/landing/components/launchpad/`. It is already generic (`{tile,
active, index}`) and already under `shared/`; only `LaunchpadGrid` is
landing-specific. Moving the file out of the `landing/` path is a pure rename
with import churn and no behavior gain, so it is deferred, not done here. No
fork is created (`never-hand-roll.md` satisfied by reuse).

---

## Task 1: Build the CapsHub component

**Files:**
- Create: `src/routes/(public)/notation/caps/_components/CapsHub.svelte`

- [ ] **Step 1: Create the component** with the verified prototype composition, real component imports, anchor hrefs, and a subtle back-link.

```svelte
<!--
  CapsHub: the single-viewport Bento hero for /notation/caps. Sides-only frame,
  live CAP demo centered and square, six compact destination tiles framing it,
  height-locked to one viewport (minus the 64px SiteHeader) so the depth
  sections start below the fold. Tiles anchor-scroll to those sections; the
  "CAPs and LOOPs" tile crosses to /notation/loops. Verified at 1920/2350/3840.
  No em dashes.
-->
<script lang="ts">
  import LaunchpadTile from "$lib/shared/landing/components/launchpad/LaunchpadTile.svelte";
  import type { LaunchpadTileDef } from "$lib/shared/landing/components/launchpad/launchpad-tiles";
  import YutaCapLiveDemo from "./YutaCapLiveDemo.svelte";

  // DOM order == reading order (row by row across the demo). Left column = odd
  // entries, right column = even entries (placed in CSS).
  const TILES: LaunchpadTileDef[] = [
    { id: "what-is", href: "#what-is", heading: "What is a CAP?", descriptor: "One prop traces a closed loop built from two or more simpler patterns.", span: "1x1", color: "#38bdf8", icon: "fa-infinity" },
    { id: "breakdown", href: "#breakdown", heading: "How this CAP is built", descriptor: "Four steps, two halves.", span: "1x1", color: "#a78bfa", icon: "fa-scissors" },
    { id: "watch", href: "#watch", heading: "Watch CAPs", descriptor: "CAPs on video, 2009 to now.", span: "1x1", color: "#fbbf24", icon: "fa-circle-play" },
    { id: "relationship", href: "/notation/loops", heading: "CAPs and LOOPs", descriptor: "Parallel systems, different base units.", span: "1x1", color: "#22d3ee", icon: "fa-diagram-project" },
    { id: "math", href: "#math", heading: "Underlying math", descriptor: "Trochoids on nested circles.", span: "1x1", color: "#34d399", icon: "fa-compass-drafting" },
    { id: "origin", href: "#origin", heading: "Where it came from", descriptor: "Damien coined the term on Home of Poi in 2009.", span: "1x1", color: "#f472b6", icon: "fa-clock-rotate-left" },
  ];
</script>

<section class="caps-hub" aria-label="What are CAPs">
  <a class="hub-back" href="/notation">← Flow Arts Notation</a>

  <header class="hub-head">
    <span class="eyebrow">Continuous Assembly Patterns</span>
    <h1>CAPs</h1>
    <p>A prop-spinning path assembled from pieces of simpler patterns, looped forever.</p>
  </header>

  <div class="hub-stage">
    <div class="frame-grid sides">
      <figure class="demo-cell">
        <span class="demo-hold"><YutaCapLiveDemo /></span>
        <figcaption>The bright path is traced by one prop.</figcaption>
      </figure>
      <ul class="tiles" role="list">
        {#each TILES as tile, i (tile.id)}
          <LaunchpadTile {tile} active={true} index={i} />
        {/each}
      </ul>
    </div>
  </div>
</section>

<style>
  .caps-hub {
    --caps-chrome: 64px;
    position: relative;
    height: calc(100dvh - var(--caps-chrome));
    overflow: hidden;
    display: flex;
    flex-direction: column;
    padding: clamp(0.5rem, 1.4vh, 1.2rem) clamp(1rem, 3vw, 2.5rem);
    color: #f2f1fb;
  }

  .hub-back {
    position: absolute;
    top: clamp(0.5rem, 1.4vh, 1.2rem);
    left: clamp(1rem, 3vw, 2.5rem);
    font-size: 0.85rem;
    color: rgba(255, 255, 255, 0.7);
    text-decoration: none;
    z-index: 2;
  }
  .hub-back:hover { color: #fff; }

  .hub-head { flex: 0 0 auto; text-align: center; margin: 0 auto; padding-block: clamp(0.3rem, 1vh, 0.9rem); }
  .eyebrow { display: block; font-size: clamp(0.72rem, 0.9vw, 1.1rem); font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: #38bdf8; }
  .hub-head h1 { margin: 0.1rem 0 0.3rem; font-size: clamp(2.2rem, 3.6vw, 5.2rem); line-height: 1; font-weight: 780; letter-spacing: -0.02em; }
  .hub-head p { margin: 0 auto; max-width: 60ch; font-size: clamp(0.95rem, 1.15vw, 1.5rem); color: rgba(255, 255, 255, 0.74); }

  .hub-stage { flex: 1 1 auto; min-height: 0; container-type: size; display: grid; place-items: center; }

  /* Largest 2:1 box that fits: sized by height (200cqh), capped by width (100cqw).
     Because it is 2:1 and the demo spans the center two of four columns across all
     three rows, the demo cell is inherently square. */
  .frame-grid {
    inline-size: min(100cqw, 200cqh);
    aspect-ratio: 2 / 1;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    grid-template-rows: repeat(3, 1fr);
    gap: clamp(0.6rem, 1.1cqw, 1.4rem);
    list-style: none;
  }

  /* display:contents lifts the six <li> tiles into the band grid; role="list"
     guards Safari's contents-drops-list-semantics bug. */
  .tiles { display: contents; }

  .demo-cell {
    grid-column: 2 / 4;
    grid-row: 1 / 4;
    margin: 0;
    position: relative;
    container-type: size;
    display: grid;
    place-items: center;
    min-width: 0;
    min-height: 0;
  }
  /* Square bound on BOTH axes so it can never top-align in a too-tall wrapper. */
  .demo-hold { display: block; inline-size: min(100cqw, 100cqh); aspect-ratio: 1; }
  .demo-cell figcaption { position: absolute; left: 0; right: 0; bottom: 0.2rem; text-align: center; font-size: clamp(0.75rem, 0.85vw, 1rem); color: rgba(255, 255, 255, 0.6); pointer-events: none; }

  /* Compact side tiles, vertically centered so the bottom-anchored heading sits
     by its icon instead of under dead headroom. */
  .frame-grid :global(.tile) { align-self: center; block-size: clamp(140px, 22cqh, 260px); }
  .frame-grid.sides :global(.tile.t-what-is) { grid-column: 1; grid-row: 1; }
  .frame-grid.sides :global(.tile.t-watch) { grid-column: 1; grid-row: 2; }
  .frame-grid.sides :global(.tile.t-math) { grid-column: 1; grid-row: 3; }
  .frame-grid.sides :global(.tile.t-breakdown) { grid-column: 4; grid-row: 1; }
  .frame-grid.sides :global(.tile.t-relationship) { grid-column: 4; grid-row: 2; }
  .frame-grid.sides :global(.tile.t-origin) { grid-column: 4; grid-row: 3; }

  @media (hover: hover) and (prefers-reduced-motion: no-preference) {
    .frame-grid:has(:global(.tile:hover)) :global(.tile:not(:hover)) { opacity: 0.6; filter: saturate(0.7); }
  }

  /* Narrow: drop fit-to-viewport, stack, allow scroll. */
  @media (max-width: 1020px) {
    .caps-hub { height: auto; min-height: 100dvh; overflow: visible; }
    .hub-stage { display: block; container-type: normal; }
    .frame-grid { inline-size: 100%; aspect-ratio: auto; grid-template-columns: repeat(2, 1fr); grid-template-rows: none; grid-auto-rows: clamp(150px, 30vw, 220px); }
    .frame-grid :global(.tile) { align-self: stretch; block-size: auto; }
    .frame-grid.sides :global(.tile) { grid-column: auto !important; grid-row: auto !important; }
    .demo-cell { grid-column: 1 / 3; grid-row: auto; aspect-ratio: 1; }
  }
  @media (max-width: 560px) {
    .frame-grid { grid-template-columns: 1fr; }
    .demo-cell { grid-column: 1; }
  }
</style>
```

- [ ] **Step 2: Verify it compiles.**

Run: `npm run check:fast 2>&1 | grep -iE "CapsHub|error" | head`
Expected: no errors referencing CapsHub.

- [ ] **Step 3: Commit.**

```bash
git add src/routes/\(public\)/notation/caps/_components/CapsHub.svelte
git commit -m "feat(caps): add single-viewport Bento hub component" -- src/routes/\(public\)/notation/caps/_components/CapsHub.svelte
```

---

## Task 2: Integrate the hub, convert the old hero to a text section, add anchors

**Files:**
- Modify: `src/routes/(public)/notation/caps/+page.svelte`

- [ ] **Step 1: Import the hub.** In the `<script>` block, add after the `YutaCapLiveDemo` import (line 3):

```svelte
  import CapsHub from "./_components/CapsHub.svelte";
```

- [ ] **Step 2: Remove the redundant editorial header and render the hub first.** Replace the block at lines 108-118 (from `<div class="editorial">` through the closing `</header>`) with:

```svelte
<CapsHub />

<div class="editorial">
```

(The hub now provides the title and the back-link; the old `editorial-header` and its standalone back-link are removed.)

- [ ] **Step 3: Convert the old live-demo hero into a "What is a CAP?" text section.** Replace the hero section (old lines 120-141, the `<!-- HERO -->` section containing `<YutaCapLiveDemo />`) with:

```svelte
  <!-- WHAT IS A CAP -->
  <section id="what-is" class="editorial-section" style="--accent: #38bdf8">
    <span class="section-kicker">Start here</span>
    <h2 class="section-title">What is a CAP?</h2>
    <div class="prose">
      <p>
        A CAP is a closed pattern assembled from fragments of simpler ones. The
        demo above draws the one the whole idea grew around: half a cycle of
        extension, half a cycle of antispin, joined into a single curve that
        repeats forever. One prop traces the entire path.
      </p>
      <p class="cap-credit">
        Spinners saw this pattern in Yuta's spinning and took it apart on a
        forum. Notation and construction: Damien (posting as Zaltymbunk),
        <a href={THREAD_URL}>Home of Poi, 2009</a>.
      </p>
    </div>
  </section>
```

- [ ] **Step 4: Add anchor ids to the four remaining target sections.** Edit each `<section ...>` opening tag:
  - "Break it down" section (old line 144) → add `id="breakdown"`, and change its `<h2>` text `Four steps, two fragments` to `Four steps, two halves`.
  - "The story" section (old line 227, "Named on a forum, built at a burn") → add `id="origin"`.
  - "The original math" section (old line 266, "Damien's model, kept light") → add `id="math"`.
  - "MODERN MEDIA" section (old line 397) → add `id="watch"`.

Example for the breakdown section:

```svelte
  <section id="breakdown" class="editorial-section" style="--accent: #a78bfa">
    <span class="section-kicker">Break it down</span>
    <h2 class="section-title">Four steps, two halves</h2>
```

- [ ] **Step 5: Verify build + anchors.** Start a scratch server if none is free (`resource-budget.md`), else curl the running one:

Run: `npm run check:fast 2>&1 | grep -iE "caps|error" | head`
Expected: no errors.

- [ ] **Step 6: Browser-verify** (Chrome DevTools MCP, per `verification-protocol.md`): navigate to `https://localhost:5173/notation/caps`, confirm the hub fills the first viewport (measure `document.querySelector('.caps-hub')` height ≈ `innerHeight - 64`), then evaluate `['what-is','breakdown','watch','math','origin'].map(id=>!!document.getElementById(id))` and expect all `true`.

- [ ] **Step 7: Commit.**

```bash
git commit -m "feat(caps): render hub first, convert hero to intro section, wire anchors" -- src/routes/\(public\)/notation/caps/+page.svelte
```

---

## Task 3: Replace broken YouTube iframes with CSP-safe thumbnail cards

The `frame-src` CSP (`src/hooks.server.ts:110`) refuses `youtube-nocookie.com`, so the six iframes render broken. `img-src https:` allows `img.youtube.com`, so a thumbnail poster that opens the video works with no CSP change.

**Files:**
- Create: `src/routes/(public)/notation/caps/_components/CapsVideoCard.svelte`
- Modify: `src/routes/(public)/notation/caps/+page.svelte`

- [ ] **Step 1: Create the card.**

```svelte
<!--
  CapsVideoCard: a CSP-safe YouTube card. The site frame-src blocks YouTube
  embeds, so we show the poster thumbnail (img-src https: is allowed) with a
  play affordance; clicking opens the video on YouTube in a new tab. Falls back
  to a labelled tile if the thumbnail 404s. Thumbnail technique mirrors
  festivals/portfolio/VideosSection.svelte.
-->
<script lang="ts">
  let { id, title, creator, year, note }: {
    id: string; title: string; creator: string; year: string; note: string;
  } = $props();

  let thumbFailed = $state(false);
  const watchUrl = `https://www.youtube.com/watch?v=${id}`;
</script>

<figure class="cap-media">
  <a class="cap-media-thumb" href={watchUrl} target="_blank" rel="noopener" aria-label={`Watch on YouTube: ${title} by ${creator}`}>
    {#if !thumbFailed}
      <img
        src={`https://img.youtube.com/vi/${id}/hqdefault.jpg`}
        alt={`${title} by ${creator}`}
        loading="lazy"
        onerror={() => (thumbFailed = true)}
      />
    {:else}
      <span class="cap-media-fallback">{title}</span>
    {/if}
    <span class="cap-media-play" aria-hidden="true"><i class="fas fa-play"></i></span>
  </a>
  <figcaption>
    <strong>{title}</strong>
    <span>{creator} · {year}</span>
    <span class="cap-media-note">{note}</span>
  </figcaption>
</figure>

<style>
  .cap-media { margin: 0; }
  .cap-media-thumb {
    position: relative;
    display: block;
    aspect-ratio: 16 / 9;
    border-radius: 8px;
    overflow: hidden;
    background: color-mix(in srgb, currentColor 8%, transparent);
  }
  .cap-media-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .cap-media-fallback {
    position: absolute; inset: 0; display: grid; place-items: center;
    padding: 1rem; text-align: center; font-weight: 600; font-size: 0.95rem;
  }
  .cap-media-play {
    position: absolute; top: 50%; left: 50%; translate: -50% -50%;
    display: grid; place-items: center;
    width: 56px; height: 56px; border-radius: 999px;
    background: rgba(0, 0, 0, 0.55); color: #fff; font-size: 1.1rem;
    transition: background 0.2s ease, scale 0.2s ease;
  }
  .cap-media-thumb:hover .cap-media-play,
  .cap-media-thumb:focus-visible .cap-media-play { background: var(--accent, #ed1c24); scale: 1.06; }
  .cap-media figcaption { display: flex; flex-direction: column; gap: 0.15rem; margin-top: 0.5rem; font-size: 0.85rem; }
  .cap-media-note { opacity: 0.7; }
  @media (prefers-reduced-motion: reduce) {
    .cap-media-play { transition: none; }
  }
</style>
```

- [ ] **Step 2: Use the card in the page.** In `+page.svelte` `<script>`, add after the `CapsHub` import:

```svelte
  import CapsVideoCard from "./_components/CapsVideoCard.svelte";
```

- [ ] **Step 3: Replace the iframe loop.** In the MODERN MEDIA section, replace the `{#each MODERN_MEDIA as m (m.id)} ... {/each}` block (old lines 401-416, the `<figure class="cap-media">` with the `<iframe>`) with:

```svelte
        {#each MODERN_MEDIA as m (m.id)}
          <CapsVideoCard id={m.id} title={m.title} creator={m.creator} year={m.year} note={m.note} />
        {/each}
```

- [ ] **Step 4: Remove the now-unused iframe CSS.** Delete the `.cap-media`, `.cap-media iframe`, `.cap-media figcaption`, and `.cap-media-note` rules from the `+page.svelte` `<style>` block (old lines 589-607) — those responsibilities now live in `CapsVideoCard.svelte`.

- [ ] **Step 5: Verify no refused frames + thumbnails load.** Browser-verify at `https://localhost:5173/notation/caps`: scroll to `#watch`, then check the console has no "Refused to frame" errors and evaluate that each `.cap-media-thumb img` has `naturalWidth > 0`.

Run (console check): evaluate `[...document.querySelectorAll('.cap-media-thumb img')].map(i=>i.naturalWidth)` — expect all `> 0`.

- [ ] **Step 6: Commit.**

```bash
git add src/routes/\(public\)/notation/caps/_components/CapsVideoCard.svelte
git commit -m "fix(caps): CSP-safe YouTube thumbnail cards, drop refused iframes" -- src/routes/\(public\)/notation/caps/_components/CapsVideoCard.svelte src/routes/\(public\)/notation/caps/+page.svelte
```

---

## Task 4: Strip em dashes from retained copy

**Files:**
- Modify: `src/routes/(public)/notation/caps/+page.svelte`

- [ ] **Step 1: Replace each em dash.** The Sources list and footnotes use `—` as a separator. Rewrite each to a comma or period, preserving meaning. Exact edits:

  - Sources bullets (old lines 433-455): change every `</a> —` to `</a>,` and the following capitalized word to lowercase where it now continues a sentence. Example:
    - `<a href={THREAD_URL}>"What are CAP's?"</a> — Home of Poi forums, ca. 2009.` becomes `<a href={THREAD_URL}>"What are CAP's?"</a>, Home of Poi forums, ca. 2009.`
    - Apply the same to the Math of CAPs, C-CAPs, Learning CAPs, and Double Staff bullets.
  - Any remaining `—` in prose (search below).

- [ ] **Step 2: Grep the file for stragglers.**

Run: `grep -n "—" src/routes/\(public\)/notation/caps/+page.svelte`
Expected: no output.

- [ ] **Step 3: Commit.**

```bash
git commit -m "style(caps): remove em dashes from copy" -- src/routes/\(public\)/notation/caps/+page.svelte
```

---

## Task 5: Static poster for YutaCapLiveDemo (SSR first paint + reduced motion)

The player is client-only and the ghost canvas draws client-side, so SSR shows an empty square, and there is no reduced-motion still. Austen's "no play/pause control" stands, so the accommodation is a static poster, not a pause button.

**Files:**
- Modify: `src/routes/(public)/notation/caps/_components/YutaCapLiveDemo.svelte`

- [ ] **Step 1: Add a reduced-motion query and the poster.** In the `<script>`, add a media-query-backed state:

```svelte
  import { MediaQuery } from "svelte/reactivity";
  const reduceMotion = new MediaQuery("(prefers-reduced-motion: reduce)");
```

- [ ] **Step 2: Render the poster under the live layers, and skip the player under reduced motion.** In `.yuta-stage`, add the poster image as the bottom layer, and gate the player. Replace the `.yuta-stage` inner markup:

```svelte
  <div class="yuta-stage">
    <img class="yuta-poster" src="/caps/yuta-cap.svg" alt="The Yuta CAP: an extension arc joined to antispin petals, traced by one prop" width="500" height="500" />
    <MandalaHeroLayer paths={mandalaPaths} {clubTipDx} opacity={ghostOpacity} />
    {#if !reduceMotion.current}
      <div class="player-layer">
        <LazyMount
          loader={() =>
            import(
              "$lib/features/browse/sequences/display/components/media-viewer/InlineAnimationPlayer.svelte"
            )}
          active={true}
          props={playerProps}
        />
      </div>
    {/if}
  </div>
```

- [ ] **Step 3: Style the poster** so it fills the square and sits behind the live layers, fading out once the player is up (the ghost + trail cover it). Add to `<style>`:

```css
  .yuta-poster {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
    z-index: 0;
    pointer-events: none;
  }
```

(`.player-layer` already has `z-index` above `0` via source order; the poster is the SSR/no-JS/reduced-motion floor. Under reduced motion the player is absent, so the poster and the static ghost remain visible.)

- [ ] **Step 4: Verify.** Browser-verify at `https://localhost:5173/notation/caps`:
  - Normal: the live trail animates over the ghost (unchanged).
  - Reduced motion: DevTools > Rendering > emulate `prefers-reduced-motion: reduce`, reload, confirm `.player-layer` is absent and the poster/ghost show a static pattern (no animation).

- [ ] **Step 5: Commit.**

```bash
git commit -m "feat(caps): static poster for SSR and reduced-motion; no autoplay-only exhibit" -- src/routes/\(public\)/notation/caps/_components/YutaCapLiveDemo.svelte
```

---

## Task 6: Add a Yuta contributor record to caps-domain

The demo pattern is the famous Yuta CAP; the glossary already references it. Add Yuta as the namesake (repo knowledge, not surface copy). Keep the mononym; do not assert an unconfirmed surname.

**Files:**
- Modify: `packages/caps-domain/src/data/contributors.ts`

- [ ] **Step 1: Append the record** to the `CAP_CONTRIBUTORS` array (matching the existing `Contributor` shape: `name`, optional `aliases`, `role`, `contributions[]`, optional `activeYears`, optional `links[]`):

```ts
	{
		name: "Yuta",
		role: "Namesake of the canonical Yuta CAP",
		contributions: [
			"The spinning that prompted the Home of Poi analysis thread where Damien coined 'Continuous Assembly Patterns' (in-thread the pattern is referred to as 'the Yuta move')",
			"The famous Yuta CAP (1 0 ; 1 3/4 ; 1/2 assembled with -1 4 ; 1 3/4 ; 1/2) is named for this pattern",
			"Japanese poi artist, founder of Poi Lab; an early LED and visual-poi figure spinning since 2003",
		],
		activeYears: "2003-present",
		links: [
			{
				url: "https://www.youtube.com/watch?v=ihw6kAnUFUY",
				title: "Endangered Species (2005)",
				type: "video",
				author: "Yuta",
				year: 2005,
				accessDate: "2026-07-20",
			},
			{
				url: "https://poi-lab.com/",
				title: "Poi Lab",
				type: "website",
				author: "Yuta",
				accessDate: "2026-07-20",
			},
		],
	},
```

(`type: "video"` is a valid `ReferenceType` in `packages/flow-arts-core/src/types/reference.ts`: `"document" | "video" | "website" | "app" | "forum-post"`.)

- [ ] **Step 2: Verify the package builds.**

Run: `npm run check:fast 2>&1 | grep -iE "contributors|caps-domain|error" | head`
Expected: no errors.

- [ ] **Step 3: Commit.**

```bash
git commit -m "docs(caps-domain): add Yuta namesake contributor record" -- packages/caps-domain/src/data/contributors.ts
```

---

## Final verification (before calling the redesign done)

- [ ] **Full type check:** `npm run check > /tmp/caps-check.log 2>&1; grep -niE "error" /tmp/caps-check.log | head` — expect no errors (one cold run per `fast-iteration-loop.md`).
- [ ] **Layout at 4K:** browser-verify the hub fits one viewport with no scroll at 1920, 2350, and 3840 wide, demo square at each (`4k-native-layout.md`).
- [ ] **Videos:** `#watch` thumbnails load (all `naturalWidth > 0`), console shows no "Refused to frame" errors.
- [ ] **Anchors:** clicking each hub tile scrolls to its section; "CAPs and LOOPs" navigates to `/notation/loops`.
- [ ] **Ghost:** still sits on the trail (already verified; no regression).
- [ ] **Diff hygiene:** `git diff main --stat` then grep the diff for `type="checkbox"`, raw `class="chip"` filter buttons, and `—`; expect none.
- [ ] **Cleanup:** delete the throwaway prototype `src/routes/test/caps-hero/+page.svelte`.
```
```
