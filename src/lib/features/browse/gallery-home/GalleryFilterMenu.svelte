<!--
  One menu in the desktop Browse row: Level, Length or More.

  A chip button that shows what is chosen ("Level 2", tinted, with its own ×)
  and opens a popover under itself, floating over the grid. The popover hosts
  the same gallery drill the workspace and the phone sheet use, so every
  editor, count and stacking rule is the one copy.

  - Level and Length open straight on their editor. A pick applies and closes.
  - More opens the remaining categories as tiles; a tile shows its editor in
    the same popover with a Back button. Stacking values toggle and the menu
    stays open until Done. Applied More filters sit on top, each removable.
-->
<script lang="ts">
  import { Popover } from "bits-ui";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import FilterChipBase from "#lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import { localizeFilterChip } from "#lib/shared/browse/components/localize-filter-chip.js";
  import { BrowseFilterType } from "#lib/shared/persistence/domain/enums/filtering-enums.js";
  import { SECTION_FOR_FILTER_TYPE } from "#lib/shared/browse/domain/workspace-sections.js";
  import type { BrowseEngine } from "#lib/shared/browse/engine/types.js";
  import { withResultsMorph } from "#lib/shared/transitions/results-morph.js";
  import GalleryDrill from "./GalleryDrill.svelte";
  import { createDrillFilterBindings } from "./drill-filter-bindings.svelte";
  import type { CollectionOption, Section } from "./gallery-drill-catalog.svelte";

  type MenuKind = "level" | "length" | "more";

  let {
    engine,
    kind,
    open = $bindable(false),
    seedRequest = null,
    collections = [],
  }: {
    engine: BrowseEngine;
    kind: MenuKind;
    open?: boolean;
    /** More only: open on this category instead of the tiles (a front-door
     * tile). A new object each time, so the same tile twice still seeds. */
    seedRequest?: { section: Exclude<Section, "chooser"> } | null;
    collections?: readonly CollectionOption[];
  } = $props();

  /** The filter types that have their own button in the row. Everything else
   * belongs to More. */
  const OWN_BUTTON_TYPES = new Set<string>([
    BrowseFilterType.DIFFICULTY,
    BrowseFilterType.LENGTH,
    BrowseFilterType.MANDALA,
  ]);

  const filters = createDrillFilterBindings(() => engine);
  const ownType = $derived(
    kind === "level"
      ? BrowseFilterType.DIFFICULTY
      : kind === "length"
        ? BrowseFilterType.LENGTH
        : null
  );

  const unlocked = $derived(
    [...engine.activeFilters.entries()].filter(([, f]) => !f.locked)
  );
  const applied = $derived(
    ownType
      ? unlocked.filter(([, f]) => f.type === ownType)
      : unlocked.filter(([, f]) => !OWN_BUTTON_TYPES.has(String(f.type)))
  );

  const baseLabel = $derived(
    kind === "level"
      ? t("browse_ui_level")
      : kind === "length"
        ? t("browse_ui_length")
        : t("browse_verified_more")
  );
  // Level and Length name their choice in the button; More counts its own.
  const chipLabel = $derived(
    ownType && applied.length > 0
      ? applied.map(([, f]) => localizeFilterChip(f)).join(", ")
      : baseLabel
  );
  const chipColor = $derived(
    ownType && applied[0] ? applied[0][1].chipColor : "var(--theme-accent)"
  );
  const icon = $derived(
    kind === "level"
      ? "fas fa-signal"
      : kind === "length"
        ? "fas fa-ruler-horizontal"
        : "fas fa-sliders"
  );

  let anchor = $state<HTMLElement | null>(null);
  const titleId = $props.id();
  // More reopens on the tiles; a front-door tile seeds one category once.
  let seed = $state<Section | undefined>(undefined);
  $effect(() => {
    if (seedRequest && kind === "more") seed = seedRequest.section;
  });
  // Closed, More goes back to its tiles for next time.
  $effect(() => {
    if (!open) seed = undefined;
  });
  const initialSection = $derived<Section>(
    kind === "more" ? (seed ?? "chooser") : kind
  );

  function close(): void {
    open = false;
  }

  function clearOwn(): void {
    if (!ownType) return;
    const type = ownType;
    withResultsMorph(() => engine.removeFilter(String(type)));
  }

  function removeKey(key: string): void {
    withResultsMorph(() => engine.removeFilter(key));
  }

  function editKey(type: string): void {
    const section = SECTION_FOR_FILTER_TYPE[type];
    if (!section || section === "mandala") return;
    seed = section === "collections" ? "collection" : section;
    drillKey += 1;
  }
  // Re-seeding More's drill onto a category remounts it on that editor.
  let drillKey = $state(0);

  // The trigger toggles. Without this its own press counts as an outside
  // press that closes the popover, and the click opens it straight back.
  function ignoreTriggerPress(event: Event): void {
    if (event.target instanceof Node && anchor?.contains(event.target)) {
      event.preventDefault();
    }
  }
</script>

<div class="menu-anchor" bind:this={anchor} data-menu={kind}>
  <FilterChipBase
    label={chipLabel}
    {icon}
    mode="dropdown"
    popupRole="dialog"
    expanded={open}
    active={applied.length > 0}
    {chipColor}
    count={kind === "more" && applied.length > 0 ? applied.length : null}
    ariaLabel={kind === "more" && applied.length > 0
      ? `${baseLabel} (${applied.length})`
      : chipLabel}
    onclick={() => (open = !open)}
    ondismiss={close}
    onremove={ownType && applied.length > 0 ? clearOwn : undefined}
    removeAriaLabel={t("browse_audit_remove_filter", { filter: chipLabel })}
  />
</div>

<Popover.Root bind:open>
  <Popover.Portal>
    <Popover.Content
      customAnchor={anchor}
      preventScroll={false}
      side="bottom"
      align="start"
      sideOffset={8}
      collisionPadding={12}
      class="gallery-filter-menu"
      data-kind={kind}
      aria-labelledby={titleId}
      onInteractOutside={ignoreTriggerPress}
    >
      <h2 id={titleId} class="sr-only">{baseLabel}</h2>
      {#if kind === "more" && applied.length > 0}
        <ul class="applied" aria-label={t("browse_ui_filters")}>
          {#each applied as [key, f] (key)}
            <li>
              <FilterChipBase
                label={localizeFilterChip(f)}
                mode="action"
                size="sm"
                active
                chipColor={f.chipColor}
                onclick={() => editKey(String(f.type))}
                onremove={() => removeKey(key)}
                removeAriaLabel={t("browse_audit_remove_filter", {
                  filter: localizeFilterChip(f),
                })}
              />
            </li>
          {/each}
        </ul>
      {/if}
      {#key `${drillKey}:${initialSection}`}
        <GalleryDrill
          pool={engine.allSequences}
          loading={!engine.error && engine.isLoading}
          loadFailed={!!engine.error}
          fitContent
          adaptiveValueLayout
          persistSection={false}
          showCollections={kind === "more" && collections.length > 0}
          {collections}
          {initialSection}
          unifiedFilterChooser={kind === "more"}
          chooserCategories="secondary"
          showEditorBack={kind === "more"}
          getCount={(type, value) => engine.getFilteredCount(type, value)}
          isValueApplied={filters.isValueApplied}
          onApply={(type, value, label, color) => {
            withResultsMorph(() =>
              ownType
                ? filters.replace(type, value, label, color)
                : filters.add(type, value, label, color)
            );
            close();
          }}
          onToggleValue={kind === "more" ? filters.toggleValue : undefined}
          activeLoopValues={filters.activeLoopValues}
          loopConnective={engine.connectives[
            String(BrowseFilterType.LOOP_TYPE)
          ] ?? "any"}
          onLoopConnectiveChange={(connective) =>
            engine.setConnective(BrowseFilterType.LOOP_TYPE, connective)}
          onToggleLoop={filters.toggleLoop}
          activeFamilyValues={filters.activeFamilyValues}
          familyConnective={engine.connectives[
            String(BrowseFilterType.TND_FAMILY)
          ] ?? "any"}
          onFamilyConnectiveChange={(connective) =>
            engine.setConnective(BrowseFilterType.TND_FAMILY, connective)}
          onToggleFamily={filters.toggleFamily}
        />
      {/key}
      {#if kind === "more"}
        <div class="menu-foot">
          <PanelButton variant="primary" onclick={close}>
            {t("browse_audit_done")}
          </PanelButton>
        </div>
      {/if}
    </Popover.Content>
  </Popover.Portal>
</Popover.Root>

<style>
  .menu-anchor {
    display: inline-flex;
    flex: 0 0 auto;
    min-width: 0;
  }
  .menu-anchor :global(.chip-label) {
    max-width: 14rem;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Opaque, never taller than the window, sized so the drill's container
     queries lay the editors out as they do on a mid-width screen: Level's
     three cards in one row. */
  :global(.gallery-filter-menu) {
    box-sizing: border-box;
    z-index: var(--z-dropdown, 1000);
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    width: min(46rem, calc(100vw - 24px));
    max-height: var(--bits-popover-content-available-height, 85dvh);
    /* scrolls: only in a window shorter than these choices, so every one stays in reach */
    overflow-y: auto;
    padding: 0.9rem 1rem 1rem;
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--radius-lg, 16px);
    background: var(--surface-panel-opaque);
    box-shadow: var(--shadow-lg, 0 18px 48px rgba(0, 0, 0, 0.45));
    outline: none;
    transform-origin: var(--bits-popover-content-transform-origin);
  }
  :global(.gallery-filter-menu[data-state="open"]) {
    animation: gallery-filter-menu-enter var(--duration-fast) var(--ease-out)
      both;
  }
  /* The drill fills a sized box everywhere else (flex-basis 0, each screen
     scrolling itself). In the menu it takes its content height instead, so
     the popover grows to fit and nothing inside it scrolls. */
  :global(.gallery-filter-menu .drill.fit-content) {
    height: auto;
    padding: 0;
    gap: 0.6rem;
  }
  :global(.gallery-filter-menu .drill.fit-content .drill-stage),
  :global(.gallery-filter-menu .drill.fit-content .drill-editor-stage) {
    flex: 0 0 auto;
    max-width: none;
    overflow: visible;
  }
  :global(.gallery-filter-menu .drill.fit-content .drill-screen) {
    overflow: visible;
  }
  :global(.gallery-filter-menu .drill.fit-content .drill-screen > *) {
    flex: 0 0 auto;
  }
  .applied {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .menu-foot {
    display: flex;
    justify-content: flex-end;
  }
  @keyframes gallery-filter-menu-enter {
    from {
      opacity: 0;
      transform: scale(0.97);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    :global(.gallery-filter-menu[data-state="open"]) {
      animation: none;
    }
  }
</style>
