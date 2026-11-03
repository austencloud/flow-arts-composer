<script lang="ts">
  import { setAccountSetupContext } from "#lib/shared/onboarding/context/account-setup-context.js";
  import type { AccountSetupState } from "#lib/shared/onboarding/state/account-setup-state.svelte.js";
  import BackgroundTab from "./BackgroundTab.svelte";

  let {
    state,
    onBack,
    onUpdate,
  }: {
    state: AccountSetupState;
    onBack?: () => void;
    onUpdate?: (event: { key: string; value: unknown }) => void;
  } = $props();
  setAccountSetupContext(state);
</script>

<BackgroundTab
  settings={{ backgroundType: "cosmic" } as never}
  {onBack}
  {onUpdate}
  compact={!!onBack}
/>
