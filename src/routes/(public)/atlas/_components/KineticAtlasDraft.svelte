<script lang="ts">
  import "$lib/shared/landing/styles/public-editorial.css";
  import { onMount, tick } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import Crossfade from "$lib/shared/components/Crossfade.svelte";
  import { DURATION } from "$lib/shared/transitions/transitions";
  import GlossaryNav from "./GlossaryNav.svelte";
  import GlossaryTermDetail from "./GlossaryTermDetail.svelte";
  import KineticAtlasOverview from "./KineticAtlasOverview.svelte";
  import LetterCodex from "./LetterCodex.svelte";
  import CodexBoardSwitcher from "./codex-boards/CodexBoardSwitcher.svelte";
  import { readBoard, type BoardKey } from "./codex-boards/board-choice";
  import { mutateCurrentUrl } from "$lib/shared/navigation/services/url-state";
  import {
    matchesGlossaryTerm,
    normalizeGlossarySearchText,
  } from "../glossary-search";
  import { resolveCodexLetterQuery } from "../codex-letter-search";
  import {
    writeLetterExplorerRoute,
    type LetterExplorerRouteState,
  } from "./codex-boards/letter-explorer-url";
  import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import { RotationDirection } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import type { PageData } from "../$types";

  let { data }: { data: PageData } = $props();
  const desktopQuery = new MediaQuery("(min-width: 1024px)");

  // Placement-term slugs (from @tka/domain's GLOSSARY keys, see +page.server.ts)
  // that get a pictograph thumbnail in their detail view. Fixed-size PNGs,
  // present from first paint — no layout shift.
  const PLACEMENT_THUMBS: Record<string, { src: string; alt: string }> = {
    alpha: {
      src: "/images/position_images/alpha.png",
      alt: "Alpha placement pictograph",
    },
    beta: {
      src: "/images/position_images/beta.png",
      alt: "Beta placement pictograph",
    },
    gamma: {
      src: "/images/position_images/gamma.png",
      alt: "Gamma placement pictograph",
    },
  };

  const GLOSSARY_NAME = "The Kinetic Alphabet Glossary";
  const TITLE = "The Kinetic Atlas | The Kinetic Alphabet";
  const DESCRIPTION =
    "A visual atlas of The Kinetic Alphabet: space, motion, letters, notation, patterns, and technique, backed by a searchable reference.";
  const URL = "https://tkaflowarts.com/atlas";
  const LEXICON_ID = `${URL}#lexicon`;

  // schema.org graph: the page (CollectionPage) whose mainEntity is a
  // DefinedTermSet, one DefinedTerm per glossary entry (matches the visible
  // terms below), plus the breadcrumb trail. This is the entity/AEO payload —
  // it declares TKA the definitional source for its coined vocabulary.
  // Always built from the FULL data.groups, never the filtered view.
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": URL,
        url: URL,
        name: TITLE,
        description: DESCRIPTION,
        inLanguage: "en-US",
        isPartOf: { "@type": "WebSite", url: "https://tkaflowarts.com/" },
        about: {
          "@type": "Thing",
          name: "The Kinetic Alphabet",
          alternateName: ["TKA", "Flow Arts Notation"],
        },
        mainEntity: { "@id": LEXICON_ID },
      },
      {
        "@type": "DefinedTermSet",
        "@id": LEXICON_ID,
        name: GLOSSARY_NAME,
        url: URL,
        description: DESCRIPTION,
        hasDefinedTerm: data.groups.flatMap((g) =>
          g.terms.map((t) => ({
            "@type": "DefinedTerm",
            "@id": `${URL}#${t.slug}`,
            name: t.term,
            description: t.definition,
            inDefinedTermSet: LEXICON_ID,
          }))
        ),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Home",
            item: "https://tkaflowarts.com/",
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "The Kinetic Atlas",
            item: URL,
          },
        ],
      },
    ],
    // Escape "<" so a definition can't break out of the <script> element.
  }).replace(/</g, "\\u003c");

  // ── navigation state ──────────────────────────────────────────────────
  // Drill-down views: "landing" (Atlas overview) → one region/category → or
  // "all".
  // Inside a view the layout is master-detail: a term list (master) and, on
  // desktop, a sticky detail panel showing the selected term; on mobile the
  // selected row expands in place. EVERY term row and its full body stay in
  // the DOM at all times — views, search, and selection only toggle CSS
  // visibility — so the prerendered HTML (landing state) still carries all
  // definitions for SEO, and everything below is client-side enhancement.
  let query = $state("");
  let view = $state("landing");
  let selected = $state("");
  let codexInitialLetter = $state<string>(data.codex.letters[0] ?? "A");
  let drawerOpen = $state(false);
  let showBackTop = $state(false);
  let drawerCloseBtn: HTMLButtonElement | undefined = $state();

  type GlossaryTerm = (typeof data.groups)[number]["terms"][number];
  type GlossaryGroup = (typeof data.groups)[number];
  type NavigationGroup = {
    key: string;
    label: string;
    sectionSlug: string;
    terms: GlossaryTerm[];
    countLabel?: string;
  };

  const codexGroup: NavigationGroup = {
    key: data.codex.key,
    label: data.codex.label,
    sectionSlug: data.codex.sectionSlug,
    terms: [],
    countLabel: `${data.codex.letters.length}`,
  };

  function insertCodexGroup(groups: GlossaryGroup[]): NavigationGroup[] {
    // "position" is the external @tka/domain GlossaryCategory key (see
    // +page.server.ts) for what this UI displays as "Placements".
    const placementIndex = groups.findIndex((group) => group.key === "position");
    const insertionIndex = placementIndex >= 0 ? placementIndex + 1 : 0;
    return [
      ...groups.slice(0, insertionIndex),
      codexGroup,
      ...groups.slice(insertionIndex),
    ];
  }

  const landingGroups = insertCodexGroup(data.groups);
  const atlasRegionViewKey = (regionKey: string) => `atlas-${regionKey}`;
  const activeAtlasRegion = $derived(
    data.atlasRegions.find(
      (region) => atlasRegionViewKey(region.key) === view
    ) ?? null
  );

  // Static lookups (the lexicon never changes at runtime).
  const slugToCat = new Map<string, string>(
    data.groups.flatMap((g) => g.terms.map((t) => [t.slug, g.key] as const))
  );
  const slugToEntry = new Map<string, GlossaryTerm>(
    data.groups.flatMap((g) => g.terms.map((t) => [t.slug, t] as const))
  );
  const sectionSlugToKey = new Map<string, string>([
    ...data.groups.map((g) => [g.sectionSlug, g.key] as const),
    [data.codex.sectionSlug, data.codex.key] as const,
    ...data.atlasRegions
      .filter((region) => !region.includesCodex)
      .map(
        (region) =>
          [region.sectionSlug, atlasRegionViewKey(region.key)] as const
      ),
    ["all-terms", "all"],
  ]);

  const normalizedQuery = $derived(normalizeGlossarySearchText(query));
  const filtering = $derived(normalizedQuery.length > 0);
  // The Codex draws the canonical dataframe letters only, so search offers it
  // for those. Letters outside the dataframe stay text terms in the glossary.
  const codexSearchLetter = $derived(
    resolveCodexLetterQuery(query, data.codex.letters)
  );

  // Search always looks everywhere, regardless of the current drill.
  const searchGroups = $derived(
    !filtering
      ? data.groups
      : data.groups
          .map((g) => ({
            ...g,
            terms: g.terms.filter((t) =>
              matchesGlossaryTerm(t, normalizedQuery)
            ),
          }))
          .filter((g) => g.terms.length > 0)
  );
  const matchCount = $derived(
    filtering
      ? searchGroups.reduce((n, g) => n + g.terms.length, 0)
      : data.total
  );
  const matchSlugs = $derived(
    filtering
      ? new Set(searchGroups.flatMap((g) => g.terms.map((t) => t.slug)))
      : null
  );
  const matchedSections = $derived(
    filtering ? new Set<string>(searchGroups.map((g) => g.key)) : null
  );
  const codexOnlySearch = $derived(
    filtering && codexSearchLetter !== null && matchCount === 0
  );

  const landingShown = $derived(!filtering && view === "landing");
  // The Codex replaces the master-detail split with two letter-paper pages.
  // Two 8.5x11 pages need real width, so this view also releases the 18rem
  // category rail (the view header's back button is the way out) — the same
  // trade the landing hub already makes when its content wants the full band.
  const codexView = $derived(view === data.codex.key && !filtering);
  // The category rail (left sidebar) only earns its column once a drill-down
  // destination is chosen. On the landing view — even while filtering — the
  // page is a centered hub with its own search, so the empty rail is gone and
  // the content sits centered instead of shoved right by an 18rem placeholder.
  const landingView = $derived(view === "landing");

  // Which codex board is showing. It lives here, not in LetterCodex, because
  // its switcher rides in the category header row below rather than claiming a
  // row of its own - see _components/codex-boards/board-choice.ts. Scaffolding:
  // this and the switcher come out with the two losing boards.
  let codexBoard = $state<BoardKey>("atlas");
  function setCodexBoard(next: BoardKey): void {
    codexBoard = next;
    mutateCurrentUrl((url) => url.searchParams.set("board", next));
  }

  const selectedEntry = $derived(
    selected ? (slugToEntry.get(selected) ?? null) : null
  );
  const viewTitle = $derived(
    view === data.codex.key
      ? data.codex.label
      : view === "all"
        ? "All terms"
        : activeAtlasRegion
          ? `${activeAtlasRegion.label} Atlas`
          : (data.groups.find((g) => g.key === view)?.label ?? "")
  );
  const viewCountLabel = $derived(
    view === data.codex.key
      ? `${data.codex.letters.length} pictographs`
      : activeAtlasRegion
        ? activeAtlasRegion.countLabel
        : `${
            view === "all"
              ? data.total
              : (data.groups.find((g) => g.key === view)?.terms.length ?? 0)
          } terms`
  );

  function sectionShown(key: string): boolean {
    if (filtering) return matchedSections?.has(key) ?? false;
    if (activeAtlasRegion) {
      return activeAtlasRegion.groupKeys.some((groupKey) => groupKey === key);
    }
    return view === "all" || view === key;
  }

  // The sidebar rail is a CATEGORY nav (terms live in the master list only,
  // never twice on screen); under an active search its counts become
  // per-category match counts.
  const sidebarGroups = $derived(
    filtering
      ? codexSearchLetter
        ? insertCodexGroup(searchGroups)
        : searchGroups
      : activeAtlasRegion
        ? data.groups.filter((group) =>
            activeAtlasRegion.groupKeys.includes(group.key)
          )
        : landingGroups
  );

  const isDesktop = () => desktopQuery.current;

  function firstSlugOf(key: string): string {
    return data.groups.find((g) => g.key === key)?.terms[0]?.slug ?? "";
  }

  function enterCodex(letter?: string, writeUrl = true): void {
    codexInitialLetter = letter ?? data.codex.letters[0] ?? "A";
    query = "";
    view = data.codex.key;
    selected = "";

    if (!writeUrl) return;
    mutateCurrentUrl(
      (url) => {
        const state: LetterExplorerRouteState | null = letter
          ? {
              letter,
              gridMode: GridMode.DIAMOND,
              variation: 0,
              leftTurns: 0,
              rightTurns: 0,
              leftRotation: RotationDirection.CLOCKWISE,
              rightRotation: RotationDirection.CLOCKWISE,
            }
          : null;
        writeLetterExplorerRoute(url, state);
        url.hash = data.codex.sectionSlug;
      },
      { mode: "push" }
    );
  }

  function returnToAtlas(): void {
    view = "landing";
    selected = "";
    mutateCurrentUrl(
      (url) => {
        writeLetterExplorerRoute(url, null);
        url.hash = "";
      },
      { mode: "push" }
    );
  }

  function enterAtlasRegion(regionKey: string, writeUrl = true): void {
    const region = data.atlasRegions.find(
      (candidate) => candidate.key === regionKey
    );
    if (!region) return;
    if (region.includesCodex) {
      enterCodex(undefined, writeUrl);
      return;
    }

    query = "";
    view = atlasRegionViewKey(region.key);
    const firstGroup = data.groups.find((group) =>
      region.groupKeys.includes(group.key)
    );
    selected = isDesktop() ? (firstGroup?.terms[0]?.slug ?? "") : "";

    if (!writeUrl) return;
    mutateCurrentUrl(
      (url) => {
        writeLetterExplorerRoute(url, null);
        url.hash = region.sectionSlug;
      },
      { mode: "push" }
    );
  }

  /** Drill into a category (or "all"). Desktop auto-selects the first term so
   *  the detail panel is never empty; mobile waits for a tap. */
  function enterView(v: string, writeUrl = true) {
    if (v === data.codex.key) {
      enterCodex(undefined, writeUrl);
      return;
    }
    view = v;
    selected = isDesktop()
      ? v === "all"
        ? (data.groups[0]?.terms[0]?.slug ?? "")
        : firstSlugOf(v)
      : "";

    if (!writeUrl) return;
    mutateCurrentUrl(
      (url) => {
        writeLetterExplorerRoute(url, null);
        url.hash =
          v === "all"
            ? "all-terms"
            : (data.groups.find((group) => group.key === v)?.sectionSlug ?? "");
      },
      { mode: "push" }
    );
  }

  /** Row click: select on desktop (re-click keeps it), toggle on mobile. */
  function select(slug: string) {
    if (!isDesktop() && selected === slug) {
      selected = "";
      return;
    }
    selected = slug;
    mutateCurrentUrl((url) => {
      url.hash = slug;
    });
  }

  /** Select a term, make sure its category is on screen, and scroll to it.
   *  Used by sidebar term links, related-term chips, and #hash deep links. */
  async function reveal(slug: string, e?: Event) {
    e?.preventDefault();
    if (!slugToCat.has(slug)) return;
    if (filtering) query = ""; // leave search mode; the target may not match it
    const cat = slugToCat.get(slug);
    if (cat && view !== "all" && view !== cat) view = cat;
    selected = slug;
    await tick();
    const el = document.getElementById(slug);
    if (!el) return;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    el.scrollIntoView({
      behavior: reduced ? "auto" : "smooth",
      block: "nearest",
    });
    mutateCurrentUrl((url) => {
      url.hash = slug;
    });
  }

  /** Sidebar / drawer link handler: category headings drill, terms reveal. */
  async function handleNav(slug: string, e: MouseEvent) {
    drawerOpen = false;
    const catKey = sectionSlugToKey.get(slug);
    if (catKey) {
      e.preventDefault();
      if (filtering) query = "";
      enterView(catKey);
      await tick();
      // Land with the page title and category header visible. scrollIntoView
      // on .view-head with block:"start" shoved the header under the fixed
      // SiteHeader and left the auto-selected first row at the viewport top
      // (the jump-south bug, 2026-07-17); the whole drilled view starts at
      // the top of the page, so page-top IS the section start.
      if (window.scrollY > 0) {
        const reduced = window.matchMedia(
          "(prefers-reduced-motion: reduce)"
        ).matches;
        window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
      }
      return;
    }
    await reveal(slug, e);
  }

  // #hash deep link on load (e.g. a related-term link shared externally):
  // select the target term and scroll to it once hydrated. onMount, not
  // $effect - reveal() reads and writes reactive state, so an effect here
  // would re-fire on every search keystroke and yank the scroll position.
  //
  // A category slug (#cat-letter) drills into that category. The sidebar has
  // always linked categories that way, so the href was already a promise this
  // handler did not keep: pasting one landed on the category grid instead of
  // the category. It matters most for the codex, whose whole surface lives
  // inside one category and was otherwise unreachable by URL.
  onMount(() => {
    const syncNavigationFromUrl = (): void => {
      // URLSearchParams, not new URL(): this module shadows the global URL with
      // the page's canonical href constant.
      const searchParams = new URLSearchParams(window.location.search);
      codexBoard = readBoard(searchParams.get("board"));
      const slug = window.location.hash.slice(1);
      if (!slug) {
        view = "landing";
        selected = "";
        return;
      }
      const catKey = sectionSlugToKey.get(slug);
      if (catKey === data.codex.key) {
        const requestedLetter = searchParams.get("letter");
        const letter =
          requestedLetter !== null &&
          data.codex.letters.some(
            (candidateLetter) => candidateLetter === requestedLetter
          )
            ? requestedLetter
            : undefined;
        enterCodex(letter, false);
        return;
      }
      const atlasRegion = data.atlasRegions.find(
        (region) => atlasRegionViewKey(region.key) === catKey
      );
      if (atlasRegion) {
        enterAtlasRegion(atlasRegion.key, false);
        return;
      }
      if (catKey) {
        enterView(catKey, false);
        return;
      }
      if (slugToCat.has(slug)) void reveal(slug);
    };

    syncNavigationFromUrl();
    window.addEventListener("popstate", syncNavigationFromUrl);
    return () => window.removeEventListener("popstate", syncNavigationFromUrl);
  });

  // Drawer: lock body scroll and move focus in while open.
  $effect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    drawerCloseBtn?.focus();
    return () => {
      document.body.style.overflow = prev;
    };
  });

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      if (drawerOpen) drawerOpen = false;
      return;
    }
    if (e.key !== "/") return;
    const target = e.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable)
    ) {
      return;
    }
    // Focus whichever search box is rendered and visible at this breakpoint.
    const input = Array.from(
      document.querySelectorAll<HTMLInputElement>("input[data-glossary-search]")
    ).find((el) => el.offsetParent !== null);
    if (input) {
      e.preventDefault();
      input.focus();
    }
  }

  function backToTop() {
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
  }
</script>

<svelte:window
  onkeydown={onKeydown}
  onscroll={() => (showBackTop = window.scrollY > 700)}
/>

<svelte:head>
  <title>{TITLE}</title>
  <meta name="description" content={DESCRIPTION} />
  <link rel="canonical" href={URL} />

  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="The Kinetic Alphabet" />
  <meta property="og:locale" content="en_US" />
  <meta property="og:url" content={URL} />
  <meta property="og:title" content={TITLE} />
  <meta property="og:description" content={DESCRIPTION} />
  <meta
    property="og:image"
    content="https://tkaflowarts.com/branding/og-image.png"
  />

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:site" content="@tkaflowarts" />
  <meta name="twitter:title" content={TITLE} />
  <meta name="twitter:description" content={DESCRIPTION} />
  <meta
    name="twitter:image"
    content="https://tkaflowarts.com/branding/og-image.png"
  />

  {@html `<script type="application/ld+json">${jsonLd}</script>`}
</svelte:head>

<div
  class="glossary-shell"
  class:landing-hub={landingView}
  class:codex-view={codexView}
>
  <!-- ── desktop sidebar: search + category nav (terms render once, in the
       master list — the rail never repeats them). Hidden on the Atlas overview,
       which owns its search and region navigation. ── -->
  <aside class="glossary-sidebar" aria-label="Atlas navigation">
    <GlossaryNav
      groups={sidebarGroups}
      total={data.total}
      bind:query
      activeSlug={selected}
      activeCat={view}
      showCats={!landingShown}
      onNavigate={handleNav}
    />
  </aside>

  <div class="editorial" class:drilled={!landingView}>
    <!-- ── mobile: sticky filter bar + Contents drawer trigger ── -->
    <div class="mobile-bar" class:landing={landingView}>
      <div class="mb-search">
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
            class="mb-clear"
            aria-label="Clear filter"
            onclick={() => (query = "")}
          >
            <i class="fa-solid fa-xmark" aria-hidden="true"></i>
          </button>
        {/if}
      </div>
      <button
        type="button"
        class="mb-contents"
        onclick={() => (drawerOpen = true)}
        aria-haspopup="dialog"
      >
        <i class="fa-solid fa-list" aria-hidden="true"></i>
        Contents
      </button>
    </div>

    {#if landingView}
      <KineticAtlasOverview
        totalTerms={data.total}
        bind:query
        showMap={!filtering}
        onBrowseAll={() => enterView("all")}
      />
    {/if}

    {#if filtering}
      <p class="filter-status" aria-live="polite">
        {matchCount} of {data.total} terms match "{query.trim()}".{#if codexSearchLetter}
          Letter Codex also matches {codexSearchLetter}.{/if}
      </p>
    {:else if view !== "landing"}
      <div
        class="view-head"
        id={view === "all"
          ? "all-terms"
          : (activeAtlasRegion?.sectionSlug ??
            (codexView ? data.codex.sectionSlug : undefined))}
      >
        <button type="button" class="back-btn" onclick={returnToAtlas}>
          <i class="fa-solid fa-arrow-left" aria-hidden="true"></i>
          Atlas
        </button>
        <h2 class="view-title">{viewTitle}</h2>
        <span class="view-count">{viewCountLabel}</span>
        <!-- A category's own controls ride in this row rather than stacking a
             second full-width row under it. -->
        {#if codexView}
          <div class="view-tools">
            <CodexBoardSwitcher board={codexBoard} onchange={setCodexBoard} />
          </div>
        {/if}
      </div>
    {/if}

    {#if codexView}
      <div class="codex-host">
        {#key codexInitialLetter}
          <LetterCodex initialLetter={codexInitialLetter} board={codexBoard} />
        {/key}
      </div>
    {/if}

    <!-- master-detail: always in the DOM (SEO); hidden on the landing view -->
    {#key view}
      <div
        class="split"
        class:single-column={codexOnlySearch}
        class:sec-hidden={landingShown || codexView}
      >
        <div class="term-index">
          {#if filtering && codexSearchLetter}
            <button
              type="button"
              class="codex-search-result"
              onclick={() => enterCodex(codexSearchLetter)}
            >
              <span class="codex-result-kicker">Letter Codex</span>
              <strong>{codexSearchLetter}</strong>
              <span>Open its pictographs and variations</span>
              <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
            </button>
          {/if}

          {#each data.groups as g (g.key)}
            <section
              class="index-section"
              class:sec-hidden={!sectionShown(g.key)}
              id={g.sectionSlug}
            >
              {#if view === "all" || filtering || activeAtlasRegion}
                <span class="section-kicker">{g.label}</span>
              {/if}
              <ul class="term-rows">
                {#each g.terms as t (t.slug)}
                  <li
                    id={t.slug}
                    class="term-item"
                    class:hit-hidden={matchSlugs !== null &&
                      !matchSlugs.has(t.slug)}
                  >
                    <button
                      type="button"
                      class="term-row"
                      class:selected={selected === t.slug}
                      aria-expanded={selected === t.slug}
                      onclick={() => select(t.slug)}
                    >
                      <dfn class="row-name">{t.term}</dfn>
                      <span class="row-teaser">{t.definition}</span>
                      <i
                        class="fa-solid fa-chevron-down row-chev"
                        aria-hidden="true"
                      ></i>
                    </button>
                    <!-- mobile accordion body; the full entry lives in the DOM
                         at every breakpoint (crawlable), desktop just hides it
                         and shows the detail panel instead -->
                    <div class="row-body" class:open={selected === t.slug}>
                      <div class="row-body-inner">
                        <GlossaryTermDetail
                          entry={t}
                          thumb={PLACEMENT_THUMBS[t.slug] ?? null}
                          showTitle={false}
                          showLetterPictographs={selected === t.slug &&
                            !desktopQuery.current}
                          onrelated={(s, e) => reveal(s, e)}
                        />
                      </div>
                    </div>
                  </li>
                {/each}
              </ul>
            </section>
          {/each}

          {#if filtering && matchCount === 0 && !codexSearchLetter}
            <div class="no-results">
              <p>No terms match "{query.trim()}".</p>
              <button
                type="button"
                class="no-results-clear"
                onclick={() => (query = "")}
              >
                Clear filter
              </button>
            </div>
          {/if}
        </div>

        <aside
          class="detail-panel"
          class:sec-hidden={codexOnlySearch}
          aria-label="Term details"
        >
          <Crossfade key={selected || "none"} duration={DURATION.normal}>
            {#if selectedEntry}
              <GlossaryTermDetail
                entry={selectedEntry}
                thumb={PLACEMENT_THUMBS[selectedEntry.slug] ?? null}
                showLetterPictographs={desktopQuery.current}
                onrelated={(s, e) => reveal(s, e)}
              />
            {:else}
              <p class="detail-empty">Pick a term from the list.</p>
            {/if}
          </Crossfade>
        </aside>
      </div>
    {/key}

    {#if !codexView}
      <div class="cta-card">
        <h3>See the notation in motion</h3>
        <p>
          These terms come alive in the composer. Build a sequence and watch it
          animate.
        </p>
        <a class="cta-button" href="/create"
          >Open the Composer <i class="fa-solid fa-arrow-right"></i></a
        >
      </div>
    {/if}

    <p class="creator-credit">
      A reference for <a href="/history">Flow Arts History</a> ·
      <a href="/guide">Guide</a>
    </p>
  </div>
</div>

<!-- ── mobile Contents drawer ── -->
{#if drawerOpen}
  <div
    class="drawer"
    role="dialog"
    aria-modal="true"
    aria-label="Atlas contents"
  >
    <div class="drawer-head">
      <span class="drawer-title">Contents</span>
      <button
        type="button"
        class="drawer-close"
        aria-label="Close contents"
        bind:this={drawerCloseBtn}
        onclick={() => (drawerOpen = false)}
      >
        <i class="fa-solid fa-xmark" aria-hidden="true"></i>
      </button>
    </div>
    <div class="drawer-body">
      <GlossaryNav
        groups={sidebarGroups}
        total={data.total}
        bind:query
        activeSlug={selected}
        activeCat={view}
        showSearch={false}
        onNavigate={handleNav}
      />
    </div>
  </div>
{/if}

{#if showBackTop && !drawerOpen}
  <button
    type="button"
    class="back-top"
    aria-label="Back to top"
    onclick={backToTop}
  >
    <i class="fa-solid fa-arrow-up" aria-hidden="true"></i>
  </button>
{/if}

<style>
  /* ── two-column shell: sidebar + full-width article on wide screens ──
     The editorial column drops its 46rem cap inside this shell: the
     master-detail split and category grid are responsive and MEANT to use
     the full viewport (4K included). Prose measures are capped per-element
     (lede, detail text, CTA) instead of capping the whole column. */
  .glossary-sidebar {
    display: none;
  }
  @media (min-width: 1024px) {
    .glossary-shell {
      display: grid;
      grid-template-columns: 18rem minmax(0, 1fr);
      column-gap: 2rem;
      /* Same band as SiteHeader/SiteFooter (--shell-w + a 1.4rem gutter): the
         rail, the cards, and the logo line up on one edge. The old full-bleed
         shell ran ~500px wider than the header on 4K, which read as the page
         ignoring its own chrome. */
      max-width: var(--shell-w, min(1720px, 92vw));
      margin-inline: auto;
      padding: 0 1.4rem;
    }
    .glossary-shell .editorial {
      max-width: none;
      width: 100%;
      padding-left: 0;
      padding-right: 0;
    }
    .glossary-sidebar {
      /* Sticky full-height rail. Its own 88px top padding clears the fixed
         SiteHeader, mirroring .editorial's top padding, so the nav and the
         article start at the same visual line. */
      display: flex;
      flex-direction: column;
      position: sticky;
      top: 0;
      height: 100vh;
      padding: 88px 0 1.25rem;
    }
    /* The CTA fills the shell like everything else — a third, narrower
       measure under a full-width card grid is the mismatch Austen banned. */
    .cta-card {
      max-width: none;
    }
    /* Landing hub: no drill-down destination chosen yet, so the category rail
       is gone. The shell collapses to one column and the hub centers at a
       readable measure — the title and cards sit centered instead of shoved
       right by an empty 18rem placeholder. Drilling into a category restores
       the two-column workspace. */
    .glossary-shell.landing-hub {
      grid-template-columns: minmax(0, 1fr);
    }
    .glossary-shell.landing-hub .glossary-sidebar {
      display: none;
    }
    .glossary-shell.landing-hub .editorial {
      margin-left: auto;
      margin-right: auto;
    }
    /* Codex view: same one-column release as the hub. Two letter-paper pages
       side by side need ~1700px; with the 22rem rail in the way a 1920 screen
       leaves 1279px and both pages render at ~0.8x. Releasing the rail puts
       them at native size or better from 1920 up. */
    .glossary-shell.codex-view {
      grid-template-columns: minmax(0, 1fr);
    }
    .glossary-shell.codex-view .glossary-sidebar {
      display: none;
    }
  }
  /* ── big-screen tier ──
     1680, not 2200: a 4K monitor at Windows' 200% scaling reports a ~1920px
     CSS viewport, so a 2200 query never fires there. 1680 is the site-wide
     big-screen seam (public-editorial.css) — this page now shares it. */
  @media (min-width: 1680px) {
    .glossary-shell {
      grid-template-columns: 22rem minmax(0, 1fr);
      column-gap: 2.75rem;
    }
    /* CTA becomes a horizontal band: copy left, button right. Centered stacked
       copy inside a 1720px card leaves a lake of empty space on either side. */
    .cta-card {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      column-gap: 3rem;
      text-align: left;
      padding: 2.4rem 2.8rem;
    }
    .cta-card h3 {
      grid-column: 1;
    }
    .cta-card p {
      grid-column: 1;
      margin-bottom: 0;
    }
    .cta-card .cta-button {
      grid-column: 2;
      grid-row: 1 / span 2;
    }
  }

  /* ── drilled into a category: give the vertical back to the content ──
     The Atlas overview owns the editorial identity. Once a region opens,
     .view-head carries the local identity and controls in one compact row. */
  .editorial.drilled .view-head {
    margin: 0 0 0.6rem;
  }
  /* The 88px top padding is clearance for the 65px fixed SiteHeader plus the
     landing's own breathing room; drilled, 9px of clearance is the whole job.
     The 80px bottom is worse than dead: a board that ends exactly at the fold
     still scrolls 80px, so the page reports a scrollbar it does not need. */
  .editorial.drilled {
    padding-top: 74px;
    padding-bottom: 2.5rem;
  }
  /* ── mobile sticky bar: filter + Contents ── */
  .mobile-bar {
    position: sticky;
    top: 56px; /* pins just under the condensed SiteHeader */
    z-index: 40;
    display: flex;
    gap: 0.6rem;
    margin: 0 -0.25rem 0.5rem;
    padding: 0.6rem 0.25rem;
    background: oklch(0.13 0.015 270 / 0.85);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    border-bottom: 1px solid oklch(0.45 0.04 270 / 0.15);
  }
  .mobile-bar.landing {
    display: none;
  }
  @media (min-width: 1024px) {
    .mobile-bar {
      display: none;
    }
  }
  .mb-search {
    position: relative;
    display: flex;
    align-items: center;
    flex: 1;
    min-width: 0;
  }
  .mb-search > i {
    position: absolute;
    left: 0.85rem;
    font-size: 0.8rem;
    color: oklch(0.55 0.02 270);
    pointer-events: none;
  }
  .mb-search input {
    width: 100%;
    min-height: 44px;
    padding: 0.5rem 2.6rem 0.5rem 2.35rem;
    font: inherit;
    font-size: 1rem; /* 16px floor keeps iOS from zooming the viewport */
    color: oklch(0.94 0.01 270);
    background: oklch(0.18 0.02 270 / 0.55);
    border: 1px solid oklch(0.45 0.04 270 / 0.25);
    border-radius: 12px;
    outline: none;
  }
  .mb-search input::placeholder {
    color: oklch(0.55 0.02 270);
  }
  .mb-search input:focus-visible {
    border-color: oklch(0.65 0.13 275 / 0.7);
  }
  .mb-search input::-webkit-search-cancel-button {
    -webkit-appearance: none;
    appearance: none;
  }
  .mb-clear {
    all: unset;
    box-sizing: border-box;
    position: absolute;
    right: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 44px;
    min-height: 44px;
    color: oklch(0.65 0.02 270);
    cursor: pointer;
  }
  .mb-contents {
    all: unset;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 44px;
    padding: 0 1rem;
    font-size: 0.9rem;
    font-weight: 600;
    color: oklch(0.9 0.015 270);
    background: oklch(0.24 0.03 272 / 0.5);
    border: 1px solid oklch(0.5 0.06 272 / 0.35);
    border-radius: 12px;
    cursor: pointer;
  }
  .mb-contents:focus-visible {
    outline: 2px solid oklch(0.65 0.13 275);
    outline-offset: 2px;
  }

  /* ── drilled view header: back + category title + count + the category's own
       controls, all on one line ── */
  .view-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.6rem 1rem;
    margin: 0 0 1.4rem;
  }
  /* Pushed to the far end, and allowed to drop to its own line only when the
     row genuinely runs out of width (narrow phones). */
  .view-tools {
    margin-left: auto;
  }
  .back-btn {
    all: unset;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 44px;
    padding: 0 1.1rem;
    font-size: 0.88rem;
    font-weight: 600;
    color: oklch(0.9 0.015 270);
    background: oklch(0.24 0.03 272 / 0.5);
    border: 1px solid oklch(0.5 0.06 272 / 0.35);
    border-radius: 999px;
    cursor: pointer;
    transition:
      border-color 160ms ease,
      background 160ms ease;
  }
  .back-btn:hover {
    background: oklch(0.28 0.05 273 / 0.6);
    border-color: oklch(0.6 0.11 274 / 0.6);
  }
  .back-btn:focus-visible {
    outline: 2px solid oklch(0.65 0.13 275);
    outline-offset: 2px;
  }
  .view-title {
    font-size: clamp(1.3rem, 1.15rem + 0.5vw, 1.7rem);
    font-weight: 680;
    letter-spacing: -0.015em;
    text-wrap: balance;
    color: oklch(0.96 0.01 270);
    margin: 0;
  }
  .view-count {
    font-size: 0.85rem;
    font-variant-numeric: tabular-nums;
    color: oklch(0.6 0.02 270);
  }

  .filter-status {
    margin: 0 auto 1.5rem;
    text-align: center;
    font-size: 0.95rem;
    color: oklch(0.72 0.015 270);
  }

  /* The Codex is a reference tool, not a term-detail card: it gets the full
     article column and lays out its own board and detail panel inside. No
     frame and no fixed height — it is page content like every other section,
     so it reflows with the band and the PAGE scrolls, rather than a scroller
     nested inside a scroller. */
  .codex-host {
    min-width: 0;
    margin: 0 0 3rem;
  }

  .codex-view .codex-host {
    margin-bottom: 0.75rem;
  }

  /* The full SiteFooter carries a 4.5rem handoff above itself. Let the Codex
     claim the rest of the first viewport so that handoff begins at the fold:
     the footer is either fully below the page content or deliberately reached
     by scrolling, never stranded as a partial footer under a compressed board. */
  .codex-view .editorial {
    min-height: calc(100dvh - 4.5rem);
  }

  .codex-search-result {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    grid-template-areas:
      "letter kicker arrow"
      "letter detail arrow";
    align-items: center;
    gap: 0.15rem 1rem;
    width: 100%;
    min-height: 44px;
    margin: 0 0 1rem;
    padding: 1rem 1.1rem;
    color: oklch(0.94 0.015 270);
    text-align: left;
    background: oklch(0.2 0.035 274 / 0.62);
    border: 1px solid oklch(0.58 0.11 275 / 0.45);
    border-radius: 0.9rem;
    cursor: pointer;
    transition:
      border-color 160ms ease,
      background 160ms ease;
  }
  .codex-search-result:hover {
    background: oklch(0.24 0.05 275 / 0.7);
    border-color: oklch(0.7 0.14 275 / 0.7);
  }
  .codex-search-result:focus-visible {
    outline: 2px solid oklch(0.7 0.14 275);
    outline-offset: 2px;
  }
  .codex-search-result strong {
    grid-area: letter;
    font-family: Georgia, "Times New Roman", serif;
    font-size: 1.65rem;
  }
  .codex-result-kicker {
    grid-area: kicker;
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 700;
  }
  .codex-search-result > span:last-of-type {
    grid-area: detail;
    font-size: var(--font-size-compact, 0.75rem);
    color: oklch(0.68 0.025 272);
  }
  .codex-search-result > i {
    grid-area: arrow;
    color: oklch(0.72 0.09 275);
  }

  .split {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    margin-bottom: 3rem;
  }
  @media (min-width: 1024px) {
    .split {
      grid-template-columns: minmax(20rem, 30rem) minmax(0, 1fr);
      column-gap: 1.75rem;
      align-items: start;
    }
    .split.single-column {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  @media (min-width: 1680px) {
    .split {
      grid-template-columns: minmax(22rem, 30rem) minmax(0, 1fr);
      column-gap: 2.5rem;
    }
  }

  .index-section {
    margin: 0 0 1.6rem;
  }
  .index-section .section-kicker {
    padding: 0 0.85rem;
    margin-bottom: 0.35rem;
  }

  .term-rows {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .term-item {
    border-bottom: 1px solid oklch(0.5 0.03 270 / 0.1);
    scroll-margin-top: 130px; /* deep links clear the header + mobile bar */
  }
  .term-item:last-child {
    border-bottom: none;
  }

  .term-row {
    all: unset;
    box-sizing: border-box;
    display: grid;
    grid-template-columns: minmax(8rem, auto) minmax(0, 1fr) auto;
    align-items: center;
    column-gap: 0.9rem;
    width: 100%;
    min-height: 48px;
    padding: 0.55rem 0.85rem;
    cursor: pointer;
    border: 1px solid transparent;
    border-radius: 10px;
    transition:
      background 140ms ease,
      border-color 140ms ease;
  }
  .term-row:hover {
    background: oklch(0.22 0.025 272 / 0.4);
  }
  .term-row:focus-visible {
    outline: 2px solid oklch(0.65 0.13 275);
    outline-offset: -2px;
  }
  /* Selection marks the full row. Weight stays fixed, so choosing another
     term changes the surface without moving the text. */
  .term-row.selected {
    background: oklch(0.28 0.05 275 / 0.35);
    border-color: oklch(0.72 0.14 275);
    box-shadow: 0 0 0 1px oklch(0.72 0.14 275 / 0.28);
  }
  .row-name {
    font-size: 0.95rem;
    font-weight: 620;
    font-style: normal; /* override <dfn> italics */
    color: oklch(0.93 0.012 270);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .term-row.selected .row-name {
    color: oklch(0.9 0.09 275);
  }
  .row-teaser {
    /* One line, clean end-ellipsis: truncation always happens at the same
       visual edge instead of clamp-wrapping mid-thought. */
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.85rem;
    color: oklch(0.6 0.015 270);
  }
  .row-chev {
    font-size: 0.7rem;
    color: oklch(0.55 0.03 270);
    transition:
      transform 200ms ease,
      color 160ms ease;
  }
  .term-row[aria-expanded="true"] .row-chev {
    transform: rotate(180deg);
    color: oklch(0.75 0.1 275);
  }

  /* Mobile accordion body: 0fr -> 1fr keeps the full entry in the DOM
     (crawlable) and animates open height without measuring. */
  .row-body {
    display: grid;
    grid-template-rows: 0fr;
    transition: grid-template-rows 240ms ease;
  }
  .row-body.open {
    grid-template-rows: 1fr;
  }
  .row-body-inner {
    overflow: hidden;
    min-height: 0;
    padding: 0 0.85rem;
  }
  .row-body.open .row-body-inner {
    padding: 0.4rem 0.85rem 1.2rem;
  }

  /* Desktop: rows drive the sticky detail panel instead of expanding. */
  .detail-panel {
    display: none;
  }
  @media (min-width: 1024px) {
    .row-chev,
    .row-body {
      display: none;
    }
    .detail-panel {
      display: block;
      position: sticky;
      top: 84px;
      max-height: calc(100vh - 100px);
      overflow-y: auto;
      overscroll-behavior: contain;
      padding: 1.6rem 1.75rem;
      background: oklch(0.16 0.018 270 / 0.45);
      border: 1px solid oklch(0.4 0.04 270 / 0.14);
      border-radius: 18px;
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      scrollbar-width: thin;
      scrollbar-color: oklch(0.4 0.03 270 / 0.5) transparent;
    }
    .detail-panel::-webkit-scrollbar {
      width: 6px;
    }
    .detail-panel::-webkit-scrollbar-thumb {
      background: oklch(0.4 0.03 270 / 0.5);
      border-radius: 3px;
    }
  }
  .detail-empty {
    margin: 0;
    font-size: 0.95rem;
    color: oklch(0.6 0.02 270);
  }

  .no-results {
    text-align: center;
    padding: 2rem 0 1rem;
  }
  .no-results p {
    font-size: 1.05rem;
    color: oklch(0.72 0.015 270);
    margin: 0 0 1.2rem;
  }
  .no-results-clear {
    all: unset;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    padding: 0 1.4rem;
    font-size: 0.95rem;
    font-weight: 600;
    color: oklch(0.92 0.015 272);
    background: oklch(0.26 0.04 273 / 0.5);
    border: 1px solid oklch(0.55 0.09 273 / 0.4);
    border-radius: 999px;
    cursor: pointer;
  }
  .no-results-clear:focus-visible {
    outline: 2px solid oklch(0.65 0.13 275);
    outline-offset: 2px;
  }

  .sec-hidden,
  .hit-hidden {
    display: none;
  }

  .drawer {
    position: fixed;
    inset: 0;
    z-index: 200;
    display: flex;
    flex-direction: column;
    background: oklch(0.13 0.015 270 / 0.96);
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
    padding: 0.75rem 1.1rem calc(1rem + env(safe-area-inset-bottom));
  }
  .drawer-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
    margin-bottom: 0.5rem;
  }
  .drawer-title {
    font-size: 1.05rem;
    font-weight: 680;
    color: oklch(0.95 0.01 270);
  }
  .drawer-close {
    all: unset;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 44px;
    min-height: 44px;
    border-radius: 10px;
    font-size: 1.15rem;
    color: oklch(0.75 0.02 270);
    cursor: pointer;
  }
  .drawer-close:focus-visible {
    outline: 2px solid oklch(0.65 0.13 275);
    outline-offset: -2px;
  }
  .drawer-body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .back-top {
    all: unset;
    box-sizing: border-box;
    position: fixed;
    right: 1.25rem;
    bottom: calc(1.25rem + env(safe-area-inset-bottom));
    z-index: 60;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    color: oklch(0.9 0.015 270);
    background: oklch(0.22 0.03 272 / 0.75);
    border: 1px solid oklch(0.5 0.06 272 / 0.4);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    cursor: pointer;
    transition:
      background 160ms ease,
      transform 160ms ease;
  }
  .back-top:hover {
    background: oklch(0.28 0.05 273 / 0.85);
    transform: translateY(-2px);
  }
  .back-top:focus-visible {
    outline: 2px solid oklch(0.65 0.13 275);
    outline-offset: 2px;
  }

  .creator-credit a {
    color: oklch(0.6 0.1 275);
    text-decoration: none;
  }
  .creator-credit a:hover {
    color: oklch(0.8 0.08 275);
  }

  /* ── entry motion: one orchestrated fade-up when a view mounts ── */
  @media (prefers-reduced-motion: no-preference) {
    .view-head,
    .split {
      animation: gl-fadeup 260ms cubic-bezier(0.22, 0.7, 0.35, 1) both;
    }
    @keyframes gl-fadeup {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
  }

  /* ── tiny screens (iPhone SE class, ≤400px) ── */
  @media (max-width: 400px) {
    .glossary-shell .editorial {
      padding-left: 0.85rem;
      padding-right: 0.85rem;
    }
    .mobile-bar {
      gap: 0.45rem;
    }
    .mb-contents {
      padding: 0 0.8rem;
    }
    .view-head {
      gap: 0.7rem;
      flex-wrap: wrap;
    }
    .term-row {
      grid-template-columns: minmax(0, 1fr) auto;
      column-gap: 0.6rem;
    }
    .row-teaser {
      display: none; /* name + chevron only; the tap reveals the entry */
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .back-top,
    .back-btn,
    .codex-search-result,
    .term-row,
    .row-chev,
    .row-body {
      transition: none;
    }
    .back-top:hover {
      transform: none;
    }
  }
</style>
