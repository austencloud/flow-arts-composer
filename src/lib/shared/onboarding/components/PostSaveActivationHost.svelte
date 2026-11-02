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
          "Saved on this device. An account keeps it on every device. Free, about ten seconds.",
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
