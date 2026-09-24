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
    onDrillChange,
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
    onDrillChange?: (drilled: boolean) => void;
  } = $props();
  const settings = $derived(getSettings());
  // A drilled family or detail screen takes the whole picker, as the sheet's
  // own toolbar already does.
  let drilled = $state(false);
  // A rail is its host's main control in a short strip, so the props stay
  // first and the colours follow them.
  const colorsAfter = $derived(props.layout === "rail");
</script>

{#snippet colorControl()}
  {#if showColors && !drilled}
    <div class="prop-colors" transition:growFade={{ axis: "y" }}>
      <PrimaryPropColorSettings
        colors={settings.primaryPropColors}
        darkMode={settings.darkMode}
        onchange={(colors) => updateSetting("primaryPropColors", colors)}
      />
    </div>
  {/if}
{/snippet}

{#if !colorsAfter}{@render colorControl()}{/if}
<PropGrid
  {...props}
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
  onPropLookChange={(propArtwork) => void updateSettings({ propArtwork })}
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
{#if colorsAfter}{@render colorControl()}{/if}

<style>
  .prop-colors {
    /* Hosts align it with their own inset; the default matches the grid's. */
    padding: var(--prop-colors-inset, 8px 16px 4px);
    flex-shrink: 0;
  }
</style>
