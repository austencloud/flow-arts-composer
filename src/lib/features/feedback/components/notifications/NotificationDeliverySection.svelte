<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import SettingsSectionHeader from "#lib/shared/settings/components/SettingsSectionHeader.svelte";
  import type { NotificationPreferences } from "#lib/shared/feedback/domain/models/notification-models.js";
  import type { PushDeviceRegistrationState } from "#lib/shared/push/services/fcm-token-manager.js";
  import NotificationChannelCard from "./NotificationChannelCard.svelte";
  import PreferenceGroup from "./PreferenceGroup.svelte";
  import type { PreferenceItem } from "./preference-item";

  interface Props {
    preferences: NotificationPreferences;
    pushDeviceState: PushDeviceRegistrationState;
    pushDescription: string;
    pushStatus: string;
    pushAriaLabel: string;
    emailDescription: string;
    emailStatus: string;
    emailAriaLabel: string;
    emailPreferenceItems: PreferenceItem[];
    pushBusy?: boolean;
    emailBusy?: boolean;
    emailUnavailable?: boolean;
    isBusyKey: (key: keyof NotificationPreferences) => boolean;
    onTogglePush: () => void;
    onToggleEmail: () => void;
    onTogglePreference: (key: keyof NotificationPreferences) => void;
  }

  let {
    preferences,
    pushDeviceState,
    pushDescription,
    pushStatus,
    pushAriaLabel,
    emailDescription,
    emailStatus,
    emailAriaLabel,
    emailPreferenceItems,
    pushBusy = false,
    emailBusy = false,
    emailUnavailable = false,
    isBusyKey,
    onTogglePush,
    onToggleEmail,
    onTogglePreference,
  }: Props = $props();

  const pushReady = $derived(
    preferences.pushEnabled && pushDeviceState === "ready"
  );
  const pushUnavailable = $derived(
    pushDeviceState === "checking" ||
      (!preferences.pushEnabled &&
        (pushDeviceState === "blocked" || pushDeviceState === "unsupported"))
  );
  const pushStatusTone = $derived<"on" | "off" | "action" | "warning">(
    pushDeviceState === "blocked" || pushDeviceState === "unsupported"
      ? "warning"
      : pushDeviceState === "failed"
        ? "action"
        : !preferences.pushEnabled
          ? "off"
          : pushReady
            ? "on"
            : pushDeviceState === "setup-required"
              ? "action"
              : "off"
  );
  const pushStatusIcon = $derived(
    pushDeviceState === "blocked"
      ? "fa-lock"
      : pushDeviceState === "unsupported"
        ? "fa-ban"
        : pushDeviceState === "failed"
          ? "fa-rotate-right"
          : !preferences.pushEnabled
            ? "fa-circle"
            : pushReady
              ? "fa-circle-check"
              : pushDeviceState === "setup-required"
                ? "fa-arrow-right"
                : "fa-circle"
  );
</script>

<section class="delivery-region" aria-labelledby="delivery-heading">
  <SettingsSectionHeader
    icon="fas fa-paper-plane"
    title={t("feedback_delivery_methods")}
    description={t("feedback_delivery_methods_desc")}
    headingId="delivery-heading"
  />

  <div class="channel-list">
    <NotificationChannelCard
      label={t("feedback_push_notifications")}
      description={pushDescription}
      status={pushStatus}
      icon={pushReady ? "fa-bell" : "fa-bell-slash"}
      statusIcon={pushStatusIcon}
      statusTone={pushStatusTone}
      enabled={pushReady}
      busy={pushBusy}
      disabled={pushUnavailable}
      ariaLabel={pushAriaLabel}
      onToggle={onTogglePush}
    />

    <NotificationChannelCard
      label={t("feedback_email_notifications")}
      description={emailDescription}
      status={emailStatus}
      icon={preferences.emailEnabled ? "fa-envelope" : "fa-envelope-open"}
      statusIcon={emailUnavailable
        ? "fa-triangle-exclamation"
        : preferences.emailEnabled
          ? "fa-circle-check"
          : "fa-circle"}
      statusTone={emailUnavailable
        ? "warning"
        : preferences.emailEnabled
          ? "on"
          : "off"}
      enabled={preferences.emailEnabled}
      switchChecked={preferences.emailEnabled}
      busy={emailBusy}
      disabled={emailUnavailable}
      ariaLabel={emailAriaLabel}
      onToggle={onToggleEmail}
    />
  </div>

  <div class="email-topics" class:topics-disabled={!preferences.emailEnabled}>
    <PreferenceGroup
      title={t("feedback_email_categories")}
      description={t("feedback_email_categories_desc")}
      icon="fa-at"
      items={emailPreferenceItems}
      {preferences}
      {isBusyKey}
      onToggle={onTogglePreference}
      disabled={!preferences.emailEnabled}
      framed={false}
    />
  </div>
</section>

<style>
  .delivery-region {
    display: flex;
    min-width: 0;
    flex-direction: column;
  }

  .channel-list {
    display: flex;
    min-width: 0;
    flex-direction: column;
  }

  .channel-list :global(.channel-card + .channel-card) {
    border-top: 1px solid var(--theme-stroke);
  }

  .email-topics {
    border-top: 1px solid var(--theme-stroke);
    transition: opacity var(--duration-normal) ease;
  }

  .email-topics.topics-disabled {
    opacity: 0.62;
  }

  @media (prefers-reduced-motion: reduce) {
    .email-topics {
      transition: none;
    }
  }
</style>
