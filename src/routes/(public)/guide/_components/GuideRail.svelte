<script lang="ts">
  /**
   * The guide's desktop contents rail: a thin host over the package Sidebar
   * (@austencloud/sidebar), the same hover-expand overlay rail the app uses.
   * A 64px icon rail that content reserves, floating out over the page on
   * hover and pinning open into a push layout. The rows come from
   * guide-toc.ts, the one data source the phone drawer reads too.
   *
   * Desktop pointers only: guide.css hides the host below 1024px and on
   * touch screens, where the Contents pill and drawer take over (a touch rail
   * can't hover open, and the topic rows have no icons to show in it).
   */
  import { tick } from "svelte";
  import { page } from "$app/state";
  import { Sidebar } from "@austencloud/sidebar";
  import { tDynamic } from "#lib/shared/i18n/i18n.svelte.js";
  import {
    buildGuideToc,
    guideTocModuleFor,
    guideTocSectionFor,
  } from "../_data/guide-toc";

  let {
    activeSectionId = "",
    onReservedWidthChange,
  }: {
    /** Live scroll-spy id (Level 2 sections) from the host layout. */
    activeSectionId?: string;
    onReservedWidthChange?: (px: number) => void;
  } = $props();

  const pathname = $derived(page.url.pathname);
  const modules = $derived(buildGuideToc());
  const currentModule = $derived(guideTocModuleFor(pathname));
  const currentSection = $derived(
    guideTocSectionFor(pathname, activeSectionId)
  );

  // Topic titles run long; the overlay is wide enough for most of them, and
  // the rest truncate with their full text as a tooltip.
  const EXPANDED_WIDTH = 320;

  // ── Keep the current row in view ─────────────────────────────────────────
  // The rows only exist while the rail is open (hover or pinned). Whenever it
  // opens, and on every route change while it is open, the row carrying
  // aria-current is brought into the nav's scroll band if it sits outside it.
  let hostEl: HTMLElement | undefined = $state();

  function revealCurrent() {
    const scroller = hostEl?.querySelector<HTMLElement>(".navigation-content");
    if (!scroller) return;
    const current = scroller.querySelector<HTMLElement>(
      '.section-button[aria-current="page"]'
    );
    if (!current) return;
    const box = scroller.getBoundingClientRect();
    const row = current.getBoundingClientRect();
    if (row.top >= box.top && row.bottom <= box.bottom) return;
    scroller.scrollTop += row.top - box.top - (box.height - row.height) / 2;
  }

  // After the package's own module scroll (100ms after a module expands) and
  // the section list's slide-in, so this measures settled rows.
  const SETTLE_MS = 320;
  let revealTimer: ReturnType<typeof setTimeout> | undefined;
  function scheduleReveal() {
    clearTimeout(revealTimer);
    void tick().then(() => {
      revealTimer = setTimeout(revealCurrent, SETTLE_MS);
    });
  }

  $effect(() => {
    void pathname;
    void currentSection;
    scheduleReveal();
  });

  $effect(() => {
    const nav = hostEl?.querySelector("nav");
    if (!nav) return;
    let wasOpen = !nav.classList.contains("collapsed");
    const observer = new MutationObserver(() => {
      const open = !nav.classList.contains("collapsed");
      if (open && !wasOpen) scheduleReveal();
      wasOpen = open;
    });
    observer.observe(nav, { attributes: true, attributeFilter: ["class"] });
    return () => {
      observer.disconnect();
      clearTimeout(revealTimer);
    };
  });
</script>

<div class="guide-rail-host" bind:this={hostEl}>
  <Sidebar
    {modules}
    {currentModule}
    {currentSection}
    pinStorageKey="guide-rail"
    expandedWidth={EXPANDED_WIDTH}
    homeHref="/guide"
    navigationLabel={tDynamic("guide_nav_aria")}
    homeLabel={tDynamic("guide_paths_part_of")}
    pinLabel={tDynamic("nav_pin_sidebar")}
    collapseLabel={tDynamic("nav_collapse_sidebar")}
    brandRest={` ${tDynamic("tab_learn_guide")}`}
    {onReservedWidthChange}
  >
    {#snippet brandLead()}
      <i class="fa-solid fa-list-ul guide-rail-glyph" aria-hidden="true"></i>
    {/snippet}
  </Sidebar>
</div>

<style>
  /* Under the fixed SiteHeader (z 200, its menus 210), never over it. */
  .guide-rail-host {
    --sidebar-top: var(--marketing-header-h, 64px);
    --z-sidebar: 150;
    display: none;
  }

  @media (min-width: 1024px) and (hover: hover) and (pointer: fine) {
    .guide-rail-host {
      display: contents;
    }
  }

  /* The glyph sits on the rail's x=32 anchor like a module icon. */
  .guide-rail-glyph {
    font-size: 1.05rem;
    width: 1.25em;
    text-align: center;
  }
</style>
