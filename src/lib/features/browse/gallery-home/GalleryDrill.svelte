<!--
  GalleryDrill — the shell that owns the drill's public prop seam.

  It holds the section state, the search field, the content band, and the
  crossfade between the two products it dispatches to:

    GalleryLanding.svelte   — the editorial front door (hero doors + tiles)
    GalleryWorkspace.svelte — the filter workspace (every value editor)

  Both render the same CategoryTile from the same gallery-drill-catalog, so
  landing/workspace drift is impossible by construction. Consumers import this
  file only; the split (2026-08-04) did not change a single prop.

  Class names are drill-prefixed: the app carries GLOBAL `.tile`/`.head` rules
  that leak column layout into unprefixed names.
-->
<script lang="ts">
  import { onDestroy, type Snippet } from "svelte";
  import Crossfade from "$lib/shared/components/Crossfade.svelte";
  import { DURATION } from "$lib/shared/transitions/transitions";
  import {
    setResultsMorphActive,
    startMorph,
  } from "$lib/shared/transitions/results-morph";
  import { BrowseFilterType } from "$lib/shared/persistence/domain/enums/filtering-enums";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import {
    getDrillSection,
    setDrillSection,
  } from "$lib/features/browse/shared/services/gallery-view-persister";
  import { tryGetBrowseNavigationContext } from "$lib/shared/browse/context/browse-navigation-context";
  import type { FilterConnective } from "$lib/shared/browse/services/multi-filter";
  import GalleryLanding from "./GalleryLanding.svelte";
  import GalleryWorkspace from "./GalleryWorkspace.svelte";
  import CategoryRail from "./CategoryRail.svelte";
  import GallerySplitPane from "./GallerySplitPane.svelte";
  import {
    SCREEN_CLASS,
    SECTIONS,
    createGalleryCatalog,
    type CategoryEntry,
    type CollectionOption,
    type Section,
  } from "./gallery-drill-catalog.svelte";

  interface Props {
    pool?: readonly SequenceData[];
    /** Live count of results if this filter value were applied. */
    getCount: (type: BrowseFilterType, value: string | number) => number;
    /** Apply the chosen filter and hand off to the grid. Values with a
     * canonical color (loop components) pass it for the applied-filter chip. */
    onApply: (
      type: BrowseFilterType,
      value: string | number,
      label: string,
      color?: string
    ) => void;
    onShowAll?: () => void;
    onSearch?: (query: string) => void;
    /** Some hosts require at least one saved criterion, so "Show all" would
     * create an invalid state and should not be offered. */
    showAll?: boolean;
    /** Host-specific chooser copy without duplicating the drill surface. */
    chooserTitle?: string;
    chooserHint?: string;
    /** Loop-component values currently applied (e.g. "component:mirrored").
     * LOOP rows render active and toggle off on re-tap. */
    activeLoopValues?: ReadonlySet<string>;
    /** Sheet: toggle a loop component in place — the sheet stays open so
     * LOOPs STACK (a sequence can be mirrored AND swapped). */
    onToggleLoop?: (
      value: string,
      label: string,
      color: string,
      nowActive: boolean
    ) => void;
    /** How stacked LOOP values combine. */
    loopConnective?: FilterConnective;
    onLoopConnectiveChange?: (connective: FilterConnective) => void;
    /** TnD family ids currently applied (e.g. "split-same"). */
    activeFamilyValues?: ReadonlySet<string>;
    onToggleFamily?: (
      familyId: string,
      label: string,
      color: string,
      nowActive: boolean
    ) => void;
    familyConnective?: FilterConnective;
    onFamilyConnectiveChange?: (connective: FilterConnective) => void;
    /** "page" = the gallery front door (with search). "sheet" = the grid's
     * filter bottom sheet — same filter categories, no search. */
    variant?: "page" | "sheet";
    /** Persist the current sub-screen across remounts. */
    persistSection?: boolean;
    /** Show the Collections tile. */
    showCollections?: boolean;
    /** The collections this surface can FILTER by. When supplied the
     * Collections tile opens a value editor instead of ejecting to the Library
     * tab; when absent it keeps the navigation behavior. */
    collections?: readonly CollectionOption[];
    /** Opt into a fluid native-4K canvas. */
    fluidWideCanvas?: boolean;
    /** Present every available filter category as one decision canvas. */
    unifiedFilterChooser?: boolean;
    /** Recompose each value screen by its option count. */
    adaptiveValueLayout?: boolean;
    /** Keep the filter catalog beside the active value editor on desktop. */
    persistentDesktopCatalog?: boolean;
    /** Review and test surfaces can open a real drill screen directly. */
    initialSection?: Section;
    /** Hosts whose chrome must track the active screen listen here. */
    onSectionChange?: (section: Section) => void;
    /** Builder hosts: report whether a filter value is already part of the rule. */
    isValueApplied?: (
      type: BrowseFilterType,
      value: string | number
    ) => boolean;
    /** Builder hosts: every category stacks — tapping a value toggles it in
     * the rule and the editor stays open. */
    onToggleValue?: (
      type: BrowseFilterType,
      value: string | number,
      label: string,
      color: string | undefined,
      nowActive: boolean
    ) => void;
    /** Rendered as the right-hand LIVE results pane on wide screens. When
     * absent (sheets, narrow hosts), the step-through flow renders. */
    resultsPane?: Snippet;
    /** Rendered as the results pane's header (rule strip + count + Save). */
    resultsHeader?: Snippet;
    /** How many active rules each category carries, keyed by section key —
     * the count dot on the left column's catalog tiles. */
    ruleCounts?: Readonly<Record<string, number>>;
    /** Fires when the split pane opens or closes, so the host can retire its
     * own pinned rule strip and "View N results" button while it is live. */
    onSplitPaneChange?: (active: boolean) => void;
    /** Fires when the surface becomes (or stops being) wide enough to render
     * results live — true even while the editorial landing is on screen. The
     * host uses it to keep "Show all" inside the workspace instead of ejecting
     * to the full-page grid. */
    onSplitCapableChange?: (capable: boolean) => void;
    /** Bindable: open the pane on the full live grid with no active category.
     * "Show all" sets it from inside; a host can set it to bring the user into
     * the workspace instead of ejecting to the full-page grid tab. */
    showAllPane?: boolean;
    /** Drill height below which the split pane stays closed even past the
     * width seam. The pane's left column stacks the whole catalog (about
     * 445px of tiles) over the value editor, so a short host such as a modal
     * can clear 1240px of width and still leave the editor no room for one
     * row. 0 keeps the width-only decision for full-page hosts. */
    splitMinHeight?: number;
  }
  let {
    pool = [],
    getCount,
    onApply,
    onShowAll,
    onSearch,
    showAll = true,
    chooserTitle,
    chooserHint,
    activeLoopValues,
    onToggleLoop,
    loopConnective = "any",
    onLoopConnectiveChange,
    activeFamilyValues,
    onToggleFamily,
    familyConnective = "any",
    onFamilyConnectiveChange,
    variant = "page",
    persistSection,
    showCollections,
    collections,
    fluidWideCanvas = false,
    unifiedFilterChooser = false,
    adaptiveValueLayout = false,
    persistentDesktopCatalog = false,
    initialSection,
    onSectionChange,
    isValueApplied,
    onToggleValue,
    resultsPane,
    resultsHeader,
    ruleCounts,
    onSplitPaneChange,
    onSplitCapableChange,
    showAllPane = $bindable(false),
    splitMinHeight = 0,
  }: Props = $props();

  // Null inside the shared sequence picker, which composes this drill in a
  // modal with no Browse screen behind it. Only the Collections tile needs it,
  // and that tile is a `page`-variant affordance.
  const browseNavigation = tryGetBrowseNavigationContext();

  const shouldPersistSection = persistSection ?? variant === "page";
  const shouldShowCollections = showCollections ?? variant === "page";

  /** Persistent hosts restore their sub-screen across reload/HMR
   * (sessionStorage); a stale/unknown value degrades to the chooser. */
  function restoreSection(): Section {
    if (
      initialSection &&
      (SECTIONS as readonly string[]).includes(initialSection)
    ) {
      return initialSection;
    }
    if (!shouldPersistSection) return "chooser";
    const stored = getDrillSection();
    return stored && (SECTIONS as readonly string[]).includes(stored)
      ? (stored as Section)
      : "chooser";
  }
  let section = $state<Section>(restoreSection());
  $effect(() => {
    if (shouldPersistSection) setDrillSection(section);
  });
  $effect(() => {
    onSectionChange?.(section);
  });

  let drillWidth = $state(0);
  /** Live height, read off the same box as the width so the height gate on
   * the split pane can never disagree with the layout either. */
  let drillHeight = $state(0);
  /** Live width of the split pane's left column — the art tiers inside the
   * value editors follow IT, not the whole drill, once the pane is open. */
  let paneWidth = $state(0);
  let drillEl = $state<HTMLElement | null>(null);
  let query = $state("");

  const catalog = createGalleryCatalog({
    get pool() {
      return pool;
    },
    getCount: (type, value) => getCount(type, value),
    get onToggleLoop() {
      return onToggleLoop;
    },
    get activeLoopValues() {
      return activeLoopValues;
    },
    get onToggleFamily() {
      return onToggleFamily;
    },
    get activeFamilyValues() {
      return activeFamilyValues;
    },
    get onToggleValue() {
      return onToggleValue;
    },
    get isValueApplied() {
      return isValueApplied;
    },
    get unifiedFilterChooser() {
      return unifiedFilterChooser;
    },
    get showCollections() {
      return shouldShowCollections;
    },
    get collections() {
      return collections;
    },
    get drillWidth() {
      return drillWidth;
    },
    get fluidWideCanvas() {
      return fluidWideCanvas;
    },
  });

  // Keyboard focus follows navigation: without this, activating a tile or Back
  // leaves focus on a removed element and the browser drops it to <body>,
  // restarting tab order from the top of the document (WCAG 2.4.3).
  let previousSection: Section | null = null;
  $effect(() => {
    const current = section;
    if (previousSection === null) {
      previousSection = current;
      return;
    }
    if (current === previousSection) return;
    previousSection = current;
    // The incoming crossfade layer mounts this frame; the outgoing one is
    // still present, so target the new screen's class specifically.
    requestAnimationFrame(() => {
      drillEl
        ?.querySelector<HTMLElement>(`.${SCREEN_CLASS[current]} h2`)
        ?.focus();
    });
  });

  /** The editorial landing shows only when a host keeps it (no unified
   * chooser) AND no value editor is open. */
  const showLanding = $derived(section === "chooser" && !unifiedFilterChooser);

  // ── Split pane ──────────────────────────────────────────────────────────
  // The seam is 1240px of DRILL width, not viewport: below it the left column
  // (25–27.5rem) plus a results grid worth looking at stop fitting side by
  // side, and the step-through flow is the better shape. Measured off the same
  // clientWidth binding the art tiers use, so the JS decision and the layout
  // can never disagree the way a media query and a container query would.
  const SPLIT_SEAM = 1240;
  /** "Show all" above the seam opens the pane with NO active category: the
   * catalog on the left, the whole live grid on the right. Without this flag
   * the pane is keyed to an open value editor and Show all had nowhere to go
   * but the old full-page grid tab. Cleared on any return to the landing. */
  const splitCapable = $derived(
    Boolean(resultsPane) &&
      drillWidth >= SPLIT_SEAM &&
      (splitMinHeight <= 0 || drillHeight >= splitMinHeight)
  );
  const splitPane = $derived(splitCapable && (!showLanding || showAllPane));

  $effect(() => {
    onSplitPaneChange?.(splitPane);
  });
  $effect(() => {
    onSplitCapableChange?.(splitCapable);
  });
  // The pane is a wide-screen shape. Dragging below the seam (or a host that
  // never passes a results pane) must not strand the user on a category grid
  // with no way back to the landing.
  $effect(() => {
    if (!splitCapable && showAllPane) showAllPane = false;
  });

  // ── The landing ↔ workspace morph ───────────────────────────────────────
  // Same-document View Transitions: every category tile carries a stable
  // `gallery-cat-<key>` name (claimed, never stamped — see
  // claimed-view-transition-name), so the browser animates the landing's tiles
  // into their catalog slots in one choreographed pass. The claim moves with
  // the live surface: `morph` is true on whichever of landing/workspace is
  // becoming the screen, so the outgoing copy releases its names inside the
  // same flushSync the transition captures.
  let morphing = $state(false);
  function flipWithMorph(apply: () => void): void {
    morphing = true;
    const transition = startMorph(apply);
    if (!transition) {
      morphing = false;
      return;
    }
    void transition.finished
      .catch(() => {})
      .finally(() => {
        morphing = false;
      });
  }

  /** Enter a value editor. Morphs when it crosses the landing boundary.
   *
   * Deliberately NOT morphed for a category switch inside the pane: the app
   * disables `::view-transition-old/new(root)` globally
   * (`shared/transitions/view-transitions.css`), so a switch that moves no
   * NAMED element animates nothing and only buys a ~124ms capture freeze. The
   * per-section `<Crossfade>` already carries that swap. */
  function goToSection(next: Section): void {
    const crossesLanding =
      (section === "chooser") !== (next === "chooser") && !unifiedFilterChooser;
    const apply = () => {
      if (next === "chooser") showAllPane = false;
      section = next;
    };
    if (crossesLanding) flipWithMorph(apply);
    else apply();
  }

  /** "Show all" — above the seam it opens the workspace pane with no rules and
   * the full live grid; below it, today's hand-off to the full-page grid. The
   * host clears the rules either way (it reads `onSplitCapableChange`). */
  function handleShowAll(): void {
    if (!splitCapable) {
      onShowAll?.();
      return;
    }
    // Clear INSIDE the transition so the browser's "after" capture already has
    // the full grid — otherwise the rules drop a frame later and the results
    // repaint outside the morph.
    flipWithMorph(() => {
      showAllPane = true;
      section = "chooser";
      onShowAll?.();
    });
  }

  /** Wrap a live-results mutation so the grid animates instead of popping.
   *
   * This is the animation Austen was missing (diagnosed 2026-08-05). The
   * landing↔workspace morph fires on a path a working user almost never takes —
   * the section is restored from sessionStorage, so a reload lands straight in
   * the workspace and every move from there is a rail tap. Meanwhile the
   * biggest change on screen, a filter narrowing the results from 1412 cards to
   * 288, happened with no transition at all. Every card already carries a
   * `sequence-<id>` view-transition name, so one wrapped mutation makes the
   * grid rearrange instead of blink. Measured: ready 347ms, settled 657ms. */
  function withResultsMorph(apply: () => void): void {
    if (splitPane) flipWithMorph(apply);
    else apply();
  }

  /** Publish the live-grid claim so the paths that live OUTSIDE this component
   * — the rule strip's ×, the toolbar's search and sort, the empty state's
   * Clear all — morph through the same seam (`shared/transitions/results-morph`)
   * instead of each re-deriving whether motion is wanted. */
  const morphOwner = {};
  $effect(() => {
    setResultsMorphActive(morphOwner, splitPane);
  });
  onDestroy(() => setResultsMorphActive(morphOwner, false));

  /** Match any/all across a stacked category changes the result set as much as
   * a value tap does; it just arrives through a host callback. */
  function changeLoopConnective(connective: FilterConnective): void {
    withResultsMorph(() => onLoopConnectiveChange?.(connective));
  }
  function changeFamilyConnective(connective: FilterConnective): void {
    withResultsMorph(() => onFamilyConnectiveChange?.(connective));
  }

  function submitSearch(event: Event) {
    event.preventDefault();
    const q = query.trim();
    if (q) onSearch?.(q);
  }

  /** Single-valued categories: toggle in place when the host stacks,
   * otherwise the classic apply-and-hand-off. */
  function pickValue(
    type: BrowseFilterType,
    value: string | number,
    label: string,
    color?: string
  ) {
    withResultsMorph(() => {
      if (onToggleValue) {
        onToggleValue(
          type,
          value,
          label,
          color,
          !(isValueApplied?.(type, value) ?? false)
        );
      } else {
        onApply(type, value, label, color);
      }
    });
  }

  /** Controls that express "exactly one value" — the turn-limit slider. Moving
   * it REPLACES the applied limit (toggling would stack ≤1.5 and ≤2 into a rule
   * the slider cannot represent); a null value clears the category, so the
   * control that sets the rule also lifts it. One morph covers both mutations. */
  function pickExclusiveValue(
    type: BrowseFilterType,
    value: string | number | null,
    label: string,
    previous?: { value: string | number; label: string },
    color?: string
  ) {
    withResultsMorph(() => {
      if (onToggleValue) {
        if (previous && previous.value !== value) {
          onToggleValue(type, previous.value, previous.label, color, false);
        }
        if (value !== null) onToggleValue(type, value, label, color, true);
      } else if (value !== null) {
        onApply(type, value, label, color);
      }
    });
  }

  function pickLoop(v: { value: string; label: string; color: string }) {
    withResultsMorph(() => {
      if (onToggleLoop) {
        onToggleLoop(
          v.value,
          v.label,
          v.color,
          !(activeLoopValues?.has(v.value) ?? false)
        );
      } else {
        onApply(BrowseFilterType.LOOP_TYPE, v.value, v.label, v.color);
      }
    });
  }

  function pickFamily(v: { value: string; label: string; color: string }) {
    withResultsMorph(() => {
      if (onToggleFamily) {
        onToggleFamily(
          v.value,
          v.label,
          v.color,
          !(activeFamilyValues?.has(v.value) ?? false)
        );
      } else {
        onApply(BrowseFilterType.TND_FAMILY, v.value, v.label, v.color);
      }
    });
  }

  /** One tile handler for all three compositions: open an editor, apply a
   * single-valued category directly, or leave for Collections. */
  function selectCategory(entry: CategoryEntry) {
    if (entry.section) {
      goToSection(entry.section);
    } else if (entry.apply) {
      onApply(entry.apply.type, entry.apply.value, entry.apply.label);
    } else if (entry.navigate === "collections") {
      browseNavigation?.viewExploreCollections();
    }
  }

  const stackHint = onToggleValue
    ? "Tap several. A sequence can match any of them."
    : undefined;
  // The landing's Starting-letter glyph grows once the adaptive tier has room.
  const landingGlyphHeight = $derived(
    adaptiveValueLayout && drillWidth >= 700 && drillWidth < 900 ? 32 : 20
  );
</script>

{#snippet workspaceScreen()}
  <GalleryWorkspace
    {catalog}
    {section}
    drillWidth={splitPane ? paneWidth : drillWidth}
    sheet={variant === "sheet"}
    {splitPane}
    {unifiedFilterChooser}
    {adaptiveValueLayout}
    {persistentDesktopCatalog}
    {chooserTitle}
    {chooserHint}
    {stackHint}
    {isValueApplied}
    {activeLoopValues}
    {onToggleLoop}
    {loopConnective}
    onLoopConnectiveChange={onLoopConnectiveChange
      ? changeLoopConnective
      : undefined}
    {activeFamilyValues}
    {onToggleFamily}
    {familyConnective}
    onFamilyConnectiveChange={onFamilyConnectiveChange
      ? changeFamilyConnective
      : undefined}
    onBack={() => goToSection("chooser")}
    onPickValue={pickValue}
    onPickExclusiveValue={pickExclusiveValue}
    onPickLoop={pickLoop}
    onPickFamily={pickFamily}
    {onApply}
    onSelectCategory={selectCategory}
  />
{/snippet}

<div
  class="drill"
  data-section={section}
  class:sheet={variant === "sheet"}
  class:fluid-wide-canvas={fluidWideCanvas}
  class:unified-filter-chooser={unifiedFilterChooser}
  class:adaptive-value-layout={adaptiveValueLayout}
  class:persistent-desktop-catalog={persistentDesktopCatalog}
  class:split-pane={splitPane}
  bind:clientWidth={drillWidth}
  bind:clientHeight={drillHeight}
  bind:this={drillEl}
>
  <!-- Search renders wherever the host wires it — the page front door AND the
       filter sheet (the grid toolbar carries no search input; the sheet is the
       grid's complete find-surface). -->
  {#if onSearch}
    <form class="drill-search" role="search" onsubmit={submitSearch}>
      <i class="fas fa-magnifying-glass" aria-hidden="true"></i>
      <input
        type="search"
        bind:value={query}
        placeholder="Search sequences…"
        aria-label="Search sequences"
      />
    </form>
  {/if}

  <div class="drill-stage">
    <!-- Split pane: the left column stacks the category catalog over the
         active value editor; the right column is the live results grid. The
         left column re-declares `container-name: drill`, so every value
         editor's own container queries resolve against ITS ~420px width and
         the editors compose exactly as they do on a narrow screen — art
         preserved, never shrunk to chips (spec Risk 1). -->
    {#if splitPane}
      <GallerySplitPane
        {catalog}
        {section}
        {ruleCounts}
        idle={showLanding}
        onSelectCategory={selectCategory}
        {resultsHeader}
        {resultsPane}
        bind:paneWidth
      >
        {#snippet editor()}
          <Crossfade key={section} duration={DURATION.normal} fill>
            {@render workspaceScreen()}
          </Crossfade>
        {/snippet}
      </GallerySplitPane>
    {:else}
      <!-- The rail duplicates the editorial landing's own category tiles —
           hosts that keep that landing get the rail only beside VALUE editors,
           never beside the landing itself. -->
      {#if persistentDesktopCatalog && (unifiedFilterChooser || section !== "chooser")}
        <CategoryRail
          {catalog}
          {section}
          morph={!showLanding}
          onselect={selectCategory}
        />
      {/if}
      <div class="drill-editor-stage">
        <!-- fill mode: screens differ in height, so the content-sized
             grid-stack would resize (and shove neighbors) at every section
             change. The stage is the sized box; layers fill it and each
             screen scrolls itself. -->
        <Crossfade key={section} duration={morphing ? 0 : DURATION.normal} fill>
          {#if showLanding}
            <GalleryLanding
              {catalog}
              poolSize={pool.length}
              {showAll}
              {chooserTitle}
              {chooserHint}
              sheet={variant === "sheet"}
              {fluidWideCanvas}
              glyphHeight={landingGlyphHeight}
              morph={showLanding}
              onOpenSection={goToSection}
              onShowAll={onShowAll ? handleShowAll : undefined}
              onSelectCategory={selectCategory}
            />
          {:else}
            {@render workspaceScreen()}
          {/if}
        </Crossfade>
      </div>
    {/if}
  </div>
</div>

<style>
  /* The drill box never scrolls — each screen scrolls inside its Crossfade
     fill layer, so the stage keeps ONE fixed size across section changes and
     the transition can't shift anything. */
  .drill {
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
    padding: 0.9rem 1rem 1.25rem;
    overflow: hidden;
    /* Width-driven desktop layout below. inline-size containment only — the
       drill's height keeps flexing normally. */
    container-type: inline-size;
    container-name: drill;
  }
  /* Sheet variant: fills the fixed-height drawer body, top-aligned. */
  .drill.sheet {
    padding: 0.5rem 1rem 1rem;
  }
  .drill-search {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 0.6rem;
    padding: 0.55rem 0.9rem;
    border-radius: 999px;
    border: 1px solid var(--theme-border, #2a3140);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text-muted, #9aa6b8);
    max-width: 520px;
    margin: 0 auto;
    width: 100%;
    flex: 0 0 auto;
  }
  .drill-search input {
    flex: 1;
    min-width: 0;
    background: transparent;
    border: none;
    outline: none;
    color: var(--theme-text, #e8edf6);
    font-size: 0.95rem;
  }
  .drill-stage {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    max-width: 520px;
    margin: 0 auto;
    width: 100%;
  }
  .drill-editor-stage {
    position: relative;
    display: flex;
    width: 100%;
    min-width: 0;
    min-height: 0;
    flex: 1 1 0;
    flex-direction: column;
    overflow: hidden;
  }

  /* ── Split pane ──────────────────────────────────────────────────────
     Two content columns: filters left, LIVE results right. Opens at 1240px of
     drill width (see SPLIT_SEAM) — below that the columns stop fitting and the
     step-through flow is the better shape. The band goes fluid here: dead rail
     beside a results grid is exactly the 4K failure this project exists to
     end. */
  .drill.split-pane .drill-stage {
    width: 100%;
    max-width: none;
  }

  /* Mid tier: unfolded foldables + small tablets. */
  @container drill (min-width: 640px) and (max-width: 899.98px) {
    .drill-stage {
      max-width: 880px;
    }
  }

  /* Desktop (wide container). */
  @container drill (min-width: 900px) {
    .drill {
      gap: 1.25rem;
      padding: 1.5rem 2rem 2rem;
    }
    .drill-search {
      max-width: 640px;
      padding: 0.7rem 1.1rem;
    }
    .drill-stage {
      max-width: 1160px;
    }
  }

  /* Ultra-wide (4K-class). */
  @container drill (min-width: 1600px) {
    .drill-stage {
      max-width: 1760px;
    }
    .drill-search {
      max-width: 720px;
    }
    /* A focused full-screen host can opt into a band that grows through the
       three 4K tiers. */
    .drill.fluid-wide-canvas .drill-stage {
      max-width: clamp(110rem, 80cqw, 156rem);
    }
  }

  @container drill (max-width: 639.98px) {
    .drill.unified-filter-chooser {
      padding: 0.35rem 0.75rem 0.6rem;
    }
  }

  @container drill (min-width: 640px) {
    .drill.unified-filter-chooser .drill-stage,
    .drill.adaptive-value-layout .drill-stage {
      max-width: none;
    }
  }

  /* Smart Collection / gallery desktop composer. The catalog persists only
     while editing a value, so the first chooser remains a clean overview. */
  @media (min-height: 650px) {
    @container drill (min-width: 900px) {
      .drill.persistent-desktop-catalog:not(.split-pane) .drill-stage {
        width: min(100%, 96rem);
        max-width: none;
      }

      .drill.persistent-desktop-catalog:not(.split-pane):not(
          [data-section="chooser"]
        )
        .drill-stage {
        display: grid;
        grid-template-columns: clamp(15rem, 19cqw, 17.5rem) minmax(0, 1fr);
        gap: 1rem;
      }

      /* The split pane declares its own unified surface above — this legacy
         96%-opaque panel is the persistent-rail composition only. */
      .drill.persistent-desktop-catalog:not(.split-pane):not(
          [data-section="chooser"]
        )
        .drill-editor-stage {
        padding: 0.25rem;
        border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
        border-radius: 1.1rem;
        background: color-mix(
          in srgb,
          var(--theme-panel-bg, #11131a) 96%,
          transparent
        );
      }
    }
  }

  /* Tall desktop canvases: the rail steps with the pane (audit D-10). */
  @media (min-height: 1150px) {
    @container drill (min-width: 1200px) {
      .drill.persistent-desktop-catalog:not(.split-pane):not(
          [data-section="chooser"]
        )
        .drill-stage {
        grid-template-columns: clamp(17rem, 21cqw, 21rem) minmax(0, 1fr);
      }
    }
  }
</style>
