<script lang="ts">
  import GenerationSettingsDrawer from "#lib/features/create/generate/components/modals/GenerationSettingsDrawer.svelte";
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

<!-- The compact entry point: the same recipe editors the desktop column holds,
     arriving as a sheet because there is no room to put a third column beside
     the paths and the result. -->
<GenerationSettingsDrawer
  {isOpen}
  ariaLabel="Fuse recipe settings"
  surface="panel"
  onClose={closeDrawer}
>
  {#snippet children()}
    <FuseRecipeSettings bind:destination onClose={closeDrawer} />
  {/snippet}
</GenerationSettingsDrawer>
