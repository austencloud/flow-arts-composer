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
  import PropGrid from "./PropGrid.svelte";

  let props: Omit<
    ComponentProps<typeof PropGrid>,
    | "fanAppearance"
    | "onFanAppearanceChange"
    | "isUnlocked"
    | "premiumVisible"
    | "premiumAllowed"
    | "premiumBadge"
    | "premiumNudge"
    | "propLook"
    | "recipeOverrides"
    | "colors"
  > = $props();
  const settings = $derived(getSettings());
</script>

<PropGrid
  {...props}
  fanAppearance={settings.fanAppearance}
  onFanAppearanceChange={(fanAppearance) =>
    void updateSettings({ fanAppearance })}
  isUnlocked={isPropUnlocked}
  premiumVisible={isPremiumCosmeticVisible()}
  premiumAllowed={checkPremiumCosmeticAccess().allowed}
  propLook={settings.propArtwork}
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
