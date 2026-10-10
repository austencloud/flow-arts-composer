<!--
  AnnouncementForm - Create/Edit Announcement (2025 Design)

  Modern chip-based form with solid gradients and vibrant colors.
-->
<script lang="ts">
  import { authState } from "$lib/shared/auth/state/auth-state.svelte";
  import {
    createAnnouncement,
    updateAnnouncement,
  } from "$lib/features/admin/services/announcement-manager";
  import type {
    Announcement,
    AnnouncementSeverity,
    AnnouncementAudience,
  } from "../../domain/models/announcement-models";
  import UserSearchInput from "$lib/shared/user-search/UserSearchInput.svelte";
  import type { UserSearchResult } from "$lib/shared/user-search/services/types";
  import { t } from "$lib/shared/i18n/i18n.svelte.js";

  interface Props {
    announcement?: Announcement | null;
    onSave: () => void;
    onCancel: () => void;
  }

  let { announcement = null, onSave, onCancel }: Props = $props();

  // Form state - initialize with defaults, $effect syncs when announcement prop changes
  let title = $state("");
  let message = $state("");
  let severity = $state<AnnouncementSeverity>("info");
  let targetAudience = $state<AnnouncementAudience>("all");
  let targetUserId = $state("");
  let targetUserDisplay = $state(""); // Display name for selected user
  let showAsModal = $state(true);
  let hasExpiration = $state(false);
  let expirationDate = $state("");
  let actionUrl = $state("");
  let actionLabel = $state("");

  // Sync form state when announcement prop changes (for edit mode)
  $effect(() => {
    if (announcement) {
      title = announcement.title ?? "";
      message = announcement.message ?? "";
      severity = announcement.severity ?? "info";
      targetAudience = announcement.targetAudience ?? "all";
      targetUserId = announcement.targetUserId ?? "";
      showAsModal = announcement.showAsModal ?? true;
      hasExpiration = !!announcement.expiresAt;
      expirationDate = announcement.expiresAt
        ? (new Date(announcement.expiresAt).toISOString().split("T")[0] ?? "")
        : "";
      actionUrl = announcement.actionUrl ?? "";
      actionLabel = announcement.actionLabel ?? "";
    }
  });

  let isSaving = $state(false);
  let error = $state<string | null>(null);

  // Handler for user selection
  function handleUserSelect(user: UserSearchResult) {
    targetUserId = user.uid;
    targetUserDisplay = user.displayName || user.username || "Unknown";
  }

  // Severity options with colors
  const severityOptions: {
    value: AnnouncementSeverity;
    label: string;
    icon: string;
    color: string;
  }[] = [
    {
      value: "info",
      label: "Info",
      icon: "fa-info-circle",
      color: "var(--theme-accent)",
    },
    {
      value: "warning",
      label: "Warning",
      icon: "fa-exclamation-triangle",
      color: "var(--semantic-warning)",
    },
    {
      value: "critical",
      label: "Critical",
      icon: "fa-exclamation-circle",
      color: "var(--semantic-error)",
    },
  ];

  // Audience options
  const audienceOptions: {
    value: AnnouncementAudience;
    label: string;
    icon: string;
  }[] = [
    { value: "all", label: "All Users", icon: "fa-users" },
    { value: "admins", label: "Admins Only", icon: "fa-shield-alt" },
    { value: "beta", label: "Beta Testers", icon: "fa-flask" },
    { value: "new", label: "New Users", icon: "fa-user-plus" },
    { value: "active", label: "Active Users", icon: "fa-user-check" },
    { value: "creators", label: "Creators", icon: "fa-magic" },
    { value: "specific-user", label: "Specific User", icon: "fa-user" },
  ];

  async function handleSubmit(e: Event) {
    e.preventDefault();

    // Validation
    if (!title.trim()) {
      error = t("form_error_title_required");
      return;
    }
    if (!message.trim()) {
      error = t("form_error_message_required");
      return;
    }
    if (hasExpiration && !expirationDate) {
      error = t("form_error_expiration_required");
      return;
    }
    if (targetAudience === "specific-user" && !targetUserId.trim()) {
      error = t("form_error_user_id_required");
      return;
    }

    const user = authState.user;
    if (!user) {
      error = t("form_error_login_required");
      return;
    }

    try {
      isSaving = true;
      error = null;

      const announcementData = {
        title: title.trim(),
        message: message.trim(),
        severity,
        targetAudience,
        targetUserId:
          targetAudience === "specific-user" ? targetUserId.trim() : undefined,
        showAsModal,
        expiresAt:
          hasExpiration && expirationDate
            ? new Date(expirationDate)
            : undefined,
        actionUrl: actionUrl.trim() || undefined,
        actionLabel: actionLabel.trim() || undefined,
        createdBy: user.uid,
      };

      if (announcement) {
        await updateAnnouncement(
          announcement.id,
          announcementData
        );
      } else {
        await createAnnouncement(announcementData);
      }

      onSave();
    } catch (err) {
      console.error("Failed to save announcement:", err);
      error = t("form_error_save_failed");
    } finally {
      isSaving = false;
    }
  }
</script>

<div class="announcement-form">
  <div class="form-header">
    <h2>{announcement ? t("admin_edit_announcement") : t("admin_create_announcement")}</h2>
    <button class="close-button" onclick={onCancel} aria-label={t("common_close")}>
      <i class="fas fa-times" aria-hidden="true"></i>
    </button>
  </div>

  <form data-save-shortcut-scope onsubmit={handleSubmit}>
    {#if error}
      <div class="error-message" role="alert" aria-live="assertive">
        <i class="fas fa-exclamation-circle" aria-hidden="true"></i>
        {error}
      </div>
    {/if}

    <!-- Title -->
    <div class="form-section">
      <label class="section-label" for="announcement-title">{t("form_title")}</label>
      <input
        id="announcement-title"
        type="text"
        class="text-input"
        bind:value={title}
        placeholder={t("form_title_placeholder")}
        maxlength="100"
        required
        aria-required="true"
      />
      <span class="char-count">{title.length}/100</span>
    </div>

    <!-- Message -->
    <div class="form-section">
      <label class="section-label" for="announcement-message">{t("form_message")}</label>
      <textarea
        id="announcement-message"
        class="text-input"
        bind:value={message}
        placeholder={t("form_message_placeholder")}
        rows="6"
        required
        aria-required="true"
      ></textarea>
      <span class="help-text">{t("form_markdown_hint")}</span>
    </div>

    <!-- Severity Selection (Chips) -->
    <div class="form-section">
      <span class="section-label" id="severity-label">{t("form_severity")}</span>
      <div class="chip-group" role="group" aria-labelledby="severity-label">
        {#each severityOptions as option}
          <button
            type="button"
            class="selection-chip"
            class:active={severity === option.value}
            style="--chip-color: {option.color}"
            onclick={() => (severity = option.value)}
            aria-pressed={severity === option.value}
          >
            <i class="fas {option.icon}" aria-hidden="true"></i>
            <span>{option.label}</span>
            {#if severity === option.value}
              <i class="fas fa-check chip-check" aria-hidden="true"></i>
            {/if}
          </button>
        {/each}
      </div>
    </div>

    <!-- Target Audience Selection (Chips) -->
    <div class="form-section">
      <span class="section-label" id="audience-label">{t("form_target_audience")}</span>
      <div class="chip-group" role="group" aria-labelledby="audience-label">
        {#each audienceOptions as option}
          <button
            type="button"
            class="selection-chip"
            class:active={targetAudience === option.value}
            onclick={() => (targetAudience = option.value)}
            aria-pressed={targetAudience === option.value}
          >
            <i class="fas {option.icon}" aria-hidden="true"></i>
            <span>{option.label}</span>
            {#if targetAudience === option.value}
              <i class="fas fa-check chip-check" aria-hidden="true"></i>
            {/if}
          </button>
        {/each}
      </div>
    </div>

    <!-- Specific User Search (conditional) -->
    {#if targetAudience === "specific-user"}
      <div class="form-section indented">
        <label class="section-label" for="user-search-input">{t("form_select_user")}</label>
        <UserSearchInput
          selectedUserId={targetUserId}
          selectedUserDisplay={targetUserDisplay}
          onSelect={handleUserSelect}
        />
        <span class="help-text">{t("form_search_name_email")}</span>
      </div>
    {/if}

    <!-- Display Options (Toggle Chips) -->
    <div class="form-section">
      <span class="section-label">{t("form_display_options")}</span>
      <div class="chip-group" role="group" aria-label={t("form_display_options")}>
        <button
          type="button"
          class="toggle-chip"
          class:active={showAsModal}
          onclick={() => (showAsModal = !showAsModal)}
          aria-pressed={showAsModal}
        >
          <i class="fas fa-window-maximize" aria-hidden="true"></i>
          <span>{t("form_show_modal")}</span>
          {#if showAsModal}
            <i class="fas fa-check chip-check" aria-hidden="true"></i>
          {/if}
        </button>

        <button
          type="button"
          class="toggle-chip"
          class:active={hasExpiration}
          onclick={() => (hasExpiration = !hasExpiration)}
          aria-pressed={hasExpiration}
        >
          <i class="fas fa-calendar-times" aria-hidden="true"></i>
          <span>{t("form_set_expiration")}</span>
          {#if hasExpiration}
            <i class="fas fa-check chip-check" aria-hidden="true"></i>
          {/if}
        </button>
      </div>
    </div>

    <!-- Expiration Date (conditional) -->
    {#if hasExpiration}
      <div class="form-section indented">
        <label class="section-label" for="expiration-date">{t("form_expiration_date")}</label>
        <input
          id="expiration-date"
          type="date"
          class="text-input"
          bind:value={expirationDate}
          required={hasExpiration}
        />
      </div>
    {/if}

    <!-- Action URL (optional) -->
    <div class="form-section">
      <label class="section-label" for="action-url"
        >{t("form_action_url")} <span class="optional">({t("form_optional")})</span></label
      >
      <input
        id="action-url"
        type="text"
        class="text-input"
        bind:value={actionUrl}
        placeholder={t("form_url_placeholder")}
      />
      <span class="help-text">{t("form_url_hint")}</span>
    </div>

    {#if actionUrl}
      <div class="form-section indented">
        <label class="section-label" for="action-label">{t("form_action_label")}</label>
        <input
          id="action-label"
          type="text"
          class="text-input"
          bind:value={actionLabel}
          placeholder={t("form_label_placeholder")}
          maxlength="30"
        />
      </div>
    {/if}

    <!-- Form Actions -->
    <div class="form-actions">
      <button type="button" class="cancel-button" onclick={onCancel}>
        <i class="fas fa-times" aria-hidden="true"></i>
        {t("form_cancel")}
      </button>
      <button
        data-save-shortcut
        type="submit"
        class="save-button"
        disabled={isSaving}
      >
        {#if isSaving}
          <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
          {t("form_saving")}
        {:else}
          <i class="fas fa-check" aria-hidden="true"></i>
          {announcement ? t("form_update") : t("form_create")}
        {/if}
      </button>
    </div>
  </form>
</div>

<style>
  .announcement-form {
    width: 100%;
    max-width: 800px;
    margin: 0 auto;
    padding: 0 4px;
  }

  .form-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 32px;
    padding-bottom: 20px;
    border-bottom: 2px solid
      color-mix(
        in srgb,
        var(--theme-accent, var(--theme-accent)) 20%,
        transparent
      );
  }

  .form-header h2 {
    font-size: var(--font-size-3xl);
    font-weight: 700;
    color: var(--theme-text, #ffffff);
    margin: 0;
    letter-spacing: -0.5px;
  }

  .close-button {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: var(--min-touch-target);
    min-height: var(--min-touch-target);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 2px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
    border-radius: 12px;
    color: var(--theme-text);
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .close-button:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
    color: var(--theme-text);
    transform: scale(1.05);
    border-color: var(--theme-stroke-strong);
  }

  .error-message {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px 20px;
    background: var(--semantic-error);
    border: 2px solid var(--semantic-error);
    border-radius: 12px;
    color: var(--theme-text, #ffffff);
    font-size: var(--font-size-sm);
    font-weight: 600;
    margin-bottom: 24px;
    box-shadow: 0 4px 12px rgba(220, 38, 38, 0.3);
  }

  .form-section {
    margin-bottom: 28px;
  }

  .section-label {
    display: block;
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--theme-text, #ffffff);
    margin-bottom: 12px;
    letter-spacing: -0.2px;
  }

  .optional {
    font-size: var(--font-size-compact);
    font-weight: 500;
    color: var(--theme-text-dim);
  }

  .text-input {
    width: 100%;
    padding: 16px 20px;
    min-height: var(--min-touch-target);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 2px solid
      color-mix(
        in srgb,
        var(--theme-accent) 30%,
        transparent
      );
    border-radius: 12px;
    color: var(--theme-text, #ffffff);
    font-size: var(--font-size-sm);
    font-family: inherit;
    transition: all var(--duration-normal) ease;
    resize: vertical;
  }

  .text-input::placeholder {
    color: var(--theme-text-dim);
  }

  .text-input:focus {
    outline: none;
    border-color: var(--theme-accent);
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
    box-shadow: 0 0 0 4px
      color-mix(
        in srgb,
        var(--theme-accent) 15%,
        transparent
      );
  }

  textarea.text-input {
    min-height: 140px;
    line-height: 1.6;
  }

  .char-count,
  .help-text {
    display: block;
    margin-top: 8px;
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim, var(--theme-text-dim));
    font-weight: 500;
  }

  .indented {
    margin-left: 20px;
    padding-left: 20px;
    border-left: 3px solid var(--theme-accent, var(--theme-accent));
  }

  /* ============================================================================
     CHIP GROUPS - 2025 SOLID DESIGN
     ============================================================================ */
  .chip-group {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  .selection-chip,
  .toggle-chip {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 20px;
    min-height: var(--min-touch-target);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 2px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
    border-radius: 12px;
    color: var(--theme-text);
    font-size: var(--font-size-sm);
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-normal) cubic-bezier(0.4, 0, 0.2, 1);
    user-select: none;
    -webkit-tap-highlight-color: transparent;
  }

  .selection-chip i:not(.chip-check),
  .toggle-chip i:not(.chip-check) {
    font-size: var(--font-size-base);
    opacity: 0.9;
  }

  .selection-chip:hover,
  .toggle-chip:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
    border-color: var(--theme-stroke-strong);
    color: var(--theme-text);
    transform: translateY(-2px);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  }

  .selection-chip.active {
    background: var(--chip-color, var(--theme-accent));
    border-color: var(--chip-color, var(--theme-accent));
    color: var(--theme-text, #ffffff);
    box-shadow:
      0 0 24px
        color-mix(
          in srgb,
          var(--chip-color, var(--theme-accent)) 40%,
          transparent
        ),
      0 4px 16px rgba(0, 0, 0, 0.4);
  }

  .toggle-chip.active {
    background: var(--theme-accent);
    border-color: var(--theme-accent);
    color: var(--theme-text, #ffffff);
    box-shadow:
      0 0 24px color-mix(in srgb, var(--theme-accent) 40%, transparent),
      0 4px 16px rgba(0, 0, 0, 0.4);
  }

  .chip-check {
    margin-left: auto;
    font-size: var(--font-size-sm);
    animation: checkPop var(--duration-normal) cubic-bezier(0.4, 0, 0.2, 1);
  }

  @keyframes checkPop {
    0% {
      transform: scale(0);
      opacity: 0;
    }
    50% {
      transform: scale(1.2);
    }
    100% {
      transform: scale(1);
      opacity: 1;
    }
  }

  .form-actions {
    display: flex;
    gap: 12px;
    margin-top: 40px;
    padding-top: 24px;
    border-top: 2px solid
      color-mix(
        in srgb,
        var(--theme-accent, var(--theme-accent)) 20%,
        transparent
      );
  }

  .cancel-button,
  .save-button {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 16px 28px;
    min-height: var(--min-touch-target);
    border-radius: 12px;
    font-size: var(--font-size-sm);
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-normal) cubic-bezier(0.4, 0, 0.2, 1);
    -webkit-tap-highlight-color: transparent;
  }

  .cancel-button {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 2px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
    color: var(--theme-text);
  }

  .cancel-button:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
    border-color: var(--theme-stroke-strong);
    color: var(--theme-text);
    transform: translateY(-2px);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  }

  .save-button {
    background: var(--theme-accent);
    border: 2px solid var(--theme-accent);
    color: var(--theme-text, #ffffff);
    box-shadow:
      0 0 20px color-mix(in srgb, var(--theme-accent) 30%, transparent),
      0 4px 16px rgba(0, 0, 0, 0.4);
  }

  .save-button:hover:not(:disabled) {
    background: color-mix(in srgb, var(--theme-accent) 120%, white);
    transform: translateY(-2px);
    box-shadow:
      0 0 30px color-mix(in srgb, var(--theme-accent) 50%, transparent),
      0 6px 20px rgba(0, 0, 0, 0.5);
  }

  .save-button:active:not(:disabled) {
    transform: translateY(0);
  }

  .save-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }

  @media (max-width: 640px) {
    .form-header h2 {
      font-size: var(--font-size-2xl);
    }

    .form-section {
      margin-bottom: 24px;
    }

    .chip-group {
      gap: 8px;
    }

    .selection-chip,
    .toggle-chip {
      padding: 12px 16px;
      font-size: var(--font-size-compact);
      min-height: var(--min-touch-target);
    }

    .form-actions {
      flex-direction: column;
      gap: 10px;
    }

    .indented {
      margin-left: 12px;
      padding-left: 12px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .selection-chip,
    .toggle-chip,
    .cancel-button,
    .save-button,
    .text-input {
      transition: none;
      animation: none;
    }

    .chip-check {
      animation: none;
    }

    .selection-chip:hover,
    .toggle-chip:hover,
    .cancel-button:hover,
    .save-button:hover {
      transform: none;
    }
  }
</style>
