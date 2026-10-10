<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
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
  <header class="region-header">
    <span class="region-icon" aria-hidden="true">
      <i class="fas fa-paper-plane"></i>
    </span>
    <span class="region-heading">
      <h2 id="delivery-heading">{t("feedback_delivery_methods")}</h2>
      <p>{t("feedback_delivery_methods_desc")}</p>
    </span>
  </header>

  <div class="delivery-body">
    <div class="channel-stack">
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
        layout="grid-3"
      />
    </div>
  </div>
</section>

<style>
  .delivery-region {
    container: delivery-region / inline-size;
    display: flex;
    min-width: 0;
    height: 100%;
    flex-direction: column;
  }

  .region-header {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 0.8em;
    min-height: 5em;
    padding: 0.9em 1.1em;
    border-bottom: 1px solid var(--theme-stroke);
    background: color-mix(in srgb, var(--theme-text) 3%, transparent);
  }

  .region-icon {
    display: grid;
    width: 2.7em;
    height: 2.7em;
    place-items: center;
    border: 1px solid color-mix(in srgb, var(--theme-accent) 24%, transparent);
    border-radius: 0.75em;
    color: var(--theme-accent-text, var(--theme-accent));
    background: color-mix(in srgb, var(--theme-accent) 12%, transparent);
  }

  .region-heading {
    min-width: 0;
  }

  .region-heading h2,
  .region-heading p {
    margin: 0;
  }

  .region-heading h2 {
    color: var(--theme-text);
    font-size: max(1.125rem, var(--font-size-lg));
    font-weight: 750;
    line-height: 1.25;
  }

  .region-heading p {
    margin-top: 0.2em;
    color: var(--theme-text-dim);
    font-size: max(0.875rem, var(--font-size-min));
    line-height: 1.35;
  }

  .delivery-body {
    display: flex;
    min-width: 0;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 1em;
    padding: 1em;
  }

  .channel-stack {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 0.65em;
  }

  .email-topics {
    transition: opacity var(--duration-normal) ease;
  }

  .email-topics.topics-disabled {
    opacity: 0.62;
  }

  /* Two across only when each card can hold its status line without wrapping —
     the email card carries a full address, so a 44rem split left it in ribbons. */
  @container delivery-region (min-width: 54rem) {
    .channel-stack {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .email-topics {
      transition: none;
    }
  }
</style>
