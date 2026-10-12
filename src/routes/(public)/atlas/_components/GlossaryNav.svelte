<script lang="ts">
  /**
   * The glossary's contents panel: an optional filter box plus one row per
   * CATEGORY. Categories only, deliberately - the master list right beside
   * this rail already shows every term of the open category with a teaser,
   * so listing the same terms here read as the page saying everything twice
   * (Austen, 2026-07-16). The rail's actual jobs are jumping between
   * categories and hosting the search box; term-level access lives in the
   * master list and the global filter.
   *
   * Hosted twice by +page.svelte: in the desktop sticky sidebar and inside
   * the mobile Contents drawer (drawer hides the search box because the
   * sticky mobile bar already has one bound to the same query). While a
   * filter is active the counts become per-category match counts.
   */
  type NavTerm = { term: string; slug: string };
  type NavGroup = {
    key: string;
    label: string;
    sectionSlug: string;
    terms: NavTerm[];
    /** Non-term surfaces, such as the visual Codex, report their own unit. */
    countLabel?: string;
  };

  let {
    groups,
    total,
    query = $bindable(""),
    activeSlug = "",
    activeCat = "",
    showSearch = true,
    showCats = true,
    onNavigate,
  }: {
    /** Already-filtered groups (the page owns the filtering). */
    groups: NavGroup[];
    /** Unfiltered term count, for the "N of M" line while filtering. */
    total: number;
    query?: string;
    /** Currently selected term - highlights the category containing it. */
    activeSlug?: string;
    /** The page's current drill view ("landing" | "all" | category key) -
     *  highlights the matching category row. */
    activeCat?: string;
    showSearch?: boolean;
    /** Hide the category rows (the glossary landing view hides them because
     *  its category CARDS are the nav there - same list twice is the exact
     *  redundancy this component exists to avoid). */
    showCats?: boolean;
    /** Fired when a category row is activated (its `cat-*` section slug).
     *  The host owns what happens: drill the category / close the drawer.
     *  It may preventDefault the anchor jump. */
    onNavigate?: (slug: string, e: MouseEvent) => void;
  } = $props();

  const shown = $derived(groups.reduce((n, g) => n + g.terms.length, 0));
  const filtering = $derived(query.trim().length > 0);
</script>

<div class="gnav">
  {#if showSearch}
    <div class="gnav-search">
      <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
      <input
        data-glossary-search
        name="glossary-search"
        type="search"
        placeholder="Filter terms"
        aria-label="Filter Atlas terms"
        autocomplete="off"
        bind:value={query}
      />
      {#if filtering}
        <button
          type="button"
          class="gnav-clear"
          aria-label="Clear filter"
          onclick={() => (query = "")}
        >
          <i class="fa-solid fa-xmark" aria-hidden="true"></i>
        </button>
      {/if}
    </div>
  {/if}

  <p class="gnav-count" aria-live="polite">
    {#if filtering}{shown} of {total} terms{:else}{total} terms{/if}
  </p>

  {#if showCats}
    <nav class="gnav-list" aria-label="Atlas categories">
      {#each groups as g (g.key)}
        {@const groupActive =
          g.key === activeCat || g.terms.some((t) => t.slug === activeSlug)}
        <a
          class="gnav-cat"
          class:active={groupActive}
          aria-current={groupActive ? "true" : undefined}
          href={`#${g.sectionSlug}`}
          onclick={(e) => onNavigate?.(g.sectionSlug, e)}
        >
          <span class="gnav-label">{g.label}</span>
          <span class="gnav-n">{g.countLabel ?? g.terms.length}</span>
        </a>
      {/each}
      {#if !groups.length}
        <p class="gnav-empty">No terms match "{query.trim()}".</p>
      {/if}
    </nav>
  {/if}
</div>

<style>
  .gnav {
    display: flex;
    flex-direction: column;
    min-height: 0;
    height: 100%;
    font-family: "Inter", system-ui, sans-serif;
  }

  .gnav-search {
    position: relative;
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }
  .gnav-search > i {
    position: absolute;
    left: 0.85rem;
    font-size: 0.8rem;
    color: oklch(0.55 0.02 270);
    pointer-events: none;
  }
  .gnav-search input {
    width: 100%;
    min-height: 44px;
    padding: 0.55rem 2.6rem 0.55rem 2.35rem;
    font: inherit;
    font-size: 0.95rem;
    color: oklch(0.94 0.01 270);
    background: oklch(0.18 0.02 270 / 0.55);
    border: 1px solid oklch(0.45 0.04 270 / 0.25);
    border-radius: 12px;
    outline: none;
    transition:
      border-color var(--duration-fast) var(--ease-standard),
      background var(--duration-fast) var(--ease-standard);
  }
  .gnav-search input::placeholder {
    color: oklch(0.55 0.02 270);
  }
  .gnav-search input:focus-visible {
    border-color: oklch(0.65 0.13 275 / 0.7);
    background: oklch(0.2 0.025 272 / 0.6);
  }
  /* Hide the native WebKit clear control; the button below replaces it. */
  .gnav-search input::-webkit-search-cancel-button {
    -webkit-appearance: none;
    appearance: none;
  }
  .gnav-clear {
    all: unset;
    box-sizing: border-box;
    position: absolute;
    right: 2px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 44px;
    min-height: 44px;
    border-radius: 10px;
    color: oklch(0.65 0.02 270);
    cursor: pointer;
  }
  .gnav-clear:hover {
    color: oklch(0.9 0.02 270);
  }
  .gnav-clear:focus-visible {
    outline: 2px solid oklch(0.65 0.13 275);
    outline-offset: -4px;
  }

  .gnav-count {
    flex-shrink: 0;
    margin: 0.6rem 0.15rem 0.5rem;
    font-size: 0.75rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: oklch(0.55 0.02 270);
  }

  .gnav-list {
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding-right: 0.35rem;
    scrollbar-width: thin;
    scrollbar-color: oklch(0.4 0.03 270 / 0.5) transparent;
  }
  .gnav-list::-webkit-scrollbar {
    width: 6px;
  }
  .gnav-list::-webkit-scrollbar-thumb {
    background: oklch(0.4 0.03 270 / 0.5);
    border-radius: 3px;
  }

  .gnav-cat {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem;
    min-height: 44px;
    padding: 0.5rem 0.75rem 0.5rem 0.9rem;
    margin-bottom: 2px;
    font-size: 0.92rem;
    font-weight: 560;
    line-height: 1.3;
    color: oklch(0.75 0.015 270);
    text-decoration: none;
    border: 1px solid transparent;
    border-radius: 10px;
    transition:
      color var(--duration-fast) var(--ease-standard),
      background var(--duration-fast) var(--ease-standard),
      border-color var(--duration-fast) var(--ease-standard);
  }
  .gnav-cat:hover {
    color: oklch(0.94 0.01 270);
    background: oklch(0.24 0.03 272 / 0.35);
  }
  .gnav-cat.active {
    color: oklch(0.95 0.03 275);
    background: oklch(0.28 0.05 275 / 0.35);
    border-color: oklch(0.7 0.14 275);
    box-shadow: 0 0 0 1px oklch(0.7 0.14 275 / 0.24);
  }
  .gnav-cat:focus-visible {
    outline: 2px solid oklch(0.65 0.13 275);
    outline-offset: -2px;
  }
  .gnav-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .gnav-n {
    flex-shrink: 0;
    font-size: 0.78rem;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    color: oklch(0.6 0.05 274);
    background: oklch(0.3 0.06 274 / 0.3);
    border-radius: 999px;
    padding: 0.1rem 0.55rem;
  }
  .gnav-cat.active .gnav-n {
    color: oklch(0.82 0.09 275);
    background: oklch(0.34 0.08 275 / 0.4);
  }

  .gnav-empty {
    margin: 0.75rem 0.15rem;
    font-size: 0.9rem;
    color: oklch(0.62 0.02 270);
  }

  /* Big-screen tier: 1680, the site-wide seam (public-editorial.css). The old
     2200 query never fired on a 4K monitor at 200% scaling (~1920px CSS). */
  @media (min-width: 1680px) {
    .gnav-search input {
      font-size: 1.1rem;
    }
    .gnav-count {
      font-size: 0.9rem;
    }
    .gnav-cat {
      font-size: 1.08rem;
      min-height: 50px;
    }
    .gnav-n {
      font-size: 0.9rem;
    }
    .gnav-empty {
      font-size: 1.05rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .gnav-search input,
    .gnav-cat {
      transition: none;
    }
  }
</style>
