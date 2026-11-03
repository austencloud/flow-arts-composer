<script lang="ts">
  import { setAccountSetupContext } from "#lib/shared/onboarding/context/account-setup-context.js";
  import type { AccountSetupState } from "#lib/shared/onboarding/state/account-setup-state.svelte.js";
  import BackgroundTab from "./BackgroundTab.svelte";

  let {
    state,
    onBack,
    onUpdate,
    column = false,
  }: {
    state: AccountSetupState;
    onBack?: () => void;
    column?: boolean;
    onUpdate?: (event: { key: string; value: unknown }) => void;
  } = $props();
  setAccountSetupContext(state);
</script>

<BackgroundTab
  settings={{ backgroundType: "cosmic" } as never}
  {onBack}
  {onUpdate}
  {column}
  compact={!!onBack}
/>
