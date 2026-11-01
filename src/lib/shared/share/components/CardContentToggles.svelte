<!--
  CardContentToggles — what a choreo card shows, as labelled groups of picture
  tiles (MenuItemTileGrid, the same tiles the pictograph and animation
  sections use). Each group names where its marks draw: Header (word, level,
  LOOP), Steps (step numbers, reversals), Start (the start cell, its hand
  key), Info (one QR / Mandala / Both / None chooser) and the card's Light /
  Dark theme. The rows come from buildCardContentToggles and
  buildInfoCellChooser, the same owners the viewer's card panel renders, and
  write the same managers, so the two never disagree.

  The info cells depend on the card's length and grid, so the host says which
  card it shows (`stepCount`, and the live card's measured Auto layout).
  Layout overrides (columns, start lane) and the footer text stay in the card
  panel: they are per-sequence-length or content choices.
-->
<script lang="ts">
  import { onDestroy, type Snippet } from "svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { growFade } from "#lib/shared/transitions/motion.js";
  import MenuItemTileGrid from "#lib/shared/components/context-menu/MenuItemTileGrid.svelte";
  import type { ContextMenuItem } from "#lib/shared/components/context-menu/context-menu-types";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
  import { getImageCompositionManager } from "../state/image-composition-state.svelte";
  import { getVisibilityStateManager } from "#lib/shared/pictograph/shared/state/visibility-state.svelte.js";
  import {
    getExportOptionsState,
    type ExportOptionsStateManager,
  } from "#lib/shared/animation-panel/state/export-options-state.svelte.js";
  import type { ResolvedAutoLayout } from "#lib/shared/render/services/container-aware-layout.js";
  import {
    buildCardContentToggles,
    buildInfoCellChooser,
    infoCellGeometryFor,
    type CardContentToggle,
  } from "../domain/card-content-toggles";

  interface Props {
    composition?: ReturnType<typeof getImageCompositionManager>;
    exportOptions?: ExportOptionsStateManager;
    visibility?: ReturnType<typeof getVisibilityStateManager>;
    /** Steps on the card these switches edit; its info cells follow from it. */
    stepCount: number;
    /** The live card's measured Auto winner, when it reports one. */
    resolvedAutoLayout?: ResolvedAutoLayout | null;
    /** A host control that flows first, beside Theme, on the same columns
     *  (Settings → Display's card length). It brings its own label. */
    lead?: Snippet;
  }

  let {
    composition,
    exportOptions,
    visibility,
    stepCount,
    resolvedAutoLayout = null,
    lead,
  }: Props = $props();

  const uid = $props.id();
  // The managers are singletons; an override is fixed for the component's life.
  // svelte-ignore state_referenced_locally
  const manager = composition ?? getImageCompositionManager();
  // svelte-ignore state_referenced_locally
  const theme = exportOptions ?? getExportOptionsState();
  // svelte-ignore state_referenced_locally
  const vm = visibility ?? getVisibilityStateManager();

  let version = $state(0);
  const bump = () => version++;
  manager.registerObserver(bump);
  vm.registerObserver(bump, ["all"]);
  onDestroy(() => {
    manager.unregisterObserver(bump);
    vm.unregisterObserver(bump);
  });

  const groups = $derived.by(() => {
    void version;
    return buildCardContentToggles(manager, { visibility: vm });
  });

  const chooser = $derived.by(() => {
    void version;
    return buildInfoCellChooser(
      manager,
      infoCellGeometryFor(manager, stepCount, resolvedAutoLayout),
      { canQRCode: authState.isAuthenticated }
    );
  });

  const asTile = (item: CardContentToggle): ContextMenuItem => ({
    id: item.id,
    label: item.label,
    icon: item.icon,
    checked: item.active,
    action: () => item.set(!item.active),
  });

  // Each group is exactly as many tile columns wide as it holds tiles (capped
  // at the host's column count), so groups flow on the host's grid.
  const rows = $derived<
    { id: string; label: string; items: ContextMenuItem[] }[]
  >([
    {
      id: "header",
      label: t("viewer_ui_header"),
      items: groups.header.map(asTile),
    },
    { id: "steps", label: t("learn_steps"), items: groups.steps.map(asTile) },
    {
      id: "start",
      label: t("viewer_ui_start"),
      items: groups.start.map(asTile),
    },
  ]);

  // Four info picks run in one row, at the compact density, where each
  // segment has room for a word like "Mandala" (about 4.5rem), and in two
  // rows of two otherwise.
  let infoWidth = $state(0);
  const infoOneRow = $derived.by(() => {
    if (!chooser || chooser.options.length <= 3) return true;
    const rem =
      typeof document === "undefined"
        ? 16
        : parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    return infoWidth >= chooser.options.length * 4.5 * rem;
  });
  const infoFour = $derived((chooser?.options.length ?? 0) > 3);

  const themeOptions = $derived([
    { value: "light", label: t("viewer_detail_light"), icon: "fas fa-sun" },
    { value: "dark", label: t("viewer_detail_dark"), icon: "fas fa-moon" },
  ]);
</script>

<div class="card-content-toggles">
  {#if lead}
    <div class="content-group" data-group="lead">
      {@render lead()}
    </div>
  {/if}

  <div class="content-group" data-group="theme" style:--n={2}>
    <span class="group-label" id="{uid}-theme">{t("tab_settings_theme")}</span>
    <SegmentedControl
      options={themeOptions}
      value={theme.imageDarkMode ? "dark" : "light"}
      onchange={(value) => theme.setImageDarkMode(value === "dark")}
      color="accent"
      ariaLabelledby="{uid}-theme"
    />
  </div>
  {#each rows as row (row.id)}
    <div
      class="content-group"
      data-group={row.id}
      style:--n={row.items.length}
      aria-labelledby="{uid}-{row.id}"
      role="group"
    >
      <span class="group-label" id="{uid}-{row.id}">{row.label}</span>
      <MenuItemTileGrid items={row.items} />
    </div>
  {/each}

  {#if chooser}
    <div
      class="content-group"
      data-group="info"
      data-four={infoFour || undefined}
      style:--n={infoFour ? undefined : chooser.options.length}
      bind:clientWidth={infoWidth}
      transition:growFade
    >
      <span class="group-label" id="{uid}-info">{t("viewer_ui_info")}</span>
      <SegmentedControl
        options={chooser.options}
        value={chooser.value}
        onchange={chooser.select}
        color="accent"
        columns={infoOneRow ? undefined : 2}
        density={infoFour && infoOneRow ? "compact" : "standard"}
        ariaLabelledby="{uid}-info"
      />
    </div>
  {/if}
</div>

<style>
  /* Groups flow on the host's tile columns: each is exactly as wide as the
     tiles it holds, so tiles in every group line up with the grids in the
     neighbouring sections. At five columns: the host's lead (3) + Theme (2),
     Header (3) + Steps (2), Start (2) + Info (2-3); at four the lead takes
     two, Header a row, then Steps + Start, then Info. */
  .card-content-toggles {
    --cols: var(--tile-grid-cols, 4);
    --gap: var(--tile-grid-gap, 8px);
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-items: flex-start;
    /* A host short of height (a phone on its side) tightens the rhythm. */
    gap: var(--card-toggles-row-gap, 0.75rem) var(--gap);
    min-width: 0;
  }

  .content-group {
    --k: min(var(--n), var(--cols));
    display: flex;
    flex-direction: column;
    gap: var(--card-toggles-label-gap, 0.35rem);
    min-width: 0;
    width: calc(
      var(--k) * (100% - (var(--cols) - 1) * var(--gap)) / var(--cols) +
        (var(--k) - 1) * var(--gap)
    );
  }

  /* The lead leaves Theme's two columns beside it: three of five, two of
     four. */
  .content-group[data-group="lead"] {
    --n: max(2, var(--cols) - 2);
  }

  /* Four info picks take three columns of five (beside Start's two) and the
     whole row of four, where they would otherwise fold into a fifth row. */
  .content-group[data-group="info"][data-four] {
    --n: calc(8 - var(--cols));
  }

  .content-group > :global(.rt-tile-grid) {
    --tile-grid-cols: var(--k);
  }

  .group-label {
    color: var(--theme-text-dim);
    font-size: var(--font-size-xs, 0.75rem);
    font-weight: 600;
    text-align: center;
  }
</style>
