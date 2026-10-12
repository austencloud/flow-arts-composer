<script lang="ts">
  /**
   * The one guide shell every host renders: the contents rail (desktop), the
   * contents pill and drawer (phones, tablets, touch screens), and the content
   * column. Level 1, Level 2, Ratios, Motion paths and the guide hub all
   * mount THIS component so the guide reads the same on every page.
   *
   * The site header, footer and theme belong to the root MarketingChrome,
   * which wraps every /guide page (see MARKETING_SUBTREES in the root layout),
   * so moving between guide pages and the rest of the public site never
   * swaps the chrome. Both contents views read one table of contents,
   * guide-toc.ts.
   *
   * Callers keep their own `<svelte:head>` font/preconnect blocks and their
   * own `setActiveSectionContext` wiring - that's route-specific, not shell
   * chrome - and pass the resulting `activeSectionId` in here so the contents
   * can highlight the in-view Level 2 section.
   */
  import type { Snippet } from "svelte";
  import { untrack } from "svelte";
  import { tDynamic } from "#lib/shared/i18n/i18n.svelte.js";
  import { GUIDE_CANVAS } from "#lib/shared/landing/domain/page-surface.js";
  import GuideRail from "./GuideRail.svelte";
  import GuideTocList from "./GuideTocList.svelte";
  import { setGuideChromeContext } from "./guide-chrome-context";
  import "../level-1/_styles/guide.css";

  let {
    activeSectionId = $bindable(""),
    children,
  }: {
    activeSectionId?: string;
    children: Snippet;
  } = $props();

  let drawerOpen = $state(false);
  let drawerReveal = $state(0);

  function toggleDrawer() {
    drawerOpen = !drawerOpen;
    if (drawerOpen) drawerReveal += 1;
  }

  function closeDrawer() {
    drawerOpen = false;
  }

  // The rail's reserved width (64px collapsed, the expanded width when
  // pinned) is published on the root element: the content column and the
  // site footer (a MarketingChrome sibling, outside this component) both
  // step aside by it. guide.css only applies it where the rail shows.
  let railReserved = $state(0);
  $effect(() => {
    const root = document.documentElement;
    if (railReserved > 0) {
      root.style.setProperty("--guide-rail-reserved", `${railReserved}px`);
    } else {
      root.style.removeProperty("--guide-rail-reserved");
    }
    return () => root.style.removeProperty("--guide-rail-reserved");
  });

  // The floating contents pill is fixed over the reading column on narrow
  // screens, where it sat on top of table columns and grid headers at every
  // scroll position. It steps out of the way while the reader scrolls down
  // and returns on the first scroll up, the way a mobile browser bar does.
  // It always stays while the drawer is open so it can close it.
  let pillTucked = $state(false);
  let lastScrollY = 0;
  function onScroll() {
    const y = window.scrollY;
    const delta = y - lastScrollY;
    lastScrollY = y;
    if (drawerOpen || y < 96) {
      pillTucked = false;
      return;
    }
    if (delta > 6) pillTucked = true;
    else if (delta < -6) pillTucked = false;
  }

  // A page region that takes the whole viewport keeps the pill tucked while
  // it is open, whichever way the page scrolls to show it. Holds are taken
  // from effects, so the count is changed untracked: reading it there would
  // make the caller's effect rerun on its own hold.
  let pillHolds = $state(0);
  setGuideChromeContext({
    holdPillAway() {
      untrack(() => (pillHolds += 1));
      let released = false;
      return () => {
        if (released) return;
        released = true;
        untrack(() => (pillHolds -= 1));
      };
    },
  });
</script>

<svelte:window onscroll={onScroll} />

<a href="#guide-main" class="skip-link"
  >{tDynamic("guide_runtime_skip_content")}</a
>

<div class="guide-layout" style:--guide-canvas={GUIDE_CANVAS}>
  <GuideRail
    {activeSectionId}
    onReservedWidthChange={(px) => (railReserved = px)}
  />

  <button
    class="mobile-menu-btn"
    class:tucked={(pillTucked || pillHolds > 0) && !drawerOpen}
    onclick={toggleDrawer}
    aria-label={tDynamic(
      drawerOpen
        ? "guide_runtime_close_contents"
        : "guide_runtime_open_contents"
    )}
    aria-expanded={drawerOpen}
    aria-controls="guide-drawer"
  >
    <i class="fa-solid {drawerOpen ? 'fa-xmark' : 'fa-list'}" aria-hidden="true"
    ></i>
    <span>{tDynamic("guide_runtime_contents")}</span>
  </button>

  <aside id="guide-drawer" class="guide-drawer" class:open={drawerOpen}>
    <GuideTocList
      {activeSectionId}
      revealKey={drawerReveal}
      onLinkClick={closeDrawer}
    />
  </aside>

  <main class="guide-content" id="guide-main" tabindex="-1">
    {@render children()}
  </main>
</div>

<style>
  /* Keyboard and screen reader readers get one jump past the site header and
     the guide contents. Hidden until focused, then pinned at the top left. */
  .skip-link {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
    background: oklch(0.18 0.02 270);
    color: oklch(0.92 0.02 270);
    border-radius: 8px;
    text-decoration: none;
    font-family: Inter, system-ui, sans-serif;
    font-weight: 600;
    z-index: 300;
  }
  .skip-link:focus {
    position: fixed;
    top: 1rem;
    left: 1rem;
    width: auto;
    height: auto;
    padding: 0.75rem 1.25rem;
    margin: 0;
    clip: auto;
    outline: 2px solid oklch(0.74 0.11 265);
    outline-offset: 2px;
  }

  /* The content column is a focus target for the skip link only; it needs
     no ring of its own. */
  .guide-content:focus {
    outline: none;
  }

  /* SiteHeader is a fixed 64px bar (56px once scrolled) that doesn't push
     document flow - the drawer and pill below clear it explicitly instead of
     relying on layout push. */
  .mobile-menu-btn {
    display: none;
    position: fixed;
    top: calc(64px + 1rem);
    left: 1rem;
    z-index: 60;
    background: oklch(0.18 0.02 270 / 0.8);
    backdrop-filter: blur(12px);
    border: 1px solid oklch(0.3 0.04 270 / 0.3);
    border-radius: 999px;
    padding: 0.55rem 0.8rem;
    cursor: pointer;
    min-height: 44px;
    color: oklch(0.8 0.04 270);
    font-family: Inter, system-ui, sans-serif;
    font-size: 0.8rem;
    font-weight: 750;
    letter-spacing: 0.01em;
    transition:
      transform
        var(--transition-normal, var(--duration-normal) var(--ease-standard)),
      opacity
        var(--transition-normal, var(--duration-normal) var(--ease-standard)),
      visibility 0s linear 0s;
  }

  /* Tucked: slides up behind the header and leaves the tab order, with
     visibility flipping only once the slide has finished. */
  .mobile-menu-btn.tucked {
    transform: translateY(calc(-100% - 64px - 1.5rem));
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transition:
      transform
        var(--transition-normal, var(--duration-normal) var(--ease-standard)),
      opacity
        var(--transition-normal, var(--duration-normal) var(--ease-standard)),
      visibility 0s linear var(--duration-normal);
  }

  .guide-drawer {
    display: none;
  }

  /* Wherever the desktop rail is hidden (narrow screens, and touch screens,
     where a rail can't hover open) the pill and its drawer take over. Keep
     in step with the GuideRail host query and guide.css. */
  @media (max-width: 1023.98px), not ((hover: hover) and (pointer: fine)) {
    .mobile-menu-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
    }

    .guide-drawer.open {
      display: block;
      position: fixed;
      top: 64px;
      left: 0;
      width: 100%;
      height: calc(100dvh - 64px);
      overflow-y: auto;
      overscroll-behavior: contain;
      padding: calc(44px + 2rem) 0 2rem;
      z-index: 50;
      background: var(--guide-canvas);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .mobile-menu-btn,
    .mobile-menu-btn.tucked {
      transition: none;
    }
  }
</style>
