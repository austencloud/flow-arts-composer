<script lang="ts">
  import {
    getSettings,
    updateSetting,
    updateSettings,
  } from "$lib/shared/application/state/app-state.svelte";
  import { isPropUnlocked } from "$lib/shared/gamification/state/prop-collection-state.svelte";
  import PremiumBadge from "$lib/shared/subscription/components/PremiumBadge.svelte";
  import PremiumNudge from "$lib/shared/subscription/components/PremiumNudge.svelte";
  import {
    checkPremiumCosmeticAccess,
    isPremiumCosmeticVisible,
    PREMIUM_COSMETIC_NUDGE,
  } from "$lib/shared/subscription/domain/premium-prop-access";
  import type { ComponentProps } from "svelte";
  import type { FanAppearance } from "$lib/shared/pictograph/prop/domain/fan-appearance";
  import type { PropLook } from "$lib/shared/pictograph/prop/domain/prop-look";
  import type { ViewerCustomColorPair } from "$lib/shared/sequence-viewer/domain/viewer-custom-colors";
  import PropGrid from "./PropGrid.svelte";
  import PrimaryPropColorSettings from "./PrimaryPropColorSettings.svelte";
  import { growFade } from "$lib/shared/transitions/motion";
  import { DEFAULT_TRIANGLE_GRIP } from "$lib/shared/pictograph/prop/domain/triangle-appearance";

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
    showPropLook = true,
    onDrillChange,
    heading: hostHeading,
    ...props
  }: Omit<
    ComponentProps<typeof PropGrid>,
    | "fanAppearance"
    | "onFanAppearanceChange"
    | "isUnlocked"
    | "premiumVisible"
    | "premiumAllowed"
    | "premiumBadge"
    | "premiumNudge"
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
     * The 3D model / Pictograph choice is how the 2D canvas draws a prop. A 3D
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

{#snippet colorControl()}
  {#if showColors && !drilled}
    {#if colorsPlace === "toolbar" || colorsPlace === "compact-before"}
      {@render colorSettings(true)}
    {:else}
      <div class="prop-colors" transition:growFade={{ axis: "y" }}>
        {@render colorSettings(false)}
      </div>
    {/if}
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

{#if colorsPlace === "before"}{@render colorControl()}{/if}
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
  onDrillChange={(next) => {
    drilled = next;
    onDrillChange?.(next);
  }}
  fanAppearance={fanAppearance ?? settings.fanAppearance}
  onFanAppearanceChange={onFanAppearanceChange ??
    ((next) => void updateSettings({ fanAppearance: next }))}
  isUnlocked={isPropUnlocked}
  premiumVisible={isPremiumCosmeticVisible()}
  premiumAllowed={checkPremiumCosmeticAccess().allowed}
  propLook={propLook ?? settings.propArtwork}
  onPropLookChange={showPropLook
    ? (onPropLookChange ??
      ((propArtwork) => void updateSettings({ propArtwork })))
    : undefined}
  recipeOverrides={settings.compositionRecipeOverrides}
  colors={displayedColors}
  triangleGrip={settings.triangleGrip ?? DEFAULT_TRIANGLE_GRIP}
  onTriangleGripChange={(triangleGrip) => void updateSettings({ triangleGrip })}
>
  {#snippet premiumBadge()}
    <PremiumBadge tooltip="Premium prop" />
  {/snippet}
  {#snippet premiumNudge({ dismiss })}
    <PremiumNudge nudge={PREMIUM_COSMETIC_NUDGE} onDismiss={dismiss} />
  {/snippet}
</PropGrid>
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
