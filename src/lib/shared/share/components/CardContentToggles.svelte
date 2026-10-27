<!--
  CardContentToggles — what a choreo card shows, as labelled groups of picture
  tiles (MenuItemTileGrid, the same tiles the pictograph and animation
  sections use): the header marks, the start placement, the info cell (QR, Mandala)
  and the card's Light / Dark theme. The rows come from
  buildCardContentToggles, the same list the viewer's card panel renders, and
  write the same managers, so the two never disagree.

  Layout overrides (columns, start lane, one-spot info chooser) and the footer
  text stay in the card panel: they are per-sequence-length or content
  choices, not display preferences.
-->
<script lang="ts">
  import { onDestroy } from "svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import MenuItemTileGrid from "#lib/shared/components/context-menu/MenuItemTileGrid.svelte";
  import type { ContextMenuItem } from "#lib/shared/components/context-menu/context-menu-types";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
  import { getImageCompositionManager } from "../state/image-composition-state.svelte";
  import {
    getExportOptionsState,
    type ExportOptionsStateManager,
  } from "#lib/shared/animation-panel/state/export-options-state.svelte.js";
  import {
    buildCardContentToggles,
    type CardContentToggle,
  } from "../domain/card-content-toggles";

  interface Props {
    composition?: ReturnType<typeof getImageCompositionManager>;
    exportOptions?: ExportOptionsStateManager;
  }

  let { composition, exportOptions }: Props = $props();

  const uid = $props.id();
  // The managers are singletons; an override is fixed for the component's life.
  // svelte-ignore state_referenced_locally
  const manager = composition ?? getImageCompositionManager();
  // svelte-ignore state_referenced_locally
  const theme = exportOptions ?? getExportOptionsState();

  let version = $state(0);
  const bump = () => version++;
  manager.registerObserver(bump);
  onDestroy(() => manager.unregisterObserver(bump));

  const groups = $derived.by(() => {
    void version;
    return buildCardContentToggles(manager, {
      canQRCode: authState.isAuthenticated,
    });
  });

  const asTile = (item: CardContentToggle): ContextMenuItem => ({
    id: item.id,
    label: item.label,
    icon: item.icon,
    checked: item.active,
    action: () => item.set(!item.active),
  });

  // `span` is how many tile columns a group takes at most; the CSS takes the
  // smaller of it and the host's column count, and on the three-column (phone)
  // tier folds Header to 2×2 and Info to one column so no row holds a lone tile.
  const rows = $derived<
    { id: string; label: string; items: ContextMenuItem[] }[]
  >([
    {
      id: "header",
      label: t("viewer_ui_header"),
      items: groups.header.map(asTile),
    },
    { id: "start", label: t("viewer_ui_start"), items: [asTile(groups.start)] },
    { id: "info", label: t("viewer_ui_info"), items: groups.info.map(asTile) },
  ]);

  const themeOptions = $derived([
    { value: "light", label: t("viewer_detail_light"), icon: "fas fa-sun" },
    { value: "dark", label: t("viewer_detail_dark"), icon: "fas fa-moon" },
  ]);
</script>

<div class="card-content-toggles">
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
</div>

<style>
  /* Groups flow on the host's tile columns: each is exactly as wide as the
     tiles it holds, so tiles in every group line up with the grids in the
     neighbouring sections. At five columns: Header + Start, then Info +
     Theme; at four: Header, Start + Info, Theme. */
  .card-content-toggles {
    --cols: var(--tile-grid-cols, 4);
    --gap: var(--tile-grid-gap, 8px);
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-items: flex-start;
    gap: 0.75rem var(--gap);
    min-width: 0;
  }

  .content-group {
    --k: min(var(--n), var(--cols));
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    min-width: 0;
    width: calc(
      var(--k) * (100% - (var(--cols) - 1) * var(--gap)) / var(--cols) +
        (var(--k) - 1) * var(--gap)
    );
  }

  .content-group > :global(.rt-tile-grid) {
    --tile-grid-cols: var(--k);
  }

  /* Three columns: Header folds to 2×2 with Start beside it, Info to one
     column beside Theme. */
  .content-group[data-group="header"] {
    --k: min(var(--n), var(--cols), max(2, (var(--cols) - 3) * 4));
  }

  .content-group[data-group="info"] {
    --k: min(var(--n), var(--cols), max(1, (var(--cols) - 3) * 2));
  }

  .group-label {
    color: var(--theme-text-dim);
    font-size: var(--font-size-xs, 0.75rem);
    font-weight: 600;
    text-align: center;
  }
</style>
