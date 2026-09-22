<script lang="ts">
  import {
    getSettings,
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
  import PropGrid from "./PropGrid.svelte";

  // Appearance edits the global settings by default. A host that runs without
  // the app settings service (the public composer) passes its own values and
  // handlers so the picks stay on that page.
  let {
    fanAppearance,
    onFanAppearanceChange,
    propLook,
    onPropLookChange,
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
  > & {
    fanAppearance?: FanAppearance;
    onFanAppearanceChange?: (appearance: FanAppearance) => void;
  } = $props();
  const settings = $derived(getSettings());
</script>

<PropGrid
  {...props}
  fanAppearance={fanAppearance ?? settings.fanAppearance}
  onFanAppearanceChange={onFanAppearanceChange ??
    ((next) => void updateSettings({ fanAppearance: next }))}
  isUnlocked={isPropUnlocked}
  premiumVisible={isPremiumCosmeticVisible()}
  premiumAllowed={checkPremiumCosmeticAccess().allowed}
  propLook={propLook ?? settings.propArtwork}
  onPropLookChange={onPropLookChange ??
    ((propArtwork) => void updateSettings({ propArtwork }))}
  recipeOverrides={settings.compositionRecipeOverrides}
  colors={settings.primaryPropColors}
>
  {#snippet premiumBadge()}
    <PremiumBadge tooltip="Premium prop" />
  {/snippet}
  {#snippet premiumNudge({ dismiss })}
    <PremiumNudge nudge={PREMIUM_COSMETIC_NUDGE} onDismiss={dismiss} />
  {/snippet}
</PropGrid>
