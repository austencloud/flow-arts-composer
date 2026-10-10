<script lang="ts">
  import { getAccountSetupContext } from "../../context/account-setup-context";
  import {
    showToast,
    toastQueue,
  } from "#lib/shared/toast/state/toast-state.svelte.js";
  import { handleModuleChange } from "#lib/shared/navigation-coordinator/navigation-coordinator.svelte.js";
  import { logAccountSetupReminder } from "#lib/shared/analytics/services/onboarding-events.js";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";

  const accountSetup = getAccountSetupContext();

  $effect(() => {
    if (!accountSetup.reminderRequested || accountSetup.loading) return;

    if (!accountSetup.canShowReminder()) {
      accountSetup.cancelReminderRequest();
      return;
    }

    // Setup can wait. Let save confirmations and errors finish first.
    if (toastQueue.length > 0) return;

    const timer = window.setTimeout(() => {
      if (toastQueue.length > 0 || !accountSetup.consumeReminderRequest()) {
        return;
      }

      const progress = {
        completed_count: accountSetup.completedCount,
        total_count: accountSetup.totalCount,
      };
      let resolved = false;
      logAccountSetupReminder("shown", progress);

      showToast({
        message: t("onboarding_reminder_progress", {
          done: accountSetup.completedCount,
          total: accountSetup.totalCount,
        }),
        type: "info",
        duration: 10_000,
        announcement: "polite",
        onDismiss: () => {
          if (!resolved) {
            resolved = true;
            logAccountSetupReminder("dismissed", progress);
          }
          void accountSetup.dismissReminder();
        },
        action: {
          label: t("onboarding_open_profile"),
          onClick: () => {
            resolved = true;
            logAccountSetupReminder("opened", progress);
            void handleModuleChange("settings", "profile");
          },
        },
      });
    }, 1_800);

    return () => window.clearTimeout(timer);
  });
</script>
