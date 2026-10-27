<!--
  A guide page shown one screen at a time, the way /codex drills down: the
  page is exactly the window under the site header and never scrolls.

  Header: the page's kicker and title, then one pill per screen (they pan
  sideways inside their own row when there are more than fit). Body: the
  current screen, drawn at the zoom that fills the space (GuideFitBox).
  Footer: Back and Next, which step through the screens and then on to the
  previous or next page, with All guides between them.

  Which screen shows is URL state (`?screen=2`), so a link opens on the right
  screen and the phone's Back steps back one screen.

  Before hydration the first screen stands where the live frame will draw
  it, centered in the same box, so the page does not change shape when the
  script lands (only the figures grow to their fitted size). The other
  screens follow in reading order, visually hidden, so the prerendered page
  keeps every word and pictograph label for search engines.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import { onMount, tick } from "svelte";
  import { afterNavigate } from "$app/navigation";
  import { Crossfade } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import { mutateCurrentUrl } from "#lib/shared/navigation/services/url-state.js";
  import GuideFitBox from "./GuideFitBox.svelte";
  import { readScreenParam, SCREEN_PARAM } from "./guide-screen-url";

  type PageLink = { href: string; title: string } | null;

  let {
    title,
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
  }: {
    title: string;
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
    /** Draws one screen. */
    screen: Snippet<[number]>;
    /** Drawn above the first screen's content (lesson links). */
    lead?: Snippet;
  } = $props();

  let live = $state(false);
  let index = $state(0);
  let direction = $state<1 | -1>(1);
  let pillRow = $state<HTMLElement>();
  const count = $derived(labels.length);
  const last = $derived(Math.max(0, count - 1));

  function read(): void {
    index = Math.min(readScreenParam(window.location.search), last);
  }

  async function go(next: number): Promise<void> {
    if (next === index || next < 0 || next > last) return;
    direction = next > index ? 1 : -1;
    index = next;
    mutateCurrentUrl(
      (url) => {
        if (next === 0) url.searchParams.delete(SCREEN_PARAM);
        else url.searchParams.set(SCREEN_PARAM, String(next + 1));
      },
      { mode: "push" }
    );
    await tick();
    showActivePill();
  }

  function showActivePill(): void {
    const pill = pillRow?.querySelector<HTMLElement>('[aria-current="step"]');
    pill?.scrollIntoView({ block: "nearest", inline: "center" });
  }

  function onPopState(): void {
    const before = index;
    read();
    direction = index >= before ? 1 : -1;
    void tick().then(showActivePill);
  }

  onMount(() => {
    read();
    live = true;
    void tick().then(showActivePill);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
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

  const prevLabel = $derived(index > 0 ? labels[index - 1] : prevPage?.title);
  const nextLabel = $derived(index < last ? labels[index + 1] : nextPage?.title);
</script>

<div class="guide-screens" class:live class:later={live && index > 0}>
  <header class="head">
    <div class="titles">
      {#if kicker}<p class="kicker">{kicker}</p>{/if}
      <h1 class="title" id={titleId}>{title}</h1>
      {#if subtitle}<p class="subtitle">{subtitle}</p>{/if}
    </div>
    {#if count > 1}
      <nav class="pills" aria-label="Parts of this page" bind:this={pillRow}>
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
    {#if live}
      <Crossfade
        key={index}
        duration={DURATION.normal}
        mode="swap"
        motion="step"
        {direction}
        fill
        label={labels[index]}
      >
        <GuideFitBox contentKey={index}>
          {#if index === 0 && lead}<div class="lead">{@render lead()}</div>{/if}
          {@render screen(index)}
        </GuideFitBox>
      </Crossfade>
    {:else}
      <!-- Prerender and first paint: screen 1 in the live frame's place;
           the rest stay in the page for search engines, out of sight. -->
      <div class="first">
        <div class="first-content">
          {#if lead}<div class="lead">{@render lead()}</div>{/if}
          {@render screen(0)}
        </div>
      </div>
      {#if count > 1}
        <div class="rest">
          {#each labels.slice(1) as _, n (n)}{@render screen(n + 1)}{/each}
        </div>
      {/if}
    {/if}
  </div>

  <nav class="controls" aria-label="Guide navigation">
    {#if index > 0}
      <button type="button" class="step prev" onclick={() => go(index - 1)}>
        <span class="dir"><i class="fa-solid fa-chevron-left" aria-hidden="true"></i> Back</span>
        <span class="step-title">{prevLabel}</span>
      </button>
    {:else if prevPage}
      <a class="step prev" href={prevPage.href}>
        <span class="dir"><i class="fa-solid fa-chevron-left" aria-hidden="true"></i> Previous page</span>
        <span class="step-title">{prevLabel}</span>
      </a>
    {:else}
      <span class="step-spacer"></span>
    {/if}
    {#if hubHref}<a class="hub" href={hubHref}>{hubLabel}</a>{/if}
    {#if index < last}
      <button type="button" class="step next" onclick={() => go(index + 1)}>
        <span class="dir">Next <i class="fa-solid fa-chevron-right" aria-hidden="true"></i></span>
        <span class="step-title">{nextLabel}</span>
      </button>
    {:else if nextPage}
      <a class="step next" href={nextPage.href}>
        <span class="dir">Next page <i class="fa-solid fa-chevron-right" aria-hidden="true"></i></span>
        <span class="step-title">{nextLabel}</span>
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

  .controls {
    display: flex;
    align-items: stretch;
    justify-content: space-between;
    gap: 0.6rem;
    padding: clamp(0.4rem, 1vh, 1rem) clamp(0.75rem, 2vw, 3rem)
      max(clamp(0.5rem, 1.2vh, 1.25rem), env(safe-area-inset-bottom));
    border-top: 1px solid color-mix(in oklab, var(--ink, #1a1a1a) 12%, transparent);
    font-family: Inter, system-ui, sans-serif;
    font-size: 0.95rem;
  }
  .step {
    flex: 1 1 0;
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    min-height: 44px;
    padding: 0.4em 1em;
    border: 1px solid color-mix(in oklab, var(--ink, #1a1a1a) 25%, transparent);
    border-radius: 14px;
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
    text-align: right;
    align-items: flex-end;
  }
  .dir {
    font-size: 0.78em;
    font-weight: 650;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--ink-dim, #555);
  }
  .step-title {
    max-width: 100%;
    overflow: hidden;
    font-weight: 650;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .hub {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    padding: 0.4em 1.1em;
    border-radius: 14px;
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
    flex: 1 1 0;
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
  /* A phone past the first screen: the active pill names the screen and
     the title has been read, so the title steps aside for the figure. It
     stays in the page for screen readers and search. */
  @media (max-width: 639.98px), (max-height: 640px) {
    .later .title {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  }
  /* A phone: Back and Next carry the screen's name; All guides shrinks to
     its word. */
  @media (max-width: 520px) {
    .controls {
      gap: 0.4rem;
      font-size: 0.9rem;
    }
    /* One line per button: the chevron says which way, the name says
       where. */
    .dir {
      display: none;
    }
    .step.prev .step-title::before {
      content: "‹ ";
    }
    .step.next .step-title::after {
      content: " ›";
    }
    .step,
    .hub {
      border-radius: 12px;
    }
    .hub {
      padding-inline: 0.75em;
    }
    .step {
      padding-inline: 0.7em;
    }
  }
</style>
