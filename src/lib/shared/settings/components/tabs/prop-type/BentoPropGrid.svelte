<script lang="ts">
  import {
    getSettings,
    updateSetting,
    updateSettings,
  } from "#lib/shared/application/state/app-state.svelte.js";
  import { isPropUnlocked } from "#lib/shared/gamification/state/prop-collection-state.svelte.js";
  import type { ComponentProps } from "svelte";
  import type { FanAppearance } from "#lib/shared/pictograph/prop/domain/fan-appearance.js";
  import type { PropLook } from "#lib/shared/pictograph/prop/domain/prop-look.js";
  import type { ViewerCustomColorPair } from "#lib/shared/sequence-viewer/domain/viewer-custom-colors.js";
  import PropGrid from "./PropGrid.svelte";
  import PrimaryPropColorSettings from "./PrimaryPropColorSettings.svelte";
  import { growFade, STEP_DRIFT_PX } from "#lib/shared/transitions/motion.js";
  import { DEFAULT_TRIANGLE_GRIP } from "#lib/shared/pictograph/prop/domain/triangle-appearance.js";

  // Public hosts own their appearance without writing global settings.
  let {
    fanAppearance,
    onFanAppearanceChange,
    propLook,
    onPropLookChange,
    primaryPropColors,
    onPrimaryPropColorsChange,
    showColors = true,
    compactColors = false,
    showPropLook,
    onDrillChange,
    heading: hostHeading,
    ...props
  }: Omit<
    ComponentProps<typeof PropGrid>,
    | "fanAppearance"
    | "onFanAppearanceChange"
    | "isUnlocked"
    | "recipeOverrides"
    | "colors"
    | "triangleGrip"
    | "onTriangleGripChange"
    | "onDrillChange"
  > & {
    fanAppearance?: FanAppearance;
    onFanAppearanceChange?: (appearance: FanAppearance) => void;
    propLook?: PropLook;
    onPropLookChange?: (look: PropLook) => void;
    /** An explicit null keeps a page on the default pair without reading account colours. */
    primaryPropColors?: ViewerCustomColorPair | null;
    onPrimaryPropColorsChange?: (colors: ViewerCustomColorPair | null) => void;
    /**
     * The account's primary prop colours above the catalogue: the pair's
     * colours are chosen where the pair is chosen, on every picker. A host
     * turns it off only when its render ignores those colours (tunnel
     * performer colours, 3D materials, canonical print cards, saved prop
     * metadata) or the page already shows the control beside the grid.
     */
    showColors?: boolean;
    /** Show colours as a toolbar button that opens the full editor. */
    compactColors?: boolean;
    /**
     * The Version 1 / Version 2 choice is how the 2D canvas draws a prop. A 3D
     * scene always renders the model, so its picker turns the choice off.
     */
    showPropLook?: boolean;
    onDrillChange?: (drilled: boolean) => void;
  } = $props();
  const settings = $derived(getSettings());
  const displayedColors = $derived(
    primaryPropColors === undefined
      ? settings.primaryPropColors
      : primaryPropColors
  );
  // A drilled family or detail screen takes the whole picker, as the sheet's
  // own toolbar already does.
  let drilled = $state(false);
  // Compact hosts keep the catalogue ahead of the colour editor.
  const colorsPlace = $derived(
    props.layout !== "rail"
      ? compactColors
        ? "compact-before"
        : "before"
      : compactColors
        ? "toolbar"
        : "after"
  );
</script>

{#snippet colorSettings(compact: boolean)}
  <PrimaryPropColorSettings
    {compact}
    colors={displayedColors}
    darkMode={settings.darkMode}
    onchange={onPrimaryPropColorsChange ??
      ((colors) => updateSetting("primaryPropColors", colors))}
  />
{/snippet}

<!-- Above the grid, the colours are part of the grid screen: a drill fades them
     out with the tiles as one page, with nothing resizing, and Back returns
     them the same way. -->
{#snippet colorLead()}
  {@render colorSettings(false)}
{/snippet}

<!-- The block that drops the colours on a drill owns their transition. Svelte
     plays a local transition only when its own block changes, so under a nested
     {#if} they would vanish in one frame. -->
{#snippet colorControl()}
  {#if colorsPlace === "toolbar" || colorsPlace === "compact-before"}
    {#if showColors && !drilled}{@render colorSettings(true)}{/if}
  {:else if showColors && !drilled}
    <div
      class="prop-colors"
      transition:growFade={{ axis: "y", x: -STEP_DRIFT_PX }}
    >
      {@render colorSettings(false)}
    </div>
  {/if}
{/snippet}

<!-- The compact button leads the toolbar beside the host's own heading (the
     viewer's Cat Dog chip), in one row that a narrow host may flatten. -->
{#snippet toolbarHeading()}
  <div class="rail-lead">
    {@render hostHeading?.()}
    {@render colorControl()}
  </div>
{/snippet}

{#if colorsPlace === "compact-before" && showColors && !drilled}
  <div class="compact-color-toolbar" transition:growFade={{ axis: "y" }}>
    {@render colorControl()}
  </div>
{/if}
<PropGrid
  {...props}
  heading={colorsPlace === "toolbar" && showColors
    ? toolbarHeading
    : hostHeading}
  lead={colorsPlace === "before" && showColors ? colorLead : undefined}
  onDrillChange={(next) => {
    drilled = next;
    onDrillChange?.(next);
  }}
  fanAppearance={fanAppearance ?? settings.fanAppearance}
  onFanAppearanceChange={onFanAppearanceChange ??
    ((next) => void updateSettings({ fanAppearance: next }))}
  isUnlocked={isPropUnlocked}
  propLook={propLook ?? settings.propArtwork}
  onPropLookChange={(showPropLook ?? props.showAppearance !== false)
    ? (onPropLookChange ??
      ((propArtwork) => void updateSettings({ propArtwork })))
    : undefined}
  recipeOverrides={settings.compositionRecipeOverrides}
  colors={displayedColors}
  triangleGrip={settings.triangleGrip ?? DEFAULT_TRIANGLE_GRIP}
  onTriangleGripChange={(triangleGrip) => void updateSettings({ triangleGrip })}
/>
{#if colorsPlace === "after"}{@render colorControl()}{/if}

<style>
  .prop-colors {
    /* Hosts align it with their own inset; the default matches the grid's. */
    padding: var(--prop-colors-inset, 8px 16px 4px);
    flex-shrink: 0;
  }
  .rail-lead {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
  .compact-color-toolbar {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    min-height: 3.25rem;
    padding: 0.25rem 1rem;
    border-bottom: 1px solid var(--theme-stroke);
    flex-shrink: 0;
  }
</style>
