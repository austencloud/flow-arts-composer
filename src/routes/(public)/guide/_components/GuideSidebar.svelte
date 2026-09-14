<script lang="ts">
  /**
   * The unified cross-level guide TOC - Level 1 topic links (real per-topic
   * routes) AND Level 2 section anchors (in-page `#id` anchors on the two live
   * chapter routes), plus Codex and Downloads, in one persistent sidebar. Both
   * level `+layout.svelte` files host this (via their thin `GuideNav.svelte`
   * wrappers) inside the SAME `<aside class="guide-sidebar">` - crossing levels
   * only swaps the route's main content, this component remounts identically.
   *
   * Data sources (manifests, not the retired hand-authored `nav-config.ts`):
   *  - Level 1: `bodyPagesByGroup()` (level-1 guide-manifest.ts) - 34 real
   *    `/guide/level-1/<slug>` routes, one per topic. Row label = the same
   *    `seoForSlug(id, title).h1` the guide hub's TOC uses, so the two surfaces
   *    read identically.
   *  - Level 2: `LEVEL2_SECTION_ANCHORS` (level-2 guide-manifest.ts) - the real
   *    `<GuideSection id="...">` ids rendered on `/guide/level-2/turns` and
   *    `/guide/level-2/double-turns` today (level-2's per-topic URL split is a
   *    later phase; see the design doc).
   *
   * Active state: the current route highlights by `page.url.pathname` for
   * Level 1 rows + Codex; the current in-page section highlights via
   * `activeSectionId`, the SAME scroll-spy signal `GuideSection` already reports
   * through `guide-data-context.ts`'s IntersectionObserver - no new hash-tracking
   * mechanism needed, this already updates live as the reader scrolls the turns
   * / double-turns pages.
   */
  import { page } from "$app/state";
  import {
    bodyPagesByGroup,
    GROUP_TITLES,
    type GuideGroup,
  } from "../level-1/_data/guide-manifest";
  import { seoForSlug } from "../level-1/_data/guide-page-seo";
  import {
    LEVEL2_SECTION_ANCHORS,
    LEVEL2_GROUP_TITLES,
  } from "../level-2/_data/guide-manifest";

  let {
    activeSectionId = "",
    onLinkClick,
  }: {
    /** Live scroll-spy id from the host layout's guide-data-context (level-2
     *  pages report it via GuideSection; level-1 topic pages don't use anchors
     *  so this simply never matches there, which is correct). */
    activeSectionId?: string;
    /** Called after any nav link is activated - hosts use this to close the
     *  mobile drawer (level-1 layout's closeSidebar). Optional: level-2's
     *  layout doesn't wire a mobile-close callback today. */
    onLinkClick?: () => void;
  } = $props();

  const pathname = $derived(page.url.pathname);

  type Level1Row = { id: string; label: string; level: 0 | 1 };
  type Level1Group = { group: GuideGroup; title: string; rows: Level1Row[] };
  const level1Groups: Level1Group[] = bodyPagesByGroup().map(
    ({ group, entries }) => ({
      group,
      title: GROUP_TITLES[group],
      rows: entries.map(({ entry }) => ({
        id: entry.id,
        label: seoForSlug(entry.id, entry.title).h1,
        level: entry.level,
      })),
    })
  );

  let level1Open = $state(true);
  let level2Open = $state(true);

  function isLevel1Active(id: string): boolean {
    return pathname === `/guide/level-1/${id}`;
  }
  const codexActive = $derived(pathname.startsWith("/guide/codex"));
  const ratiosActive = $derived(pathname === "/guide/ratios");
  const motionPathsActive = $derived(pathname === "/guide/motion-paths");

  // ── sessionStorage scroll position - restore on (re)mount ──────────────
  // GuideSidebar remounts fresh whenever the reader crosses from level-1 to
  // level-2 (or back), since each level's +layout.svelte hosts its own
  // GuideNav instance. Without this, every level crossing snaps the sidebar
  // back to the top even if the reader had scrolled deep into Level 2's TOC.
  const SCROLL_KEY = "guide-sidebar-scroll";
  let navEl: HTMLElement | undefined = $state();

  $effect(() => {
    const el = navEl;
    if (!el) return;
    const saved = sessionStorage.getItem(SCROLL_KEY);
    if (saved) el.scrollTop = Number(saved);
    const onScroll = () =>
      sessionStorage.setItem(SCROLL_KEY, String(el.scrollTop));
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  });
</script>

<nav class="guide-nav" aria-label="Guide navigation" bind:this={navEl}>
  <!-- ── Level 1 ─────────────────────────────────────────────────────── -->
  <div class="level-block">
    <div class="level-header">
      <a
        class="nav-title-link"
        href="/guide/level-1"
        onclick={() => onLinkClick?.()}
      >
        Level 1
      </a>
      <button
        type="button"
        class="level-toggle"
        aria-expanded={level1Open}
        aria-label={level1Open ? "Collapse Level 1" : "Expand Level 1"}
        onclick={() => (level1Open = !level1Open)}
      >
        <i class="fas fa-chevron-down" aria-hidden="true"></i>
      </button>
    </div>

    {#if level1Open}
      {#each level1Groups as g (g.group)}
        <div class="chapter-group">
          <div class="group-heading">
            <span class="group-num">{g.group}</span>
            <span>{g.title}</span>
          </div>
          <ul class="section-list">
            {#each g.rows as row (row.id)}
              <li class:sub={row.level === 1}>
                <a
                  class="section-link"
                  class:active={isLevel1Active(row.id)}
                  aria-current={isLevel1Active(row.id) ? "page" : undefined}
                  href={`/guide/level-1/${row.id}`}
                  onclick={() => onLinkClick?.()}
                >
                  {row.label}
                </a>
              </li>
            {/each}
          </ul>
        </div>
      {/each}
    {/if}
  </div>

  <!-- ── Level 2 ─────────────────────────────────────────────────────── -->
  <div class="level-block">
    <div class="level-header">
      <a
        class="nav-title-link"
        href="/guide/level-2"
        onclick={() => onLinkClick?.()}
      >
        Level 2
      </a>
      <button
        type="button"
        class="level-toggle"
        aria-expanded={level2Open}
        aria-label={level2Open ? "Collapse Level 2" : "Expand Level 2"}
        onclick={() => (level2Open = !level2Open)}
      >
        <i class="fas fa-chevron-down" aria-hidden="true"></i>
      </button>
    </div>

    {#if level2Open}
      {#each LEVEL2_SECTION_ANCHORS as route (route.slug)}
        <div class="chapter-group">
          <div class="group-heading">
            <span class="group-num">{route.group}</span>
            <span>{LEVEL2_GROUP_TITLES[route.group]}</span>
          </div>
          <ul class="section-list">
            {#each route.sections as section (section.id)}
              <li>
                <a
                  class="section-link"
                  class:active={activeSectionId === section.id}
                  aria-current={activeSectionId === section.id
                    ? "location"
                    : undefined}
                  href={`/guide/level-2/${route.slug}#${section.id}`}
                  onclick={() => onLinkClick?.()}
                >
                  {section.title}
                </a>
              </li>
            {/each}
          </ul>
        </div>
      {/each}
    {/if}
  </div>

  <div class="chapter-group">
    <a
      class="chapter-title"
      class:active={ratiosActive}
      aria-current={ratiosActive ? "page" : undefined}
      href="/guide/ratios"
      onclick={() => onLinkClick?.()}
    >
      Ratios
    </a>
  </div>

  <div class="chapter-group">
    <a
      class="chapter-title"
      class:active={motionPathsActive}
      aria-current={motionPathsActive ? "page" : undefined}
      href="/guide/motion-paths"
      onclick={() => onLinkClick?.()}
    >
      Motion paths
    </a>
  </div>

  <div class="chapter-group">
    <a
      class="chapter-title"
      class:active={codexActive}
      aria-current={codexActive ? "page" : undefined}
      href="/guide/codex"
      onclick={() => onLinkClick?.()}
    >
      Codex
    </a>
  </div>

  <div class="chapter-group">
    <div class="group-heading"><span>Downloads</span></div>
    <ul class="section-list">
      <li>
        <a
          class="section-link"
          href="/guides/level-1.pdf"
          download
          onclick={() => onLinkClick?.()}
        >
          Level 1 PDF
        </a>
      </li>
      <li>
        <a
          class="section-link"
          href="/guides/level-2.pdf"
          download
          onclick={() => onLinkClick?.()}
        >
          Level 2 PDF
        </a>
      </li>
    </ul>
  </div>
</nav>

<style>
  .level-block {
    margin-bottom: 0.75rem;
  }

  .level-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 0.5rem;
  }

  .nav-title-link {
    font-weight: 700;
    font-size: 0.95rem;
    padding: 0.5rem 0.75rem;
    color: oklch(0.7 0.1 270);
    text-decoration: none;
  }

  .level-toggle {
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
      background 150ms ease,
      color 150ms ease;
  }
  .level-toggle:hover {
    background: oklch(0.2 0.02 270 / 0.4);
    color: oklch(0.75 0.04 270);
  }
  .level-toggle i {
    transition: transform 150ms ease;
  }
  .level-toggle[aria-expanded="false"] i {
    transform: rotate(-90deg);
  }

  .group-heading {
    display: flex;
    align-items: baseline;
    gap: 0.4em;
    font-weight: 500;
    font-size: 0.85rem;
    padding: 0.55rem 0.75rem;
    color: oklch(0.55 0.02 270);
  }
  .group-num {
    color: oklch(0.65 0.14 270);
    font-style: italic;
  }

  li.sub .section-link {
    padding-left: 3rem;
  }

  @media (prefers-reduced-motion: reduce) {
    .level-toggle i {
      transition: none;
    }
  }
</style>
