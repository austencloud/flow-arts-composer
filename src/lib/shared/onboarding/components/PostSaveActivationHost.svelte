<script lang="ts">
  import { postSaveActivation } from "../state/post-save-activation-state.svelte";
  import { toastQueue } from "#lib/shared/toast/state/toast-state.svelte.js";
  import { authDrawerState } from "#lib/shared/auth/state/auth-drawer-state.svelte.js";

  $effect(() => {
    if (!postSaveActivation.visible || toastQueue.length > 0) return;

    const timer = window.setTimeout(() => {
      if (!postSaveActivation.visible || toastQueue.length > 0) return;

      const shown = authDrawerState.offerGuestSaveNudge({
        message:
          "Sequence saved on this device. Create an account to keep it across devices.",
        onDismiss: () => postSaveActivation.dismissPrompt(),
        action: {
          label: "Create account",
          onClick: () => postSaveActivation.accept(),
        },
      });
      if (shown) postSaveActivation.markPresented();
      else postSaveActivation.hide();
    }, 800);

    return () => window.clearTimeout(timer);
  });
</script>
