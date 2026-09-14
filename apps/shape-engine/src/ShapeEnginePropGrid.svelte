<script lang="ts">
  import { getSettings, updateSettings } from "./native-settings.svelte";
  import type { ComponentProps } from "svelte";
  import PropGrid from "$lib/shared/settings/components/tabs/prop-type/PropGrid.svelte";

  let props: Omit<
    ComponentProps<typeof PropGrid>,
    | "fanAppearance"
    | "onFanAppearanceChange"
    | "isUnlocked"
    | "premiumVisible"
    | "premiumAllowed"
  > = $props();
  const settings = $derived(getSettings());
</script>

<PropGrid
  {...props}
  accessMode="educational"
  fanAppearance={settings.fanAppearance}
  onFanAppearanceChange={(fanAppearance) => void updateSettings({ fanAppearance })}
  premiumVisible={false}
/>
