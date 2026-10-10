<!--
  NotificationPreferencesPanel — notification settings orchestration.

  Delivery presentation and topic rows live in focused child components. This
  file owns loading, persistence, device registration, and page composition.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
  import { featureFlagService } from "#lib/shared/auth/services/post-hog-feature-flag-service.svelte.js";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { showToast } from "#lib/shared/toast/state/toast-state.svelte.js";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import SettingsSectionHeader from "#lib/shared/settings/components/SettingsSectionHeader.svelte";
  import { getErrorHandler } from "#lib/shared/application/get-error-handler.js";
  import { getFCMTokenManager } from "#lib/shared/push/get-fcm-token-manager.js";
  import type { PushDeviceRegistrationState } from "#lib/shared/push/services/fcm-token-manager.js";
  import {
    userPreviewState,
    getPreviewNotificationPreferences,
  } from "#lib/shared/debug/state/user-preview-state.svelte.js";
  import type {
    NotificationPreferences,
    NotificationType,
  } from "#lib/shared/feedback/domain/models/notification-models.js";
  import {
    DEFAULT_NOTIFICATION_PREFERENCES,
    NOTIFICATION_TYPE_CONFIG,
    getPreferenceKeyForType,
  } from "#lib/shared/feedback/domain/models/notification-models.js";
  import * as notificationPreferencesManager from "#lib/features/feedback/services/notification-preferences-manager.js";
  import { getNotificationPreferenceGroup } from "#lib/features/feedback/domain/notification-preference-group.js";
  import NotificationDeliverySection from "./notifications/NotificationDeliverySection.svelte";
  import PreferenceGroup from "./notifications/PreferenceGroup.svelte";
  import type { PreferenceItem } from "./notifications/preference-item";

  type PreferenceGroupId = "messages" | "feedback" | "activity" | "admin";

  type PreferenceGroupData = {
    id: PreferenceGroupId;
    title: string;
    description: string;
    icon: string;
    items: PreferenceItem[];
  };

  let preferences = $state<NotificationPreferences>(
    DEFAULT_NOTIFICATION_PREFERENCES
  );
  let isLoading = $state(true);
  let bulkBusy = $state<"enable" | "disable" | null>(null);
  let pendingKeys = $state<Set<keyof NotificationPreferences>>(new Set());
  let pushToggleBusy = $state(false);
  let emailToggleBusy = $state(false);
  let pushDeviceState = $state<PushDeviceRegistrationState>("checking");
  let loadError = $state(false);

  const isPreviewMode = $derived(userPreviewState.isActive);
  // effectiveRole, not authState.isAdmin: the admin toolbar's role chips set a
  // debug override, and an admin viewing as Tester or Free User must see the
  // page that role sees. The service clears the override for non-admins.
  const showAdminPreferences = $derived(
    isPreviewMode
      ? userPreviewState.data.profile?.role === "admin"
      : featureFlagService.effectiveRole === "admin"
  );

  onMount(() => {
    void initializePreferences();
  });

  $effect(() => {
    if (!isPreviewMode) return;

    const previewPrefs = getPreviewNotificationPreferences();
    if (previewPrefs) {
      preferences = previewPrefs;
      isLoading = false;
      loadError = false;
    }
  });

  function asError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
  }

  function reportSettingsFailure(
    error: unknown,
    message: string,
    action: string,
    severity: "warning" | "error" = "warning",
    additionalData?: Record<string, unknown>
  ): void {
    const resolvedError = asError(error);
    getErrorHandler().showUserError({
      message,
      technicalDetails: resolvedError.message,
      error: resolvedError,
      severity,
      context: {
        module: "settings",
        tab: "notifications",
        action,
        additionalData,
      },
    });
  }

  async function initializePreferences(): Promise<void> {
    const loaded = await loadPreferences();
    if (loaded) await loadPushDeviceState();
  }

  async function loadPreferences(): Promise<boolean> {
    const user = authState.user;
    if (!user) {
      isLoading = false;
      loadError = false;
      return false;
    }

    try {
      isLoading = true;
      loadError = false;
      preferences = await notificationPreferencesManager.getPreferences(
        user.uid
      );
      return true;
    } catch (error) {
      loadError = true;
      reportSettingsFailure(
        error,
        t("feedback_preferences_load_failed"),
        "load-notification-preferences",
        "error"
      );
      return false;
    } finally {
      isLoading = false;
    }
  }

  async function refreshPreferences(userId: string) {
    preferences = await notificationPreferencesManager.getPreferences(userId);
  }

  async function loadPushDeviceState(): Promise<void> {
    const user = authState.user;
    if (!user) return;

    const fcmTokenManager = getFCMTokenManager();
    try {
      pushDeviceState = "checking";
      pushDeviceState = preferences.pushEnabled
        ? await fcmTokenManager.getRegistrationState(user.uid)
        : await fcmTokenManager.getSetupState();
    } catch (error) {
      pushDeviceState = "failed";
      reportSettingsFailure(
        error,
        t("feedback_push_check_failed"),
        "check-push-registration"
      );
    }
  }

  async function togglePreference(key: keyof NotificationPreferences) {
    if (isPreviewMode) return;

    const user = authState.user;
    if (!user || pendingKeys.has(key)) return;

    const previousPreferences = preferences;
    try {
      pendingKeys.add(key);
      preferences = { ...preferences, [key]: !preferences[key] };
      await notificationPreferencesManager.togglePreference(user.uid, key);
    } catch (error) {
      preferences = previousPreferences;
      reportSettingsFailure(
        error,
        t("feedback_preference_update_failed"),
        "toggle-notification-preference",
        "warning",
        { preference: key }
      );
    } finally {
      pendingKeys.delete(key);
    }
  }

  async function setAllAlerts(enabled: boolean) {
    if (isPreviewMode) return;

    const user = authState.user;
    if (!user || bulkBusy) return;

    try {
      bulkBusy = enabled ? "enable" : "disable";
      await notificationPreferencesManager.setAllEventPreferences(
        user.uid,
        enabled
      );
      await refreshPreferences(user.uid);
    } catch (error) {
      reportSettingsFailure(
        error,
        t("feedback_bulk_update_failed"),
        enabled ? "enable-all-alerts" : "disable-all-alerts"
      );
    } finally {
      bulkBusy = null;
    }
  }

  async function togglePushEnabled() {
    if (isPreviewMode) return;

    const user = authState.user;
    if (!user || pushToggleBusy) return;

    const fcmTokenManager = getFCMTokenManager();
    const previousPreferences = preferences;
    const previousDeviceState = pushDeviceState;
    try {
      pushToggleBusy = true;

      if (preferences.pushEnabled && pushDeviceState === "ready") {
        await fcmTokenManager.unregisterToken(user.uid);
        preferences = { ...preferences, pushEnabled: false };
        await notificationPreferencesManager.savePreferences(
          user.uid,
          preferences
        );
        pushDeviceState = await fcmTokenManager.getSetupState();
        return;
      }

      if (
        preferences.pushEnabled &&
        ["unsupported", "blocked"].includes(pushDeviceState)
      ) {
        preferences = { ...preferences, pushEnabled: false };
        await notificationPreferencesManager.savePreferences(
          user.uid,
          preferences
        );
        return;
      }

      pushDeviceState = await fcmTokenManager.enableForCurrentDevice(user.uid);

      if (pushDeviceState === "ready") {
        preferences = { ...preferences, pushEnabled: true };
        await notificationPreferencesManager.savePreferences(
          user.uid,
          preferences
        );
      } else if (pushDeviceState === "blocked") {
        showToast(t("feedback_push_blocked_desc"), "warning", 5000);
      } else if (pushDeviceState === "unsupported") {
        showToast(t("feedback_push_unsupported_desc"), "warning", 5000);
      } else if (pushDeviceState === "failed") {
        showToast(t("feedback_push_failed_desc"), "error", 5000);
      }
    } catch (error) {
      preferences = previousPreferences;
      pushDeviceState = previousDeviceState;
      reportSettingsFailure(
        error,
        t("feedback_push_update_failed"),
        "update-push-notifications"
      );
    } finally {
      pushToggleBusy = false;
    }
  }

  async function toggleEmailEnabled() {
    if (isPreviewMode) return;

    const user = authState.user;
    if (!user || emailToggleBusy || !user.email || !user.emailVerified) return;

    const enabling = !preferences.emailEnabled;
    const noCategoriesSelected =
      !preferences.emailMessages &&
      !preferences.emailFeedback &&
      !preferences.emailPlatformUpdates;

    const previousPreferences = preferences;
    try {
      emailToggleBusy = true;
      preferences = {
        ...preferences,
        emailEnabled: enabling,
        ...(enabling && noCategoriesSelected
          ? {
              emailMessages: true,
              emailFeedback: true,
              emailPlatformUpdates: true,
            }
          : {}),
      };
      await notificationPreferencesManager.savePreferences(
        user.uid,
        preferences
      );
    } catch (error) {
      preferences = previousPreferences;
      reportSettingsFailure(
        error,
        t("feedback_email_update_failed"),
        "update-email-notifications"
      );
    } finally {
      emailToggleBusy = false;
    }
  }

  function getPushDescription(): string {
    const descriptions: Record<PushDeviceRegistrationState, string> = {
      checking: t("feedback_push_checking_desc"),
      unsupported: t("feedback_push_unsupported_desc"),
      blocked: t("feedback_push_blocked_desc"),
      "setup-required": t("feedback_push_setup_desc"),
      ready: t("feedback_push_ready_desc"),
      failed: t("feedback_push_failed_desc"),
    };

    if (
      pushDeviceState === "checking" ||
      pushDeviceState === "unsupported" ||
      pushDeviceState === "blocked" ||
      pushDeviceState === "failed"
    ) {
      return descriptions[pushDeviceState];
    }

    if (!preferences.pushEnabled) return t("feedback_push_account_off_desc");
    return descriptions[pushDeviceState];
  }

  function getPushStatus(): string {
    const statuses: Record<PushDeviceRegistrationState, string> = {
      checking: t("feedback_push_checking"),
      unsupported: t("feedback_push_unavailable"),
      blocked: t("feedback_push_blocked"),
      "setup-required": t("feedback_push_setup"),
      ready: t("feedback_state_on"),
      failed: t("feedback_push_retry"),
    };

    if (
      pushDeviceState === "checking" ||
      pushDeviceState === "unsupported" ||
      pushDeviceState === "blocked" ||
      pushDeviceState === "failed"
    ) {
      return statuses[pushDeviceState];
    }

    if (!preferences.pushEnabled) return t("feedback_state_off");
    return statuses[pushDeviceState];
  }

  function getPushAriaLabel(): string {
    if (
      preferences.pushEnabled &&
      ["ready", "blocked", "unsupported"].includes(pushDeviceState)
    ) {
      return t("feedback_turn_push_off");
    }

    if (pushDeviceState === "checking") {
      return t("feedback_push_checking_desc");
    }

    if (pushDeviceState === "blocked") {
      return t("feedback_push_blocked_desc");
    }

    if (pushDeviceState === "unsupported") {
      return t("feedback_push_unsupported_desc");
    }

    if (pushDeviceState === "failed") return t("feedback_retry_push");
    if (pushDeviceState === "setup-required") return t("feedback_setup_push");
    return t("feedback_turn_push_on");
  }

  function getEmailDescription(): string {
    const user = authState.user;
    if (!user?.email) return t("feedback_email_missing_desc");
    if (!user.emailVerified) return t("feedback_email_unverified_desc");
    if (!preferences.emailEnabled) return t("feedback_email_off_desc");
    return t("feedback_email_on_desc", { email: user.email });
  }

  function getEmailStatus(): string {
    const user = authState.user;
    if (!user?.email) return t("feedback_email_unavailable");
    if (!user.emailVerified) return t("feedback_email_verify");
    return preferences.emailEnabled
      ? t("feedback_state_on")
      : t("feedback_state_off");
  }

  function getEmailAriaLabel(): string {
    const user = authState.user;
    if (!user?.email) return t("feedback_email_missing_desc");
    if (!user.emailVerified) return t("feedback_email_unverified_desc");
    return preferences.emailEnabled
      ? t("feedback_turn_email_off")
      : t("feedback_turn_email_on");
  }

  function generatePreferenceGroups(): PreferenceGroupData[] {
    const messages: PreferenceItem[] = [];
    const feedback: PreferenceItem[] = [];
    const engagement: PreferenceItem[] = [];
    const social: PreferenceItem[] = [];
    const admin: PreferenceItem[] = [];
    const itemsByGroup = { messages, feedback, engagement, social, admin };

    const typeDescriptions: Partial<Record<NotificationType, string>> = {
      "feedback-resolved": t("feedback_notif_desc_resolved"),
      "feedback-in-progress": t("feedback_notif_desc_in_progress"),
      "feedback-needs-info": t("feedback_notif_desc_needs_info"),
      "feedback-response": t("feedback_notif_desc_response"),
      "sequence-liked": t("feedback_notif_desc_liked"),
      "user-followed": t("feedback_notif_desc_followed"),
      "achievement-unlocked": t("feedback_notif_desc_achievement"),
      "message-received": t("feedback_notif_desc_message"),
      "admin-new-user-signup": t("feedback_notif_desc_signup"),
      "admin-user-returned": t("feedback_notif_desc_user_returned"),
      "admin-qr-scan": t("feedback_notif_desc_qr_scan"),
      "admin-content-created": t("feedback_notif_desc_content_created"),
    };

    for (const [type, config] of Object.entries(NOTIFICATION_TYPE_CONFIG)) {
      const notificationType = type as NotificationType;
      const prefKey = getPreferenceKeyForType(notificationType);
      if (!prefKey) continue;

      const group = getNotificationPreferenceGroup(notificationType);
      if (!group) continue;

      itemsByGroup[group].push({
        key: prefKey,
        label: config.label,
        description: typeDescriptions[notificationType] ?? config.label,
      });
    }

    const groups: PreferenceGroupData[] = [];

    if (messages.length > 0) {
      groups.push({
        id: "messages",
        title: t("feedback_group_messages"),
        description: t("feedback_group_messages_desc"),
        icon: "fa-message",
        items: messages,
      });
    }

    if (feedback.length > 0) {
      groups.push({
        id: "feedback",
        title: t("feedback_group_feedback"),
        description: t("feedback_group_feedback_desc"),
        icon: "fa-comment-dots",
        items: feedback,
      });
    }

    const activity = [...engagement, ...social];
    if (activity.length > 0) {
      groups.push({
        id: "activity",
        title: t("feedback_group_activity"),
        description: t("feedback_group_activity_desc"),
        icon: "fa-heart",
        items: activity,
      });
    }

    if (admin.length > 0) {
      groups.push({
        id: "admin",
        title: t("feedback_group_admin"),
        description: t("feedback_group_admin_desc"),
        icon: "fa-shield-halved",
        items: admin,
      });
    }

    return groups;
  }

  const preferenceGroups = $derived(generatePreferenceGroups());
  const visiblePreferenceGroups = $derived(
    preferenceGroups.filter(
      (group) => group.id !== "admin" || showAdminPreferences
    )
  );
  const emailPreferenceItems = $derived<PreferenceItem[]>([
    {
      key: "emailMessages",
      label: t("feedback_email_messages"),
      description: t("feedback_email_messages_desc"),
    },
    {
      key: "emailFeedback",
      label: t("feedback_email_feedback"),
      description: t("feedback_email_feedback_desc"),
    },
    {
      key: "emailPlatformUpdates",
      label: t("feedback_email_platform_updates"),
      description: t("feedback_email_platform_updates_desc"),
    },
  ]);
</script>

{#snippet alertActions()}
  <span
    class="alert-actions"
    aria-label={t("create_review_bulk_alert_controls")}
  >
    <PanelButton
      variant="quiet"
      onclick={() => setAllAlerts(true)}
      disabled={bulkBusy !== null}
      ariaLabel={t("feedback_enable_all")}
      ariaBusy={bulkBusy === "enable"}
    >
      <i class="fas fa-check" aria-hidden="true"></i>
      <span>{t("feedback_enable_all")}</span>
    </PanelButton>
    <PanelButton
      variant="quiet"
      onclick={() => setAllAlerts(false)}
      disabled={bulkBusy !== null}
      ariaLabel={t("feedback_disable_all")}
      ariaBusy={bulkBusy === "disable"}
    >
      <i class="fas fa-ban" aria-hidden="true"></i>
      <span>{t("feedback_disable_all")}</span>
    </PanelButton>
  </span>
{/snippet}

<div class="notification-preferences-panel" class:preview-mode={isPreviewMode}>
  {#if isPreviewMode}
    <div class="preview-banner">
      <i class="fas fa-eye" aria-hidden="true"></i>
      <span>
        Viewing {userPreviewState.data.profile?.displayName ?? "user"}'s
        preferences. Changes are disabled.
      </span>
    </div>
  {/if}

  {#if isLoading}
    <div class="state-surface" role="status">
      <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
      <p>{t("feedback_loading_prefs")}</p>
    </div>
  {:else if loadError}
    <div class="state-surface error-state" role="alert">
      <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
      <h2>{t("feedback_preferences_load_failed")}</h2>
      <p>{t("feedback_preferences_load_failed_desc")}</p>
      <PanelButton variant="secondary" onclick={initializePreferences}>
        <i class="fas fa-rotate-right" aria-hidden="true"></i>
        <span>{t("common_retry")}</span>
      </PanelButton>
    </div>
  {:else if !authState.isAuthenticated}
    <div class="state-surface">
      <i class="fas fa-user-slash" aria-hidden="true"></i>
      <p>{t("feedback_sign_in_prefs")}</p>
    </div>
  {:else}
    <div class="notification-workspace" class:has-delivery={!isPreviewMode}>
      {#if !isPreviewMode}
        <div class="workspace-column">
          <NotificationDeliverySection
            {preferences}
            {pushDeviceState}
            pushDescription={getPushDescription()}
            pushStatus={getPushStatus()}
            pushAriaLabel={getPushAriaLabel()}
            emailDescription={getEmailDescription()}
            emailStatus={getEmailStatus()}
            emailAriaLabel={getEmailAriaLabel()}
            {emailPreferenceItems}
            pushBusy={pushToggleBusy}
            emailBusy={emailToggleBusy}
            emailUnavailable={!preferences.emailEnabled &&
              (!authState.user?.email || !authState.user.emailVerified)}
            isBusyKey={(key) => pendingKeys.has(key)}
            onTogglePush={togglePushEnabled}
            onToggleEmail={toggleEmailEnabled}
            onTogglePreference={togglePreference}
          />
        </div>
      {/if}

      <section
        class="workspace-column alerts-region"
        aria-labelledby="alerts-heading"
      >
        <SettingsSectionHeader
          icon="fas fa-inbox"
          title={t("feedback_in_app_alerts")}
          description={t("feedback_in_app_alerts_desc")}
          headingId="alerts-heading"
          action={isPreviewMode ? undefined : alertActions}
        />

        <div class="alert-groups">
          {#each visiblePreferenceGroups as group (group.id)}
            <PreferenceGroup
              title={group.title}
              description={group.description}
              icon={group.icon}
              items={group.items}
              {preferences}
              isBusyKey={(key) => pendingKeys.has(key)}
              onToggle={togglePreference}
              disabled={isPreviewMode}
              framed={false}
            />
          {/each}
        </div>
      </section>

      <footer class="system-notice">
        <i class="fas fa-shield" aria-hidden="true"></i>
        <p>{t("feedback_system_notice")}</p>
      </footer>
    </div>
  {/if}
</div>

<style>
  /* Same frame as Preferences and Account: one panel in the middle of the
     tab, sections opened by header bands and split by hairlines. */
  .notification-preferences-panel {
    container: notification-preferences / inline-size;
    display: grid;
    flex: 1 1 auto;
    align-content: safe center;
    gap: 0.9em;
    width: 100%;
    min-height: 100%;
    min-width: 0;
    padding: clamp(0.75em, 1.4cqi, 1.75em) clamp(0.75em, 2cqi, 3em);
  }

  .preview-banner,
  .state-surface,
  .notification-workspace {
    width: 100%;
    max-width: 84rem;
    min-width: 0;
    margin-inline: auto;
  }

  .preview-banner {
    display: flex;
    align-items: center;
    gap: 0.65em;
    min-height: var(--min-touch-target);
    padding: 0.65em 0.9em;
    border: 1px solid color-mix(in srgb, #8b5cf6 45%, transparent);
    border-radius: 0.75em;
    color: #ddd6fe;
    background: color-mix(in srgb, #8b5cf6 14%, var(--theme-panel-bg));
    font-size: max(0.875rem, var(--font-size-sm));
  }

  .state-surface {
    display: flex;
    min-height: 18em;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 0.75em;
    border: 1px solid var(--theme-stroke-strong, var(--theme-stroke));
    border-radius: 1.25em;
    color: var(--theme-text-dim);
    background: var(--theme-panel-bg);
  }

  .state-surface i {
    font-size: var(--font-size-3xl);
  }

  .state-surface p {
    margin: 0;
    font-size: var(--font-size-sm);
  }

  .state-surface h2 {
    margin: 0;
    color: var(--theme-text);
    font-size: var(--font-size-xl);
  }

  .state-surface.error-state i {
    color: var(--semantic-error);
  }

  .state-surface :global(.panel-btn) {
    width: auto;
    margin-top: 0.35em;
  }

  .notification-workspace {
    --settings-row-inline: 1.15em;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    overflow: hidden;
    border: 1px solid var(--theme-stroke-strong, var(--theme-stroke));
    border-radius: 1.25em;
    background: color-mix(
      in srgb,
      var(--theme-panel-bg, rgba(0, 0, 0, 0.88)) 14%,
      #070b10 86%
    );
    box-shadow: var(--theme-panel-shadow, 0 1rem 3rem rgba(0, 0, 0, 0.35));
    isolation: isolate;
  }

  :global(html[data-theme-luminance="bright"]) .notification-workspace {
    background: color-mix(
      in srgb,
      var(--theme-panel-bg, rgba(255, 255, 255, 0.88)) 14%,
      #f6f7f9 86%
    );
  }

  /* Previewing another person's settings shows alerts only; one full-width
     column would stretch every row across the screen. */
  .notification-workspace:not(.has-delivery) {
    max-width: 48rem;
  }

  .workspace-column {
    display: flex;
    min-width: 0;
    flex-direction: column;
    background: color-mix(in srgb, var(--theme-text) 2%, transparent);
  }

  .workspace-column + .workspace-column {
    border-top: 1px solid var(--theme-stroke);
  }

  .alert-actions {
    display: flex;
    align-items: center;
    gap: 0.5em;
  }

  /* Every group carries a top hairline; pulling the list up by one pixel
     lays the first one over the band's own rule, so each column of groups
     starts with a single line. */
  .alert-groups {
    margin-top: -1px;
  }

  .alerts-region .alert-groups :global(.preference-group.flush) {
    border-top: 1px solid var(--theme-stroke);
    break-inside: avoid;
  }

  .system-notice {
    display: flex;
    align-items: center;
    gap: 0.65em;
    min-height: var(--min-touch-target);
    padding: 0.75em var(--settings-row-inline);
    border-top: 1px solid var(--theme-stroke);
    color: var(--theme-text-dim);
    background: color-mix(in srgb, var(--theme-text) 3%, transparent);
  }

  .system-notice i {
    flex: 0 0 auto;
    color: var(--theme-accent-text, var(--theme-accent));
  }

  .system-notice p {
    margin: 0;
    font-size: max(0.875rem, var(--font-size-min));
    line-height: 1.4;
  }

  /* Delivery and alerts side by side, sharing one seam; the notice runs
     across the foot. */
  @container notification-preferences (min-width: 52rem) {
    .notification-workspace.has-delivery {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .has-delivery .workspace-column + .workspace-column {
      border-top: 0;
      border-left: 1px solid var(--theme-stroke);
    }

    .system-notice {
      grid-column: 1 / -1;
    }
  }

  /* With room for it, alerts take the wider share and set their groups in
     two balanced columns, so the two sides of the panel end near each other
     instead of leaving delivery with a tall empty strip. */
  @container notification-preferences (min-width: 60rem) {
    .notification-workspace.has-delivery {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1.6fr);
    }
  }

  /* Alert groups split into two balanced columns whenever the alerts side
     is wide enough: stacked tablets, and wide screens. Between the two, the
     even side-by-side split leaves it too narrow, so it stays one column. */
  @container notification-preferences (min-width: 40rem) {
    .alert-groups {
      columns: 2;
      column-gap: 0;
      column-rule: 1px solid var(--theme-stroke);
    }
  }

  @container notification-preferences (52rem <= width < 60rem) {
    .has-delivery .alert-groups {
      columns: auto;
    }
  }

  @container notification-preferences (min-width: 105rem) {
    .notification-workspace {
      --settings-row-inline: 1.35em;
    }
  }

  @container notification-preferences (max-width: 32rem) {
    .notification-preferences-panel {
      align-content: start;
      padding-inline: 0.65rem;
    }

    .notification-workspace {
      --settings-row-inline: 0.9rem;
    }

    /* The bulk switches keep their words on a phone: they drop under the
       heading and share the row instead of shrinking to bare icons. */
    .alerts-region :global(.section-header) {
      flex-wrap: wrap;
    }

    .alerts-region :global(.section-heading) {
      flex: 1 1 0;
    }

    .alerts-region :global(.section-action) {
      flex: 1 1 100%;
    }

    .alert-actions {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .notification-workspace .alert-actions :global(.panel-btn) {
      width: 100%;
      min-width: 0;
    }

    .notification-workspace .alert-actions :global(.panel-btn span) {
      display: inline;
    }
  }

  @media (prefers-contrast: more) {
    .notification-workspace,
    .preview-banner {
      border-width: 2px;
    }
  }
</style>
