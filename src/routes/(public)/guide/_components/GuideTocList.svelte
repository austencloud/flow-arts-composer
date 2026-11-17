<script lang="ts">
  /**
   * The guide contents as a plain label list, for the phone/tablet drawer.
   * Same rows as the desktop rail (guide-toc.ts), rendered as text links with
   * no icon rail: the app splits its navigation the same way, a package rail
   * on desktop and a primary list on phones, both from one module list.
   *
   * The level the reader is in opens, the others fold, and the reader's own
   * toggle wins until the route changes. The prerendered HTML carries every
   * row unfolded (folds apply after hydration), so each topic stays a
   * crawlable link on every guide page.
   *
   * A page shown one screen at a time lists its own screens, under its
   * name: one row per screen, the current one filled. A row switches the
   * screen in place. Once hydrated, the list of all guides moves behind one
   * "All guides" row pinned under the screens; pressing it swaps the
   * drawer to the guides (a drill-down through the shared Crossfade), and a
   * back row at their top returns. The prerendered HTML still carries the
   * screens and every guide link, unfolded.
   */
  import { onMount, tick } from "svelte";
  import type { ModuleDefinition, Section } from "@austencloud/sidebar";
  import { Crossfade, growFade } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import { t, tDynamic } from "#lib/shared/i18n/i18n.svelte.js";
  import type { GuidePageScreens } from "./guide-chrome-context";
  import {
    currentRoutePath,
    localHref,
  } from "#lib/shared/i18n/localized-href.svelte.js";
  import {
    buildGuideToc,
    guideTocModuleFor,
    guideTocSectionFor,
  } from "../_data/guide-toc";

  let {
    activeSectionId = "",
    screens = null,
    revealKey = 0,
    onLinkClick,
  }: {
    activeSectionId?: string;
    /** This page's screens, listed first (GuideScreens pages). */
    screens?: GuidePageScreens | null;
    /** Bumped by the host when the drawer opens, to bring the current row
     *  into view. */
    revealKey?: number;
    /** Called after any link is activated; the host closes the drawer. */
    onLinkClick?: () => void;
  } = $props();

  const pathname = $derived(currentRoutePath());
  const modules = $derived(buildGuideToc(localHref));
  const currentModule = $derived(guideTocModuleFor(pathname));
  const currentSection = $derived(
    guideTocSectionFor(pathname, activeSectionId)
  );
  const onHub = $derived(pathname === "/guide" || pathname === "/guide/");

  let hydrated = $state(false);
  onMount(() => {
    hydrated = true;
  });

  // Auto: the current level open (both on the hub), the rest folded.
  let choices = $state<Record<string, boolean>>({});
  $effect(() => {
    void pathname;
    choices = {};
  });
  function isOpen(m: ModuleDefinition): boolean {
    if (!hydrated) return true;
    return choices[m.id] ?? (onHub || m.id === currentModule);
  }

  function rowsByGroup(m: ModuleDefinition) {
    if (!m.groups?.length) return [{ id: "", label: "", rows: m.sections }];
    return m.groups.map((g) => ({
      id: g.id,
      label: g.label,
      rows: m.sections.filter((s: Section) => s.groupId === g.id),
    }));
  }

  const isCurrent = (m: ModuleDefinition, s: Section) =>
    m.id === currentModule && s.id === currentSection;

  // ── This page's screens, or all guides ───────────────────────────────────
  // A page with screens shows them first and keeps the guides one row away.
  // Before hydration both are in the HTML, one after the other. The guide's
  // front page is the guides' own door: its drawer stays one list, as before.
  const drill = $derived(
    hydrated && !onHub && !!screens && screens.labels.length > 1
  );
  let view = $state<"screens" | "guides">("screens");
  // Every opening of the drawer, and every new page, starts on the screens.
  $effect(() => {
    void pathname;
    void revealKey;
    view = "screens";
  });

  async function showGuides() {
    view = "guides";
    await tick();
    navEl?.querySelector<HTMLElement>(".back-row")?.focus();
  }
  async function showScreens() {
    view = "screens";
    await tick();
    navEl?.querySelector<HTMLElement>(".all-guides-row")?.focus();
  }

  // ── Keep the current row in view ─────────────────────────────────────────
  let navEl: HTMLElement | undefined = $state();

  function scrollerOf(el: HTMLElement): HTMLElement {
    let node: HTMLElement | null = el;
    while (node) {
      const overflow = getComputedStyle(node).overflowY;
      if (overflow === "auto" || overflow === "scroll") return node;
      node = node.parentElement;
    }
    return el;
  }

  function revealCurrent(el: HTMLElement) {
    const current =
      el.querySelector<HTMLElement>('[aria-current="step"]') ??
      el.querySelector<HTMLElement>('[aria-current="page"]');
    if (!current) return;
    // The nearest scroller above the row: the screen list in the
    // drill-down, the drawer itself otherwise.
    const scroller = scrollerOf(current.parentElement ?? el);
    const box = scroller.getBoundingClientRect();
    const link = current.getBoundingClientRect();
    if (link.top >= box.top && link.bottom <= box.bottom) return;
    scroller.scrollTop +=
      link.top - box.top - (scroller.clientHeight - link.height) / 2;
  }

  $effect(() => {
    const el = navEl;
    void pathname;
    void revealKey;
    void screens?.index;
    void view;
    if (!el) return;
    void tick().then(() => revealCurrent(el));
  });
</script>

{#snippet screenList(page: GuidePageScreens)}
  <ol class="screen-list">
    {#each page.labels as label, n (n)}
      <li>
        <button
          type="button"
          class="screen-row"
          aria-current={n === page.index ? "step" : undefined}
          onclick={() => {
            page.go(n);
            onLinkClick?.();
          }}
        >
          <span class="screen-n" aria-hidden="true">{n + 1}</span>
          <span class="screen-name">{label}</span>
          <span class="sr-only"
            >{t("guide_screens_position", {
              n: n + 1,
              total: page.labels.length,
            })}</span
          >
        </button>
      </li>
    {/each}
  </ol>
{/snippet}

{#snippet guideModules()}
  {#each modules as m (m.id)}
    {@const hasRows = m.sections.length > 0}
    {@const open = isOpen(m)}
    <div class="toc-module">
      <div class="module-row">
        {#if m.href}
          <a
            class="module-link"
            class:active={m.id === currentModule}
            aria-current={m.id === currentModule && !hasRows
              ? "page"
              : undefined}
            href={m.href}
            onclick={() => onLinkClick?.()}
          >
            {m.label}
          </a>
        {:else}
          <span class="module-link heading">{m.label}</span>
        {/if}
        {#if hasRows}
          <button
            type="button"
            class="module-toggle"
            aria-expanded={open}
            aria-label={m.label}
            onclick={() => (choices = { ...choices, [m.id]: !open })}
          >
            <i class="fa-solid fa-chevron-down" aria-hidden="true"></i>
          </button>
        {/if}
      </div>

      {#if hasRows && open}
        <div class="module-body" transition:growFade>
          {#each rowsByGroup(m) as g (g.id)}
            {#if g.label}
              <div class="group-heading">{g.label}</div>
            {/if}
            <ul class="row-list">
              {#each g.rows as s (s.id)}
                <li class:sub={s.depth === 1}>
                  <a
                    class="row-link"
                    class:active={isCurrent(m, s)}
                    aria-current={isCurrent(m, s) ? "page" : undefined}
                    href={s.href}
                    download={s.download ? "" : undefined}
                    onclick={() => onLinkClick?.()}
                  >
                    {s.label}
                  </a>
                </li>
              {/each}
            </ul>
          {/each}
        </div>
      {/if}
    </div>
  {/each}
{/snippet}

<nav
  class="guide-toc"
  class:drill
  aria-label={tDynamic("guide_nav_aria")}
  bind:this={navEl}
>
  {#if drill && screens}
    {@const page = screens}
    <Crossfade
      key={view}
      fill
      mode="swap"
      motion="step"
      direction={view === "guides" ? 1 : -1}
      duration={DURATION.normal}
    >
      {#if view === "screens"}
        <section class="pane" aria-labelledby="guide-toc-this-page">
          <h2 class="this-page-title" id="guide-toc-this-page">
            {page.title}
          </h2>
          {@render screenList(page)}
          <button type="button" class="all-guides-row" onclick={showGuides}>
            <span>{t("guide_nav_all_guides")}</span>
            <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
          </button>
        </section>
      {:else}
        <div class="pane">
          <button type="button" class="back-row" onclick={showScreens}>
            <i class="fa-solid fa-chevron-left" aria-hidden="true"></i>
            <span>{page.title}</span>
          </button>
          <div class="guides-scroll">
            {@render guideModules()}
          </div>
        </div>
      {/if}
    </Crossfade>
  {:else}
    {#if screens && screens.labels.length > 1}
      <section class="this-page" aria-labelledby="guide-toc-this-page">
        <h2 class="this-page-title" id="guide-toc-this-page">
          {screens.title}
        </h2>
        {@render screenList(screens)}
      </section>
    {/if}
    {@render guideModules()}
  {/if}
</nav>

<style>
  .guide-toc {
    padding: 0 0.75rem;
    font-family: "Inter", system-ui, sans-serif;
  }

  .toc-module {
    margin-bottom: 0.5rem;
  }

  .module-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .module-link {
    flex: 1;
    display: flex;
    align-items: center;
    min-height: 44px;
    padding: 0.5rem 0.75rem;
    border-radius: 10px;
    font-weight: 700;
    font-size: 0.95rem;
    color: oklch(0.7 0.1 270);
    text-decoration: none;
    transition:
      background var(--transition-fast),
      color var(--transition-fast);
  }
  a.module-link:hover {
    background: oklch(0.2 0.02 270 / 0.4);
    color: oklch(0.85 0.06 270);
  }
  .module-link.active {
    color: oklch(0.85 0.06 270);
  }
  .module-link.heading {
    color: oklch(0.6 0.03 270);
  }

  .module-toggle {
    all: unset;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 44px;
    min-height: 44px;
    border-radius: 8px;
    color: oklch(0.55 0.02 270);
    cursor: pointer;
    transition:
      background var(--transition-fast),
      color var(--transition-fast);
  }
  .module-toggle:hover {
    background: oklch(0.2 0.02 270 / 0.4);
    color: oklch(0.75 0.04 270);
  }
  .module-toggle:focus-visible,
  .module-link:focus-visible,
  .row-link:focus-visible {
    outline: 2px solid oklch(0.74 0.11 265);
    outline-offset: 2px;
  }
  .module-toggle i {
    transition: transform var(--transition-fast);
  }
  .module-toggle[aria-expanded="false"] i {
    transform: rotate(-90deg);
  }

  .group-heading {
    font-weight: 500;
    font-size: 0.85rem;
    padding: 0.55rem 0.75rem;
    color: oklch(0.6 0.03 270);
  }

  .row-list {
    list-style: none;
    padding: 0;
    margin: 0.25rem 0 0.5rem;
  }

  .row-link {
    display: flex;
    align-items: center;
    min-height: 44px;
    padding: 0.35rem 0.75rem 0.35rem 2.25rem;
    border-radius: 8px;
    font-size: 0.85rem;
    color: oklch(0.62 0.03 270);
    text-decoration: none;
    position: relative;
    transition:
      background var(--transition-micro),
      color var(--transition-micro);
  }
  li.sub .row-link {
    padding-left: 3.25rem;
  }
  .row-link:hover {
    color: oklch(0.8 0.04 270);
    background: oklch(0.2 0.02 270 / 0.3);
  }
  .row-link.active {
    color: oklch(0.85 0.1 270);
    font-weight: 550;
    background: oklch(0.25 0.04 270 / 0.3);
  }
  .row-link.active::before {
    content: "";
    position: absolute;
    left: 12px;
    top: 50%;
    transform: translateY(-50%);
    width: 3px;
    height: 14px;
    background: oklch(0.65 0.18 270);
    border-radius: 2px;
  }

  /* This page's screens: one full-width row each, the current one filled
     orange like the screen pills. Fixed type sizes (guide words never scale
     with the window). */
  .this-page {
    margin: 0 0 0.75rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid oklch(0.3 0.02 270 / 0.6);
  }
  .this-page-title {
    margin: 0;
    padding: 0.5rem 0.75rem 0.4rem;
    font-size: var(--font-size-base);
    font-weight: 700;
    line-height: 1.3;
    color: oklch(0.85 0.06 270);
  }
  .screen-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .screen-row {
    all: unset;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 0.6rem;
    width: 100%;
    min-height: 40px;
    padding: 0.35rem 0.75rem;
    border-radius: 10px;
    font-size: var(--font-size-sm);
    font-weight: 550;
    line-height: 1.25;
    color: oklch(0.8 0.03 270);
    cursor: pointer;
    transition:
      background var(--transition-micro),
      color var(--transition-micro);
  }
  .screen-row:hover {
    background: oklch(0.2 0.02 270 / 0.4);
    color: oklch(0.92 0.03 270);
  }
  .screen-row:focus-visible {
    outline: 2px solid oklch(0.74 0.11 265);
    outline-offset: 2px;
  }
  .screen-row[aria-current="step"] {
    background: #e8590c;
    color: #fff;
    font-weight: 650;
  }
  .screen-n {
    flex: none;
    display: inline-grid;
    place-items: center;
    min-width: 1.6rem;
    height: 1.6rem;
    border-radius: 999px;
    background: color-mix(in oklab, currentColor 14%, transparent);
    font-size: var(--font-size-xs);
    font-variant-numeric: tabular-nums;
  }
  .screen-name {
    min-width: 0;
    overflow-wrap: break-word;
  }
  /* Drill-down (a page with screens, once hydrated): the list fills the
     drawer (GuideShell) and the drawer itself does not scroll. One pane at
     a time: the screens with the pinned All guides row under them, or the
     guides under a back row. */
  .guide-toc.drill {
    height: 100%;
    padding: 0;
  }
  .pane {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    padding: 0 0.75rem;
    box-sizing: border-box;
  }
  .drill .this-page-title {
    flex: none;
    padding: 0.1rem 0.75rem 0.25rem;
    line-height: 1.2;
  }
  .drill .screen-list {
    flex: 0 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    /* scrolls: this page's screens, only when a long page (Ratios) has more than the drawer holds */
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  /* Rows are 40px and give way to 36px on a short drawer before the list
     scrolls. */
  .drill .screen-list > li {
    flex: 0 1 40px;
    min-height: 36px;
    display: flex;
  }
  .drill .screen-row {
    min-height: 0;
  }
  .all-guides-row,
  .back-row {
    all: unset;
    box-sizing: border-box;
    flex: none;
    display: flex;
    align-items: center;
    gap: 0.6rem;
    width: 100%;
    min-height: 44px;
    padding: 0.35rem 0.75rem;
    border-radius: 10px;
    font-family: inherit;
    font-size: var(--font-size-base);
    font-weight: 700;
    line-height: 1.25;
    color: oklch(0.7 0.1 270);
    cursor: pointer;
    transition:
      background var(--transition-micro),
      color var(--transition-micro);
  }
  .all-guides-row {
    justify-content: space-between;
    margin-top: auto;
    border-top: 1px solid oklch(0.3 0.02 270 / 0.6);
    border-radius: 0 0 10px 10px;
  }
  .back-row {
    color: oklch(0.85 0.06 270);
    margin-bottom: 0.25rem;
  }
  .all-guides-row:hover,
  .back-row:hover {
    background: oklch(0.2 0.02 270 / 0.4);
    color: oklch(0.92 0.03 270);
  }
  .all-guides-row:focus-visible,
  .back-row:focus-visible {
    outline: 2px solid oklch(0.74 0.11 265);
    outline-offset: -2px;
  }
  .all-guides-row i,
  .back-row i {
    flex: none;
    font-size: var(--font-size-xs);
  }
  .guides-scroll {
    flex: 1 1 auto;
    min-height: 0;
    /* scrolls: the list of all guides, under its back row */
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  @media (prefers-reduced-motion: reduce) {
    .screen-row,
    .module-link,
    .module-toggle,
    .module-toggle i,
    .row-link,
    .all-guides-row,
    .back-row {
      transition: none;
    }
  }
</style>
