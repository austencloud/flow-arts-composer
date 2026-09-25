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
  import PropGrid from "./PropGrid.svelte";
  import PrimaryPropColorSettings from "./PrimaryPropColorSettings.svelte";
  import { growFade } from "$lib/shared/transitions/motion";
  import { DEFAULT_TRIANGLE_GRIP } from "$lib/shared/pictograph/prop/domain/triangle-appearance";

  let {
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
    | "propLook"
    | "onPropLookChange"
    | "recipeOverrides"
    | "colors"
    | "triangleGrip"
    | "onTriangleGripChange"
    | "onDrillChange"
  > & {
    /**
     * The account's primary prop colours above the catalogue: the pair's
     * colours are chosen where the pair is chosen, on every picker. A host
     * turns it off only when its render ignores those colours (tunnel
     * performer colours, 3D materials, canonical print cards, saved prop
     * metadata) or the page already shows the control beside the grid.
     */
    showColors?: boolean;
    /**
     * A rail with no room beneath its strip (the viewer's bottom tray) shows
     * the colours as a button at the head of its toolbar that opens the full
     * editor.
     */
    compactColors?: boolean;
    /**
     * The 3D model / Pictograph choice is how the 2D canvas draws a prop. A 3D
     * scene always renders the model, so its picker turns the choice off.
     */
    showPropLook?: boolean;
    onDrillChange?: (drilled: boolean) => void;
  } = $props();
  const settings = $derived(getSettings());
  // A drilled family or detail screen takes the whole picker, as the sheet's
  // own toolbar already does.
  let drilled = $state(false);
  // A rail is its host's main control in a short strip, so the props stay
  // first and the colours follow them, or sit in its toolbar when compact.
  const colorsPlace = $derived(
    props.layout !== "rail" ? "before" : compactColors ? "toolbar" : "after"
  );
</script>

{#snippet colorSettings(compact: boolean)}
  <PrimaryPropColorSettings
    {compact}
    colors={settings.primaryPropColors}
    darkMode={settings.darkMode}
    onchange={(colors) => updateSetting("primaryPropColors", colors)}
  />
{/snippet}

{#snippet colorControl()}
  {#if showColors && !drilled}
    {#if colorsPlace === "toolbar"}
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
<PropGrid
  {...props}
  heading={colorsPlace === "toolbar" && showColors
    ? toolbarHeading
    : hostHeading}
  onDrillChange={(next) => {
    drilled = next;
    onDrillChange?.(next);
  }}
  fanAppearance={settings.fanAppearance}
  onFanAppearanceChange={(fanAppearance) =>
    void updateSettings({ fanAppearance })}
  isUnlocked={isPropUnlocked}
  premiumVisible={isPremiumCosmeticVisible()}
  premiumAllowed={checkPremiumCosmeticAccess().allowed}
  propLook={settings.propArtwork}
  onPropLookChange={showPropLook
    ? (propArtwork) => void updateSettings({ propArtwork })
    : undefined}
  recipeOverrides={settings.compositionRecipeOverrides}
  colors={settings.primaryPropColors}
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
</style>
