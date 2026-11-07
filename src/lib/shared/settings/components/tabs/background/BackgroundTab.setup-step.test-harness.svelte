<script lang="ts">
  import { setAccountSetupContext } from "#lib/shared/onboarding/context/account-setup-context.js";
  import type { AccountSetupState } from "#lib/shared/onboarding/state/account-setup-state.svelte.js";
  import BackgroundTab from "./BackgroundTab.svelte";

  let {
    state: setupState,
    onBack,
    onUpdate,
    cell = false,
  }: {
    state: AccountSetupState;
    onBack?: () => void;
    cell?: boolean;
    onUpdate?: (event: { key: string; value: unknown }) => void;
  } = $props();
  setAccountSetupContext(setupState);

  // The app's settings store: an update comes back as the new settings.
  let settings = $state({ backgroundType: "cosmic" });
  function update(event: { key: string; value: unknown }): void {
    if (event.key === "backgroundType") {
      settings.backgroundType = event.value as string;
    }
    onUpdate?.(event);
  }
</script>

{#if cell}
  <!-- A cell is always a quarter of the Display tab's grid, a sized box
       (1920×1080's cell). Unsized, its size-contained body has no height. -->
  <div
    style="display: flex; flex-direction: column; width: 54rem; height: 30.5rem"
  >
    <BackgroundTab
      settings={settings as never}
      onUpdate={update}
      cell
    />
  </div>
{:else}
  <BackgroundTab
    settings={settings as never}
    {onBack}
    onUpdate={update}
    compact={!!onBack}
  />
{/if}
