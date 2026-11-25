<script lang="ts">
  import GenerationSettingsDrawer from "#lib/features/create/generate/components/modals/GenerationSettingsDrawer.svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { FuseSettingsDestination } from "../domain/fuse-recipe-destination";
  import FuseRecipeSettings from "./FuseRecipeSettings.svelte";

  let {
    isOpen,
    destination = $bindable(null),
    onDismiss,
  }: {
    isOpen: boolean;
    destination?: FuseSettingsDestination;
    onDismiss: () => void;
  } = $props();

  function closeDrawer(): void {
    onDismiss();
  }
</script>

<!-- The compact entry point: the same hand settings the desktop column holds,
     arriving as a sheet because there is no room to put a third column beside
     the paths and the result. Customize never comes here: it docks under the
     result (FuseCustomizeDock) so it stays in view. -->
<GenerationSettingsDrawer
  {isOpen}
  ariaLabel={t("fuse_settings_new_paths_aria")}
  surface="panel"
  fullHeightOnPhone={destination === "pairing"}
  onClose={closeDrawer}
>
  {#snippet children()}
    <FuseRecipeSettings bind:destination onClose={closeDrawer} />
  {/snippet}
</GenerationSettingsDrawer>
