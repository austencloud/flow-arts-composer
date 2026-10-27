<!--
  Settings → Display: the pictograph section. A real letter A pictograph that
  reads the global VisibilityStateManager like every other pictograph, and the
  switches from the long-press menu's own builder, so the tiles and the menu
  are one list.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { growFade } from "#lib/shared/transitions/motion.js";
  import PictographContainer from "#lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import PictographContextMenuHost from "#lib/shared/pictograph/shared/components/context-menu/PictographContextMenuHost.svelte";
  import { buildPictographContextMenuItems } from "#lib/shared/pictograph/shared/components/context-menu/pictograph-context-menu-builder.js";
  import { getVisibilityStateManager } from "#lib/shared/pictograph/shared/state/visibility-state.svelte.js";
  import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import MenuItemTileGrid from "#lib/shared/components/context-menu/MenuItemTileGrid.svelte";
  import {
    isMenuItem,
    type ContextMenuItem,
  } from "#lib/shared/components/context-menu/context-menu-types.js";
  import DisplaySection from "./DisplaySection.svelte";
  import type { DisplayExample } from "./display-example-data";

  let { example }: { example: DisplayExample | null } = $props();

  const vm = getVisibilityStateManager();
  let version = $state(0);
  // Persisted switches arrive after the first frame; the tiles wait for them so
  // they never flash their defaults. The stage draws straight away.
  let settingsReady = $state(false);

  onMount(() => {
    const bump = () => version++;
    vm.registerObserver(bump, ["all"]);
    void vm.ensureSettingsLoaded().then(() => {
      settingsReady = true;
    });
    return () => vm.unregisterObserver(bump);
  });

  /** The menu's submenus flattened into one row, in the order a reader scans
   *  the pictograph: grid and points, then its marks. */
  const ORDER = [
    "toggle-grid",
    "toggle-hand-points",
    "toggle-non-radial",
    "toggle-step-numbers",
    "toggle-tka-glyph",
    "toggle-hand-tnd-glyph",
    "toggle-prop-tnd-glyph",
    "toggle-positions-glyph",
    "toggle-reversals",
    "toggle-hand-color-key",
  ];

  const chips = $derived.by<ContextMenuItem[]>(() => {
    void version;
    const flat = buildPictographContextMenuItems({ visibilityManager: vm })
      .filter(isMenuItem)
      .flatMap((entry) => entry.children ?? [entry]);
    const byId = new Map(flat.map((item) => [item.id, item]));
    return ORDER.flatMap((id) => byId.get(id) ?? []);
  });

  let menuHost: PictographContextMenuHost | undefined = $state();

  function openMenu(event: MouseEvent): void {
    event.preventDefault();
    menuHost?.openContextMenu(event.clientX, event.clientY);
  }
</script>

<DisplaySection
  kind="pictograph"
  icon="fas fa-shapes"
  title={t("settings_display_pictograph")}
  caption={t("settings_display_pictograph_caption")}
  onReset={() => vm.resetToDefaults()}
  onStageContextMenu={openMenu}
>
  {#snippet stage()}
    {#if example}
      <div class="pictograph-stage">
        <PictographContainer
          pictographData={example.pictograph}
          gridMode={GridMode.DIAMOND}
          disableContentTransitions
        />
      </div>
    {/if}
  {/snippet}
  {#snippet controls()}
    {#if settingsReady}
      <div transition:growFade>
        <MenuItemTileGrid
          items={chips}
          ariaLabel={t("settings_display_pictograph")}
        />
      </div>
    {/if}
  {/snippet}
</DisplaySection>

<PictographContextMenuHost bind:this={menuHost} />

<style>
  .pictograph-stage {
    width: 100%;
    height: 100%;
  }

  :global([data-display-section="pictograph"]) {
    --stage-ratio: 1;
    --stage-max-w: 17.5rem;
  }
</style>
