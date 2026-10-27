<script lang="ts">
  import { setAccountSetupContext } from "#lib/shared/onboarding/context/account-setup-context.js";
  import type { AccountSetupState } from "#lib/shared/onboarding/state/account-setup-state.svelte.js";
  import BackgroundTab from "./BackgroundTab.svelte";

  let { state }: { state: AccountSetupState } = $props();
  setAccountSetupContext(state);
</script>

<BackgroundTab settings={{} as never} />
