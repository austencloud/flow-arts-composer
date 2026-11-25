<script lang="ts">
  import type { FuseSettingsDestination } from "../domain/fuse-recipe-destination";
  import { fuseRecipePanel } from "../state/fuse-recipe-panel.svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import FuseCustomize from "./FuseCustomize.svelte";
  import FuseRecipeSettings from "./FuseRecipeSettings.svelte";

  let {
    destination = $bindable(null),
    onClose,
  }: {
    destination?: FuseSettingsDestination;
    onClose: () => void;
  } = $props();
</script>

<!-- On desktop the recipe is a column, not a drawer: every control in it changes
     the result, and a sheet over the result covered the one panel showing what
     the controls were doing. As a track it pushes instead of covers, and it
     opens on the same edge as the buttons that summon it. Customize shares the
     column: it changes the result too, and the result stays in view beside it
     while it is changed. -->
<aside
  class="fuse-recipe-column"
  aria-label={fuseRecipePanel.content === "customize"
    ? t("shape_engine_customize")
    : t("fuse_settings_hand_aria")}
>
  {#if fuseRecipePanel.content === "customize"}
    <FuseCustomize {onClose} />
  {:else}
    <FuseRecipeSettings bind:destination {onClose} />
  {/if}
</aside>

<style>
  /* `flex-end` because the track grows leftward off the workspace's right edge:
     pinning the panel to that edge means the widening track uncovers it from the
     right, the direction it is travelling. Pinned to the left edge instead, the
     panel would sit still while a gap opened beside it. */
  .fuse-recipe-column {
    position: relative;
    /* Keeps the panel's own z-index inside this track. Without it the open
       panel painted over the Edit path screen. */
    isolation: isolate;
    grid-area: recipe;
    display: flex;
    justify-content: flex-end;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  /* GenerationSettingsOverlay is authored to cover a card, so it is absolutely
     positioned by default. In a grid track it is the track's only occupant.

     It is pinned to the track's OPEN width rather than left to fill, so the
     growing track reveals a finished panel instead of dragging its contents
     through 280ms of reflow — the editors inside re-wrap at several widths, and
     watching them re-wrap is what made the open read as a stutter. The track's
     `overflow: hidden` does the revealing. */
  .fuse-recipe-column :global(.generation-settings-overlay) {
    position: static;
    flex: 0 0 auto;
    width: var(--fuse-recipe-open-w, 100%);
    min-width: 0;
    min-height: 0;
  }
</style>
