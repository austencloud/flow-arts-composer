<!--
  A guide page shown one screen at a time, the way /codex drills down: the
  page is exactly the window under the site header and never scrolls.

  Header: the page's kicker and title, then one pill per screen (they pan
  sideways inside their own row when there are more than fit). Body: the
  current screen, drawn at the zoom that fills the space (GuideFitBox).
  Footer: Back and Next, which step through the screens and then on to the
  previous or next page, with All guides between them. They are one-line
  pills sized to their words at the two edges, All guides centred
  (2026-10-31).

  A page may add a row above its title (the hand combinations' switcher)
  and draw the Back and Next names itself (in a combination's colours). A
  page may also draw its title and its list of screens inside its screens
  (`bodyHead`, the hand combinations' run, 2026-11-01): the frame's title
  then stays for screen readers only, the frame draws no pill row, and each
  screen gets the frame's `go` to switch screens from its own list. Such a
  page changes only its card and words between screens (Austen, same day:
  the title and the list must hold still), so the frame keeps its screen
  mounted instead of crossfading the whole screen, records the screen in
  the URL without a history step, and centres the screen in the body. Every
  other page keeps the plain defaults.

  Which screen shows is URL state (`?screen=2`), so a link opens on the right
  screen and the phone's Back steps back one screen.

  Before hydration the first screen stands where the live frame will draw
  it, centered in the same box, so the page does not change shape when the
  script lands. It is drawn but not shown: the server cannot know the
  window, so its figures and its screen split (the pills) would be the wrong
  size and count, and the page would jump when the live frame took over.
  The title and the Back and Next row show at once; the screen and its
  pills fade in once, at their fitted size. Without scripts the first
  paint shows as it is. The other screens follow in reading order, visually
  hidden, so the prerendered page keeps every word and pictograph label for
  search engines.

  A steady-head page (one figure at one size on every screen, its pills
  fixed) is the exception (2026-10-31, Austen: the words must not wait for
  the script): the server already knows its first screen and its pills, so
  both show at once, and the first paint stays over the live frame until
  the live frame has fitted, then fades into it. Its screens stand at the
  top of the body. A body-head page's first paint is the exception to that
  exception (2026-11-02, Austen: the run's screen showed at its designed
  size, then jumped to its fitted one as it loaded): its title, words and
  list share one group with its card, so the screen waits out of sight
  like any other page's and fades in once, fitted, under a header that
  shows at once.

  A body-head page reached by a link from another page of the same visit
  (the hand combinations' run, 2026-11-01) has no first paint to hand
  over from: it opens live on the URL's screen at once and asks the page
  transition to wait for its first fit (holdPageReady), so the route's
  crossfade runs between two finished pages. During that crossfade the
  header and the Back and Next row stand still and only the body fades
  (guide.css), so the switcher's highlight moves and nothing goes dark.
-->
<script lang="ts" module>
  // Set once the first guide frame of this visit has mounted: after that a
  // frame comes from a client-side navigation, never from the server's
  // first paint.
  let visitStarted = false;
</script>

<script lang="ts">
  import type { Snippet } from "svelte";
  import { onMount, tick } from "svelte";
  import { browser } from "$app/env";
  import { afterNavigate } from "$app/navigation";
  import { holdPageReady } from "@austencloud/motion";
  import { tileFlight } from "#lib/shared/transitions/tile-flight.svelte.js";
  import { Crossfade, opaqueFade } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import { mutateCurrentUrl } from "#lib/shared/navigation/services/url-state.js";
  import GuideFitBox from "./GuideFitBox.svelte";
  import { readScreenParam, SCREEN_PARAM } from "./guide-screen-url";
  import { revealInRow } from "./reveal-in-row";

  type PageLink = { href: string; title: string } | null;
  /** Where Back or Next leads: another screen of this page, or a page. */
  type NavTarget =
    | { kind: "screen"; index: number; text: string }
    | { kind: "page"; href: string; text: string };

  let {
    title,
    titleContent,
    titleId,
    kicker,
    subtitle,
    labels,
    prevPage = null,
    nextPage = null,
    hubHref,
    hubLabel = "All guides",
    screen,
    lead,
    steadyHead = false,
    beforeTitle,
    bodyHead = false,
    navLabel,
  }: {
    title: string;
    /** Draws the title in place of the plain `title` string (a page whose
        words can be edited in place). */
    titleContent?: Snippet;
    /** id for the title, for aria-labelledby. */
    titleId?: string;
    kicker?: string;
    /** One line under the title (the tagline). */
    subtitle?: string | null;
    labels: string[];
    prevPage?: PageLink;
    nextPage?: PageLink;
    /** The orange link back to the guide's front page; the front page
        itself has none. */
    hubHref?: string;
    hubLabel?: string;
    /** Draws one screen; `go` switches to another (a page's own list). */
    screen: Snippet<[number, (index: number) => void]>;
    /** Drawn above the first screen's content (lesson links). */
    lead?: Snippet;
    /** The header stays the same on every screen, so every screen gets the
        same room: for a page whose screens draw one figure at one size. */
    steadyHead?: boolean;
    /** A row between the kicker and the title, the same on every screen;
        `go` switches screens from it (the switcher's chips on a page that
        holds several of them). */
    beforeTitle?: Snippet<[number, (index: number) => void]>;
    /** The page draws its title and its list of screens inside each screen:
        the frame's title stays for screen readers, and no pill row. */
    bodyHead?: boolean;
    /** Draws a Back or Next name; plain text when absent. */
    navLabel?: Snippet<[NavTarget]>;
  } = $props();

  // A body-head page opened by a link within the visit starts live on the
  // URL's screen; every other start hands over from the first paint.
  const opensLinked = () => browser && visitStarted && bodyHead;
  const linkedIn = opensLinked();
  const urlScreen = () =>
    Math.min(
      readScreenParam(window.location.search),
      Math.max(0, labels.length - 1)
    );
  let live = $state(linkedIn);
  // A steady-head page's first paint stays over the live frame until the
  // live frame's first fit lands.
  let handedOver = $state(linkedIn);
  let index = $state(linkedIn ? urlScreen() : 0);
  // The route's crossfade waits for the linked page's first fit, and a homepage
  // tile opening into this page waits for it too, so the window never lands on
  // an empty frame (capped by the transition itself; released here at the latest
  // after a second).
  let releaseReady: (() => void) | null =
    linkedIn || tileFlight.kind === "open" ? holdPageReady() : null;
  function release(): void {
    releaseReady?.();
    releaseReady = null;
  }
  function ready(): void {
    handedOver = true;
    release();
  }
  // Only a steady-head page that draws its head in the frame shows its first
  // paint. Every other first paint leaves from out of sight, so its fade-out
  // never flashes it.
  const firstShows = $derived(steadyHead && !bodyHead);
  let direction = $state<1 | -1>(1);
  let pillRow = $state<HTMLElement>();
  const count = $derived(labels.length);
  const last = $derived(Math.max(0, count - 1));

  function read(): void {
    index = Math.min(readScreenParam(window.location.search), last);
  }

  /** For a screen's own list of screens. */
  const goTo = (next: number): void => void go(next);

  async function go(next: number): Promise<void> {
    if (next === index || next < 0 || next > last) return;
    direction = next > index ? 1 : -1;
    index = next;
    mutateCurrentUrl(
      (url) => {
        if (next === 0) url.searchParams.delete(SCREEN_PARAM);
        else url.searchParams.set(SCREEN_PARAM, String(next + 1));
      },
      // A page that keeps its screen mounted swaps a card, not a page:
      // no history step for each one.
      { mode: bodyHead ? "replace" : "push" }
    );
    await tick();
    showActivePill();
  }

  // The pill row pans from its first pill; it moves only as far as brings
  // the current pill into view, and snaps to a pill's edge, so no name is
  // cut at the row's start.
  function showActivePill(): void {
    const pill = pillRow?.querySelector<HTMLElement>('[aria-current="step"]');
    if (pillRow && pill) revealInRow(pillRow, pill);
    pillEdges();
  }

  // A soft fade on whichever side has more pills out of view.
  let moreLeft = $state(false);
  let moreRight = $state(false);
  function pillEdges(): void {
    if (!pillRow) return;
    const { scrollLeft, clientWidth, scrollWidth } = pillRow;
    moreLeft = scrollLeft > 2;
    moreRight = scrollLeft + clientWidth < scrollWidth - 2;
  }
  $effect(() => {
    const row = pillRow;
    if (!row) return;
    const observer = new ResizeObserver(pillEdges);
    observer.observe(row);
    return () => observer.disconnect();
  });

  function onPopState(): void {
    const before = index;
    read();
    direction = index >= before ? 1 : -1;
    void tick().then(showActivePill);
  }

  onMount(() => {
    visitStarted = true;
    const fallback = setTimeout(release, 1000);
    read();
    live = true;
    void tick().then(showActivePill);
    window.addEventListener("popstate", onPopState);
    return () => {
      clearTimeout(fallback);
      release();
      window.removeEventListener("popstate", onPopState);
    };
  });

  // A link to another screen of this page (`?screen=12`) is a client-side
  // navigation, not a history step: read the URL again after it.
  afterNavigate(() => {
    if (live) onPopState();
  });

  // The split can change after mount (a phone gives long text its own
  // screen): reread the URL against the new count.
  $effect(() => {
    void count;
    if (live) read();
  });

  const prevTarget = $derived<NavTarget | null>(
    index > 0
      ? { kind: "screen", index: index - 1, text: labels[index - 1] ?? "" }
      : prevPage
        ? { kind: "page", href: prevPage.href, text: prevPage.title }
        : null
  );
  const nextTarget = $derived<NavTarget | null>(
    index < last
      ? { kind: "screen", index: index + 1, text: labels[index + 1] ?? "" }
      : nextPage
        ? { kind: "page", href: nextPage.href, text: nextPage.title }
        : null
  );
</script>

{#snippet stepName(target: NavTarget)}
  <span class="step-title"
    >{#if navLabel}{@render navLabel(target)}{:else}{target.text.replaceAll(
        "-",
        "\u2011"
      )}{/if}</span
  >
{/snippet}

<div
  class="guide-screens"
  data-sideways-owns-chrome
  class:live
  class:steady={steadyHead}
  class:body-head={bodyHead}
  class:later={live && index > 0 && !steadyHead}
>
  <header class="head">
    <div class="titles">
      {#if kicker}<p class="kicker">{kicker}</p>{/if}
      {#if beforeTitle}<div class="before-title">
          {@render beforeTitle(index, goTo)}
        </div>{/if}
      <h1 class="title" class:unseen={bodyHead} id={titleId}>{#if titleContent}{@render titleContent()}{:else}{title}{/if}</h1>
      {#if subtitle}<p class="subtitle">{subtitle}</p>{/if}
    </div>
    {#if count > 1 && !bodyHead}
      <nav
        class="pills"
        class:more-left={moreLeft}
        class:more-right={moreRight}
        aria-label="Parts of this page"
        bind:this={pillRow}
        onscroll={pillEdges}
      >
        {#each labels as label, n (n)}
          <button
            type="button"
            class="pill"
            aria-current={n === index ? "step" : undefined}
            onclick={() => go(n)}
          >
            <span class="pill-n">{n + 1}</span>{label}
          </button>
        {/each}
      </nav>
    {/if}
  </header>

  <div class="body">
    {#if live && bodyHead}
      <!-- The page's screen stays mounted; it crossfades its own card and
           words, and its title and list hold still. -->
      <GuideFitBox onready={ready}>
        {@render screen(index, goTo)}
      </GuideFitBox>
    {:else if live}
      <Crossfade
        key={index}
        duration={DURATION.normal}
        mode="swap"
        motion="step"
        {direction}
        fill
        label={labels[index]}
      >
        <GuideFitBox contentKey={index} top={steadyHead} onready={ready}>
          {#if index === 0 && lead}<div class="lead">{@render lead()}</div>{/if}
          {@render screen(index, goTo)}
        </GuideFitBox>
      </Crossfade>
    {/if}
    {#if !live || (steadyHead && !handedOver && index === 0)}
      <!-- Prerender and first paint: screen 1 in the live frame's place;
           the rest stay in the page for search engines, out of sight. A
           steady-head page's first paint shows, and stays over the live
           frame until that has fitted. -->
      {#if !live}
        <noscript>
          <style>
            .guide-screens .first,
            .guide-screens .pills {
              opacity: 1 !important;
            }
          </style>
        </noscript>
      {/if}
      <div
        class="first"
        class:over={live}
        aria-hidden={live ? "true" : undefined}
        out:opaqueFade={{ opacity: firstShows ? 1 : 0 }}
      >
        <div class="first-content">
          {#if lead}<div class="lead">{@render lead()}</div>{/if}
          {@render screen(0, goTo)}
        </div>
      </div>
      {#if !live && count > 1}
        <div class="rest">
          {#each labels.slice(1) as _, n (n)}{@render screen(
              n + 1,
              goTo
            )}{/each}
        </div>
      {/if}
    {/if}
  </div>

  <nav class="controls" aria-label="Guide navigation">
    <!-- One line each: the chevron says which way, the name says where. -->
    {#if prevTarget?.kind === "screen"}
      <button
        type="button"
        class="step prev"
        aria-label="Back: {prevTarget.text}"
        onclick={() => go(index - 1)}
      >
        <i class="fa-solid fa-chevron-left" aria-hidden="true"></i>
        {@render stepName(prevTarget)}
      </button>
    {:else if prevTarget}
      <a
        class="step prev"
        href={prevTarget.href}
        aria-label="Previous page: {prevTarget.text}"
      >
        <i class="fa-solid fa-chevron-left" aria-hidden="true"></i>
        {@render stepName(prevTarget)}
      </a>
    {:else}
      <span class="step-spacer"></span>
    {/if}
    {#if hubHref}<a class="hub" href={hubHref}>{hubLabel}</a>{:else}<span
        class="step-spacer"
      ></span>{/if}
    {#if nextTarget?.kind === "screen"}
      <button
        type="button"
        class="step next"
        aria-label="Next: {nextTarget.text}"
        onclick={() => go(index + 1)}
      >
        {@render stepName(nextTarget)}
        <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
      </button>
    {:else if nextTarget}
      <a
        class="step next"
        href={nextTarget.href}
        aria-label="Next page: {nextTarget.text}"
      >
        {@render stepName(nextTarget)}
        <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
      </a>
    {:else}
      <span class="step-spacer"></span>
    {/if}
  </nav>
</div>

<style>
  /* One screen at a time: the guide layout is the window, the guide column
     drops its padding, and the site footer steps out (the Codex does the
     same). */
  :global(.guide-layout:has(.guide-screens)) {
    min-height: 0;
    height: 100dvh;
    overflow: hidden;
  }
  :global(.guide-content:has(.guide-screens)) {
    padding-top: 0;
    padding-bottom: 0;
  }
  :global(.mkt-layer:has(.guide-screens) > .site-footer) {
    display: none;
  }

  /* The whole window under the site header, and nothing more. */
  .guide-screens {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    /* One column the window's width: the pill row's unbroken line must not
       widen the frame past the screen. */
    grid-template-columns: minmax(0, 1fr);
    height: calc(100dvh - var(--marketing-header-h, 64px));
    min-height: 0;
    overflow: hidden;
    box-sizing: border-box;
    color: var(--ink, #1a1a1a);
  }

  .head {
    display: grid;
    gap: clamp(0.35rem, 1vh, 0.9rem);
    min-width: 0;
    padding: clamp(0.5rem, 1.4vh, 1.5rem) clamp(0.75rem, 2vw, 3rem) 0;
    text-align: center;
  }
  .titles {
    display: grid;
    justify-items: center;
    min-width: 0;
  }
  /* The guide content grid places h1s in its "full" column; here the
     title is one row of its own small grid. */
  .titles > * {
    grid-column: 1;
  }
  .kicker {
    margin: 0;
    font-family: Inter, system-ui, sans-serif;
    font-size: 0.75rem;
    font-weight: 650;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ink-dim, #555);
  }
  /* The guide's calligraphic title: compact on a short phone, a full title
     once the window has height to spare, capped like the Codex header. */
  .title {
    margin: 0;
    padding: 0;
    max-width: 100%;
    font-family: var(--guide-script, "Cormorant Garamond", Georgia, serif);
    font-weight: var(--guide-script-weight, 700);
    font-size: clamp(1.7rem, 0.6rem + 3.6vh, 3.75rem);
    line-height: 1.05;
    letter-spacing: 0;
    text-wrap: balance;
    color: var(--ink, #1a1a1a);
  }
  /* A page that draws its title in its screens keeps this one for screen
     readers and search only. */
  .title.unseen {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  .subtitle {
    margin: 0.15rem 0 0;
    max-width: 60ch;
    font-family: "Cormorant Garamond", Georgia, serif;
    font-size: clamp(1rem, 0.75rem + 0.8vh, 1.4rem);
    font-style: italic;
    line-height: 1.3;
    color: var(--ink-dim, #555);
    text-wrap: balance;
  }

  /* One pill per screen. They centre when they fit and pan sideways inside
     this row when they do not; the page never scrolls sideways. */
  .pills {
    display: flex;
    gap: 0.4rem;
    min-width: 0;
    padding: 0.15rem 0.25rem 0.35rem;
    overflow-x: auto;
    overscroll-behavior-x: contain;
    scrollbar-width: none;
    justify-content: safe center;
    scroll-snap-type: x proximity;
    scroll-padding-inline: 0.25rem;
  }
  /* More pills out of view fade at that edge, so a cut pill reads as
     "more this way". */
  .pills.more-right {
    mask-image: linear-gradient(
      to right,
      #000 calc(100% - 2.5rem),
      transparent
    );
  }
  .pills.more-left {
    mask-image: linear-gradient(to left, #000 calc(100% - 2.5rem), transparent);
  }
  .pills.more-left.more-right {
    mask-image: linear-gradient(
      to right,
      transparent,
      #000 2.5rem,
      #000 calc(100% - 2.5rem),
      transparent
    );
  }
  /* The server's pill count is a guess at the window's screen split; the
     row keeps its height and shows once the page is live. */
  .guide-screens:not(.live) .pills {
    opacity: 0;
  }
  .guide-screens.live .pills {
    transition: opacity var(--duration-fast) var(--ease-standard);
  }
  .pills::-webkit-scrollbar {
    display: none;
  }
  .pill {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 0.45em;
    min-height: 44px;
    padding: 0.35em 1em 0.35em 0.45em;
    border: 1px solid color-mix(in oklab, var(--ink, #1a1a1a) 22%, transparent);
    border-radius: 999px;
    background: color-mix(in oklab, var(--ink, #1a1a1a) 4%, transparent);
    color: var(--ink, #1a1a1a);
    font-family: Inter, system-ui, sans-serif;
    font-size: 0.9rem;
    font-weight: 600;
    white-space: nowrap;
    cursor: pointer;
    scroll-snap-align: start;
    transition:
      background var(--duration-fast) var(--ease-standard),
      border-color var(--duration-fast) var(--ease-standard);
  }
  .pill:hover {
    background: color-mix(in oklab, var(--ink, #1a1a1a) 10%, transparent);
  }
  .pill[aria-current="step"] {
    background: #e8590c;
    border-color: transparent;
    color: #fff;
  }
  .before-title {
    width: 100%;
    min-width: 0;
    margin: 0.35rem 0 0.15rem;
  }
  .pill-n {
    display: inline-grid;
    place-items: center;
    min-width: 1.7em;
    height: 1.7em;
    border-radius: 999px;
    background: color-mix(in oklab, currentColor 14%, transparent);
    font-size: 0.85em;
    font-variant-numeric: tabular-nums;
  }

  .body {
    position: relative;
    min-height: 0;
    min-width: 0;
    padding: clamp(0.25rem, 1vh, 1rem) clamp(0.5rem, 2vw, 3rem);
    overflow: hidden;
  }
  /* The first paint's frame: GuideFitBox's box at the figures' designed
     size (--fit 1), so the live frame takes over in place. */
  .first {
    display: grid;
    align-content: safe center;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    /* Not shown: GuideFitBox fades the screen in at its fitted size. */
    opacity: 0;
  }
  /* A steady-head page's first screen shows before the script, at the top
     of the body like its live screens. */
  .steady .first {
    align-content: start;
    opacity: 1;
  }
  /* A page that keeps its screen mounted stands it centred in the body,
     and its first paint stays out of sight: its words, list and card share
     one group whose size only the live fit knows. */
  .steady.body-head .first {
    align-content: safe center;
    opacity: 0;
  }
  /* Once live, the first paint stays over the live frame (which is still
     fitting out of sight) until that has fitted. */
  .first.over {
    position: absolute;
    inset: 0;
    box-sizing: border-box;
    padding: inherit;
    pointer-events: none;
  }
  .first-content {
    width: 100%;
    min-width: 0;
    container-type: inline-size;
  }
  .rest {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  .lead {
    display: flex;
    justify-content: center;
    margin-bottom: 0.5rem;
  }

  /* Back at the left edge, Next at the right, All guides centred between
     them whatever the lengths of the two names. */
  .controls {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: center;
    gap: 0.6rem;
    padding: clamp(0.4rem, 1vh, 1rem) clamp(0.75rem, 2vw, 3rem)
      max(clamp(0.5rem, 1.2vh, 1.25rem), env(safe-area-inset-bottom));
    border-top: 1px solid
      color-mix(in oklab, var(--ink, #1a1a1a) 12%, transparent);
    font-family: Inter, system-ui, sans-serif;
    font-size: 0.95rem;
  }
  .step {
    justify-self: start;
    max-width: 100%;
    min-width: 0;
    display: inline-flex;
    align-items: center;
    gap: 0.5em;
    box-sizing: border-box;
    min-height: 44px;
    padding: 0.35em 1.1em;
    border: 1px solid color-mix(in oklab, var(--ink, #1a1a1a) 25%, transparent);
    border-radius: 999px;
    background: transparent;
    color: var(--ink, #1a1a1a);
    font: inherit;
    text-align: left;
    text-decoration: none;
    cursor: pointer;
    transition: background var(--duration-fast) var(--ease-standard);
  }
  .step:hover {
    background: color-mix(in oklab, var(--ink, #1a1a1a) 8%, transparent);
  }
  .step.next {
    justify-self: end;
  }
  .step i {
    flex: none;
    font-size: 0.8em;
    color: var(--ink-dim, #555);
  }
  /* A name that does not fit keeps its first words whole: it wraps, and
     only its first line shows. */
  .step-title {
    display: block;
    min-width: 0;
    height: 1.3em;
    overflow: hidden;
    font-weight: 650;
    line-height: 1.3;
    text-overflow: ellipsis;
    overflow-wrap: normal;
  }
  .hub {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    padding: 0.4em 1.1em;
    border-radius: 999px;
    background: #e8590c;
    color: #fff;
    font-weight: 650;
    text-decoration: none;
    transition: background var(--duration-fast) var(--ease-standard);
  }
  .hub:hover {
    background: #d24e08;
  }
  .step-spacer {
    min-width: 0;
  }

  /* The floating Contents pill sits over the top-left of the frame on
     phones, tablets and touch screens (GuideShell, same query). The pill
     row shares its line, starting just past it, and the title follows, so
     the header costs one row less than stacking under the pill. */
  @media (max-width: 1023.98px), not ((hover: hover) and (pointer: fine)) {
    .head {
      padding-top: 1rem;
    }
    /* One screen, no pill row: the title clears the Contents pill. */
    .head:not(:has(.pills)) {
      padding-top: calc(44px + 1.5rem);
    }
    .pills {
      order: -1;
      margin-left: 10rem;
      min-height: 44px;
      justify-content: flex-start;
    }
    .kicker {
      display: none;
    }
    /* A page that draws its own title (the hand combinations' run): its
       switcher row shares the Contents pill's line, as the screen pills
       do, and the title comes with the screen. A row of its own cost the
       Fold's inner screen and a phone the 50 px their card needed
       (2026-11-03). */
    .body-head .head {
      padding-top: 1rem;
      gap: 0.3rem;
    }
    .body-head .before-title {
      width: auto;
      justify-self: stretch;
      margin: 0 0 0 10rem;
    }
  }
  /* A short window (a phone, the Fold inner screen in landscape) spends its
     height on the screen itself: no kicker or tagline line. */
  @media (max-height: 700px) {
    .kicker,
    .subtitle {
      display: none;
    }
  }
  /* Below a large window, past the first screen: the kicker and tagline
     were read on screen 1, so their lines go to the figure. */
  @media (max-width: 1279.98px), (max-height: 800px) {
    .later .kicker,
    .later .subtitle {
      display: none;
    }
  }
  /* A phone, or a narrow portrait window (the Fold's inner screen held
     upright), past the first screen: the active pill names the screen and
     the title has been read, so the title steps aside for the figure. It
     stays in the page for screen readers and search. The queries are
     SMALL_SCREEN_QUERY and NARROW_PORTRAIT_QUERY in guide-screen-url.ts,
     the windows the screen split already treats as small. */
  @media (max-width: 639.98px),
    (max-height: 640px),
    (max-width: 959.98px) and (orientation: portrait) {
    .later .title {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  }
  /* A phone: the footer's three pills tighten, All guides most, so Back and
     Next keep room for a whole name. */
  @media (max-width: 520px) {
    .controls {
      /* Back and Next may take more than their half when a name needs it,
         All guides moving off centre rather than a name being cut. */
      grid-template-columns: minmax(min-content, 1fr) auto minmax(
          min-content,
          1fr
        );
      gap: 0.35rem;
      font-size: 0.875rem;
      padding-inline: 0.6rem;
    }
    .step {
      gap: 0.4em;
      padding-inline: 0.75em;
    }
    .hub {
      padding-inline: 0.7em;
    }
    /* Back and Next take a second line rather than lose a word
       ("Staff Placements", "Break it down"). */
    .step-title {
      display: -webkit-box;
      height: auto;
      max-height: 2.4em;
      line-height: 1.2;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      line-clamp: 2;
    }
    .pills {
      justify-content: flex-start;
    }
  }

  /* A phone held sideways (the Fold's cover on its side, about 340px tall
     with the browser bar). The site header steps aside
     (data-sideways-owns-chrome, MarketingChrome) and one 44px row holds
     everything: the Contents button (GuideShell, fixed at its left), the
     title, the screen pills, then Back, All guides and Next at the right as
     compact buttons that keep their names for screen readers. There is no
     bottom bar; the screen gets the whole height under the row. */
  @media (max-height: 480px) and (min-width: 700px) {
    :global(.guide-layout:has(.guide-screens)) {
      padding-top: 0;
    }
    .guide-screens {
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-rows: 44px minmax(0, 1fr);
      grid-template-areas:
        "head controls"
        "body body";
    }
    .head,
    .head:not(:has(.pills)),
    .body-head .head {
      grid-area: head;
      display: flex;
      align-items: center;
      gap: 0.6rem;
      min-width: 0;
      /* Clears the fixed Contents button. */
      padding: 0 0 0 calc(0.5rem + 40px + 0.6rem);
      text-align: start;
    }
    .titles {
      flex: 0 1 auto;
      justify-items: start;
    }
    .title {
      max-width: 22rem;
      font-size: 1.35rem;
      line-height: 1.2;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    /* A page that draws its own title: its switcher takes the title's
       place in the row. */
    .before-title,
    .body-head .before-title {
      margin: 0;
    }
    .pills {
      order: 0;
      flex: 1 1 auto;
      align-items: center;
      margin-left: 0;
      min-height: 0;
      padding: 0;
    }
    .pill {
      min-height: 36px;
      font-size: 0.85rem;
    }
    .body {
      grid-area: body;
      padding-block: 0.25rem 0.4rem;
    }
    .controls {
      grid-area: controls;
      display: flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0 0.6rem 0 0.6rem;
      border-top: none;
      font-size: 0.85rem;
    }
    .step,
    .step.next {
      justify-content: center;
      width: 36px;
      min-height: 36px;
      padding: 0;
    }
    .step-title,
    .step-spacer {
      display: none;
    }
    .hub {
      min-height: 36px;
      padding: 0 0.9em;
    }
  }
</style>
