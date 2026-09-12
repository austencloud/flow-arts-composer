<!--
FilterWorkspace.svelte

The split-pane filter workspace: category catalog + value editor on the left,
rule strip and live results on the right. Extracted from BrowseModule so the
gallery and the Library render the SAME workspace rather than two compositions
of the same parts — the Library previously reached GalleryDrill through the
`variant="sheet"` drawer, which passed no collections, no rule counts, no
applied state and no connectives, so half the workspace simply wasn't there.

Gallery and Library differ by SOURCE, not by interaction: one engine over the
community pool, one over my-library. Everything else is this component.

Hosts own two things: the results pane (their own BrowsePanel, with their own
selection / empty-state / navigation wiring) and `onEject`, the below-seam
escape to a full-page grid. A host that has no such grid omits `onEject` and
the below-seam actions mutate the engine in place.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import GalleryDrill from "$lib/features/browse/gallery-home/GalleryDrill.svelte";
  import type {
    CollectionOption,
    Section,
  } from "$lib/features/browse/gallery-home/gallery-drill-catalog.svelte";
  import FilterRuleStrip from "$lib/shared/browse/components/FilterRuleStrip.svelte";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import { startMorph } from "$lib/shared/transitions/results-morph";
  import { BrowseFilterType } from "$lib/shared/persistence/domain/enums/filtering-enums";
  import type { BrowseEngine } from "$lib/shared/browse/engine/types";
  import {
    SECTION_FOR_FILTER_TYPE,
    type WorkspaceSection,
  } from "$lib/shared/browse/domain/workspace-sections";

  let {
    engine,
    collections = [],
    resultsPane,
    resultsActions,
    showViewResultsAction = true,
    onSaveSmart,
    onEject,
    onClose,
    splitMinHeight = 0,
  }: {
    engine: BrowseEngine;
    collections?: CollectionOption[];
    resultsPane: Snippet;
    /** Host-owned outcome placed beside the live result count. */
    resultsActions?: Snippet;
    /** Supporting hosts can keep their own outcome instead of the grid handoff. */
    showViewResultsAction?: boolean;
    onSaveSmart?: () => void;
    /** Optional host outcome for a supporting filter pane. Rules stay active. */
    onClose?: () => void;
    /**
     * Below the split-pane seam there is no live results column, so "View N
     * results" / "Show all" hand off to a full-page grid. The host runs the
     * mutation inside whatever warm-up its grid needs. Omit it and the
     * mutation just runs.
     */
    onEject?: (mutate: () => void) => void;
    /** Forwarded to the drill: a short host (a modal) can be wide enough for
     * the split pane and still too short for its stacked left column. */
    splitMinHeight?: number;
  } = $props();

  const eject = (mutate: () => void) => (onEject ? onEject(mutate) : mutate());

  // Remount seed: editing a strip chip reopens the drill ON that filter's
  // editor instead of the chooser.
  let drillSeed = $state<{ section?: WorkspaceSection }>({});

  function editFilter(type: BrowseFilterType): void {
    // The drill remounts on edit, so clear the persisted collapse first. The
    // requested editor then arrives visible instead of opening off-screen.
    try {
      localStorage.removeItem("tka-filter-pane-collapsed");
    } catch {
      // Locked-down embeds can deny storage; the remounted drill uses its
      // expanded fallback in that environment.
    }
    drillSeed = { section: SECTION_FOR_FILTER_TYPE[type] };
  }

  const loopKeyByValue = $derived(
    new Map(
      [...engine.activeFilters]
        .filter(([, f]) => f.type === BrowseFilterType.LOOP_TYPE && !f.locked)
        .map(([key, f]) => [String(f.value), key])
    )
  );
  const activeLoopValues = $derived(new Set(loopKeyByValue.keys()));
  const familyKeyByValue = $derived(
    new Map(
      [...engine.activeFilters]
        .filter(([, f]) => f.type === BrowseFilterType.TND_FAMILY && !f.locked)
        .map(([key, f]) => [String(f.value), key])
    )
  );
  const activeFamilyValues = $derived(new Set(familyKeyByValue.keys()));

  // Which category each active rule belongs to, so the split pane's catalog
  // tiles can carry a count dot.
  const ruleCounts = $derived.by(() => {
    const counts: Record<string, number> = {};
    for (const f of engine.activeFilters.values()) {
      if (f.locked) continue;
      const key = SECTION_FOR_FILTER_TYPE[String(f.type)];
      if (key) counts[key] = (counts[key] ?? 0) + 1;
    }
    // The Collections tile's catalog key is plural; its section is singular.
    if (counts["collection"]) counts["collections"] = counts["collection"];
    return counts;
  });

  const appliedValueKeys = $derived(
    new Set(
      [...engine.activeFilters.values()]
        .filter((f) => !f.locked)
        .map((f) => `${f.type}:${String(f.value)}`)
    )
  );

  // True while the drill is rendering results live beside the filters. The
  // pinned strip and "View N results" belong to the step-through flow only;
  // with the grid on screen they are noise (and a second, contradicting count).
  let splitPaneActive = $state(false);
  // Wide enough for live results even while the editorial landing is up. "Show
  // all" reads this to decide between opening the pane and ejecting to the grid.
  let splitCapable = $state(false);
  // Bound into the drill: opens its pane on the full live grid with no active
  // category (the destination "Show all" / "View N results" used to eject to).
  let showAllPane = $state(false);
  // Which screen the drill is on. Inside a value editor the pinned strip is
  // rendered before any rule exists, so applying the first one changes the
  // strip's text and not the position of the card that was just tapped: on a
  // phone the strip and its button used to arrive together and push the
  // level cards 110px down under the user's thumb.
  let drillSection = $state<Section>("chooser");
  const stripReserved = $derived(
    showViewResultsAction && drillSection !== "chooser"
  );
</script>

<!-- The workspace's right-hand column: the rule as a header, the live grid
     underneath. Both are the SHARED components the step-through flow and the
     grid tab already use — never a copy. -->
{#snippet resultsHeader()}
  <span
    class="strip-count strip-motion-anchor"
    style:view-transition-name="gallery-rule-count"
    aria-live="polite"
  >
    {engine.resultCount}
    {engine.resultCount === 1 ? "match" : "matches"}
  </span>
  {#if engine.hasActiveFilters}
    <FilterRuleStrip
      filters={engine.allFilterChips.filter((c) => !c.locked)}
      connectives={engine.connectives}
      motionScope="gallery-rule"
      onEditFilter={editFilter}
      onRemoveFilter={(key) => startMorph(() => engine.removeFilter(key))}
    />
  {:else}
    <span class="strip-empty">No filters yet. Pick one on the left.</span>
  {/if}
  {#if resultsActions || onSaveSmart || onClose}
    <div
      class="strip-actions strip-motion-anchor"
      style:view-transition-name="gallery-rule-actions"
    >
      {@render resultsActions?.()}
      {#if onSaveSmart}
        <PanelButton
          variant="secondary"
          ariaLabel="Save these filters as a Smart Collection"
          onclick={onSaveSmart}
        >
          <i class="fas fa-wand-magic-sparkles" aria-hidden="true"></i>
          Save
        </PanelButton>
      {/if}
      {#if onClose}
        <PanelButton
          variant="primary"
          ariaLabel="Close filters and view results"
          onclick={onClose}
        >
          Done
        </PanelButton>
      {/if}
    </div>
  {/if}
{/snippet}

<div class="gallery-workspace">
  {#if onClose && !splitPaneActive && !engine.hasActiveFilters}
    <div class="workspace-close">
      <PanelButton
        variant="primary"
        ariaLabel="Close filters and view results"
        onclick={onClose}
      >
        Done
      </PanelButton>
    </div>
  {/if}
  {#if (engine.hasActiveFilters || resultsActions || stripReserved) && !splitPaneActive}
    <div class="gallery-rule-strip" aria-label="Current filters">
      <span
        class="strip-count strip-motion-anchor"
        style:view-transition-name="gallery-rule-count"
        aria-live="polite"
      >
        {engine.resultCount}
        {engine.resultCount === 1 ? "match" : "matches"}
      </span>
      {#if engine.hasActiveFilters}
        <FilterRuleStrip
          filters={engine.allFilterChips.filter((c) => !c.locked)}
          connectives={engine.connectives}
          motionScope="gallery-rule"
          onEditFilter={editFilter}
          onRemoveFilter={(key) => startMorph(() => engine.removeFilter(key))}
        />
      {:else}
        <span
          class="strip-empty strip-motion-anchor"
          style:view-transition-name="gallery-rule-empty"
          >No filters yet. The whole library is ready.</span
        >
      {/if}
      <div
        class="strip-actions strip-motion-anchor"
        style:view-transition-name="gallery-rule-actions"
      >
        {@render resultsActions?.()}
        {#if showViewResultsAction}
          <PanelButton
            variant="primary"
            onclick={() => {
              // Above the seam this opens the workspace's own live pane; a
              // desktop user is never handed to the "Start here" screen. Below
              // it, the host's full-page grid.
              if (splitCapable) showAllPane = true;
              else eject(() => {});
            }}
          >
            View {engine.resultCount} results
          </PanelButton>
        {/if}
        {#if onSaveSmart}
          <PanelButton
            variant="secondary"
            ariaLabel="Save these filters as a Smart Collection"
            onclick={onSaveSmart}
          >
            <i class="fas fa-wand-magic-sparkles" aria-hidden="true"></i>
            Save
          </PanelButton>
        {/if}
        {#if onClose}
          <PanelButton
            variant="primary"
            ariaLabel="Close filters and view results"
            onclick={onClose}
          >
            Done
          </PanelButton>
        {/if}
      </div>
    </div>
  {/if}
  {#key drillSeed}
    <GalleryDrill
      pool={engine.allSequences}
      adaptiveValueLayout
      persistentDesktopCatalog
      fluidWideCanvas
      initialSection={drillSeed.section}
      getCount={(type, value) => engine.getFilteredCount(type, value)}
      isValueApplied={(type, value) =>
        appliedValueKeys.has(`${type}:${String(value)}`)}
      onApply={(type, value, label, color) =>
        engine.addFilter(type, value, label, color ?? "#6aa0ff")}
      onToggleValue={(type, value, label, color, nowActive) => {
        // The workspace never bounces: values toggle in place and the strip +
        // counts recompose live.
        if (nowActive) {
          engine.addFilter(type, value, label, color ?? "#6aa0ff");
        } else {
          // Stacking categories (LOOPs, T&D, and the OR-stacking set) key per
          // value; single-valued ones key by bare type because re-adding
          // replaces. Removing the wrong key is a SILENT no-op, so remove
          // whichever one the engine holds.
          const perValue = `${type}:${String(value)}`;
          engine.removeFilter(
            engine.activeFilters.has(perValue) ? perValue : String(type)
          );
        }
      }}
      {activeLoopValues}
      loopConnective={engine.connectives[String(BrowseFilterType.LOOP_TYPE)] ??
        "any"}
      onLoopConnectiveChange={(connective) =>
        engine.setConnective(BrowseFilterType.LOOP_TYPE, connective)}
      onToggleLoop={(
        value: string,
        label: string,
        color: string,
        nowActive: boolean
      ) => {
        if (nowActive) {
          engine.addFilter(BrowseFilterType.LOOP_TYPE, value, label, color);
        } else {
          const key = loopKeyByValue.get(value);
          if (key) engine.removeFilter(key);
        }
      }}
      {activeFamilyValues}
      familyConnective={engine.connectives[
        String(BrowseFilterType.TND_FAMILY)
      ] ?? "any"}
      onFamilyConnectiveChange={(connective) =>
        engine.setConnective(BrowseFilterType.TND_FAMILY, connective)}
      onToggleFamily={(
        familyId: string,
        label: string,
        color: string,
        nowActive: boolean
      ) => {
        if (nowActive) {
          engine.addFilter(BrowseFilterType.TND_FAMILY, familyId, label, color);
        } else {
          const key = familyKeyByValue.get(familyId);
          if (key) engine.removeFilter(key);
        }
      }}
      onShowAll={() => {
        // Above the seam the drill opens its own pane on the full live grid.
        // Below it, the host's grid.
        if (splitCapable) engine.clearUserFilters();
        else eject(() => engine.clearUserFilters());
      }}
      {ruleCounts}
      {collections}
      onSplitPaneChange={(active) => (splitPaneActive = active)}
      onSplitCapableChange={(capable) => (splitCapable = capable)}
      onSectionChange={(section) => (drillSection = section)}
      {splitMinHeight}
      bind:showAllPane
      {resultsHeader}
      {resultsPane}
    />
  {/key}
</div>

<style>
  .gallery-workspace {
    position: relative;
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }

  .workspace-close {
    position: absolute;
    top: 1rem;
    right: 1rem;
    z-index: 4;
  }

  /* The pinned rule strip: count, grouped sentence, actions on one wrapping
     row. The drill below keeps the remaining height. */
  .gallery-rule-strip {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 0.9rem;
    padding: 0.55rem 1rem;
    flex: 0 0 auto;
    border-bottom: 1px solid var(--theme-border, rgba(255, 255, 255, 0.12));
  }

  .strip-count {
    font-size: 0.85rem;
    font-weight: 700;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  .strip-empty {
    font-size: 0.8rem;
    color: var(--theme-text-muted, #9aa6b8);
  }

  .strip-actions {
    display: flex;
    gap: 0.5rem;
    margin-left: auto;
    flex: 0 0 auto;
  }

  .strip-motion-anchor {
    view-transition-class: filter-rule-token;
  }

  @media (max-width: 520px) {
    /* Count + rule remain one readable sentence; the single result handoff
       gets its own full-width row and 44px target on compact pickers. */
    .gallery-rule-strip {
      display: grid;
      grid-template-columns: max-content minmax(0, 1fr);
      /* The first row holds either the empty-state sentence or a 44px chip.
         A floor keeps the strip the same height in both states, so the
         first applied rule does not nudge the value cards below it. */
      grid-auto-rows: minmax(var(--min-touch-target, 44px), auto);
      align-items: center;
      gap: 0.4rem 0.6rem;
      padding: 0.5rem 0.75rem;
    }

    .gallery-rule-strip :global(.rule-sentence) {
      min-width: 0;
    }

    .strip-actions {
      width: 100%;
      margin-left: 0;
      grid-column: 1 / -1;
    }

    .strip-actions :global(button) {
      flex: 1;
    }
  }
</style>
