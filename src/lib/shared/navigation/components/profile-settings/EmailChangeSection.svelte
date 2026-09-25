<!--
  EmailChangeSection Component

  Handles email change for password-authenticated users.
  Requires password re-authentication for security.
  Sends verification email to new address.
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import type { HapticFeedback } from "../../../application/services/haptic-feedback";
  import { getProfileSettingsContext } from "../../state/profile-settings-context.svelte";

  const ctx = getProfileSettingsContext();

  let { onChangeEmail, onCancel, hapticService } = $props<{
    onChangeEmail: () => Promise<void>;
    onCancel: () => void;
    hapticService: HapticFeedback | null;
  }>();

  // Validation state
  let emailError = $state("");
  let passwordError = $state("");

  function validateEmail() {
    // Email validation - requires valid format with proper TLD
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!ctx.emailChange.newEmail) {
      emailError = t("nav_ui_email_is_required");
      return false;
    }
    if (!emailRegex.test(ctx.emailChange.newEmail)) {
      emailError = t("nav_ui_please_enter_a_valid_email_address");
      return false;
    }
    emailError = "";
    return true;
  }

  function validatePassword() {
    if (!ctx.emailChange.password) {
      passwordError = t("nav_ui_password_is_required_for_verification");
      return false;
    }
    passwordError = "";
    return true;
  }

  async function handleSubmit() {
    const emailValid = validateEmail();
    const passwordValid = validatePassword();

    if (!emailValid || !passwordValid) {
      return;
    }

    await onChangeEmail();
  }

  function handleCancel() {
    hapticService?.trigger("selection");
    onCancel();
  }
</script>

<div
  class="email-change-section"
  class:compact={ctx.isCompactMode()}
  class:very-compact={ctx.isVeryCompactMode()}
>
  <div class="section-header">
    <i class="fas fa-envelope" aria-hidden="true"></i>
    <h4>{t("nav_ui_change_email_address")}</h4>
  </div>

  <p class="description">
    {t(
      "nav_ui_enter_your_new_email_address_and_current_password_to_verify_this_change_we_ll_send_a_"
    )}
  </p>

  <!-- New Email -->
  <div class="field">
    <label class="label" for="new-email">{t("nav_ui_new_email_address")}</label>
    <input
      id="new-email"
      type="email"
      class="input"
      class:error={emailError}
      bind:value={ctx.emailChange.newEmail}
      onblur={validateEmail}
      placeholder={t("nav_ui_enter_new_email_address")}
      disabled={ctx.ui.changingEmail}
      autocomplete="email"
      aria-invalid={!!emailError}
      aria-describedby={emailError ? "new-email-error" : undefined}
    />
    {#if emailError}
      <p id="new-email-error" class="error-message" role="alert">
        <i class="fas fa-exclamation-circle" aria-hidden="true"></i>
        {emailError}
      </p>
    {/if}
  </div>

  <!-- Current Password -->
  <div class="field">
    <label class="label" for="verify-password"
      >{t("nav_ui_current_password")}</label
    >
    <input
      id="verify-password"
      type="password"
      class="input"
      class:error={passwordError}
      bind:value={ctx.emailChange.password}
      onblur={validatePassword}
      placeholder={t("nav_ui_enter_your_current_password")}
      disabled={ctx.ui.changingEmail}
      autocomplete="current-password"
      aria-invalid={!!passwordError}
      aria-describedby={passwordError ? "verify-password-error" : undefined}
    />
    {#if passwordError}
      <p id="verify-password-error" class="error-message" role="alert">
        <i class="fas fa-exclamation-circle" aria-hidden="true"></i>
        {passwordError}
      </p>
    {/if}
  </div>

  <!-- Action Buttons -->
  <div class="actions">
    <button
      class="button button--secondary"
      onclick={handleCancel}
      disabled={ctx.ui.changingEmail}
    >
      <i class="fas fa-times" aria-hidden="true"></i>
      {t("action_cancel")}
    </button>
    <button
      class="button button--primary"
      onclick={handleSubmit}
      disabled={ctx.ui.changingEmail}
      aria-busy={ctx.ui.changingEmail}
    >
      <i class="fas fa-paper-plane" aria-hidden="true"></i>
      {ctx.ui.changingEmail
        ? t("auth_sending")
        : t("nav_ui_send_verification_email")}
    </button>
  </div>
</div>

<style>
  .email-change-section {
    padding: clamp(18px, 3vh, 28px);
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke, var(--theme-stroke));
    border-radius: clamp(12px, 2vh, 18px);
    transition: all var(--duration-normal) ease;
  }

  .email-change-section.compact {
    padding: 18px;
    border-radius: 12px;
  }

  .email-change-section.very-compact {
    padding: 14px;
    border-radius: 10px;
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: clamp(10px, 1.5vh, 14px);
    margin-bottom: clamp(12px, 2vh, 16px);
  }

  .section-header i {
    font-size: clamp(18px, 2.5vh, 22px);
    color: color-mix(
      in srgb,
      var(--theme-accent, var(--theme-accent)) 80%,
      transparent
    );
  }

  .email-change-section.compact .section-header i {
    font-size: var(--font-size-lg);
  }

  .email-change-section.very-compact .section-header i {
    font-size: var(--font-size-base);
  }

  .section-header h4 {
    font-size: clamp(16px, 2.2vh, 20px);
    font-weight: 600;
    color: var(--theme-text);
    margin: 0;
  }

  .email-change-section.compact .section-header h4 {
    font-size: var(--font-size-base);
  }

  .email-change-section.very-compact .section-header h4 {
    font-size: var(--font-size-sm);
  }

  .description {
    font-size: clamp(13px, 1.8vh, 15px);
    color: var(--theme-text-dim);
    margin: 0 0 clamp(16px, 2.5vh, 24px) 0;
    line-height: 1.5;
  }

  .email-change-section.compact .description {
    font-size: var(--font-size-compact);
    margin-bottom: 16px;
  }

  .email-change-section.very-compact .description {
    font-size: var(--font-size-compact);
    margin-bottom: 12px;
  }

  /* Form Fields */
  .field {
    margin-bottom: clamp(16px, 3vh, 24px);
  }

  .email-change-section.compact .field {
    margin-bottom: 14px;
  }

  .email-change-section.very-compact .field {
    margin-bottom: 10px;
  }

  .label {
    display: block;
    font-size: clamp(13px, 1.8vh, 16px);
    font-weight: 500;
    color: var(--theme-text-dim);
    margin-bottom: clamp(6px, 1vh, 10px);
  }

  .email-change-section.compact .label {
    font-size: var(--font-size-compact);
    margin-bottom: 6px;
  }

  .email-change-section.very-compact .label {
    font-size: var(--font-size-compact);
    margin-bottom: 4px;
  }

  .input {
    width: 100%;
    padding: clamp(10px, 1.5vh, 14px) clamp(14px, 2vh, 18px);
    background: var(--theme-card-hover-bg, var(--theme-card-bg));
    border: 1px solid var(--theme-stroke, var(--theme-stroke));
    border-radius: 8px;
    color: var(--theme-text);
    font-size: clamp(14px, 1.9vh, 17px);
    transition: all var(--duration-normal) ease;
  }

  .email-change-section.compact .input {
    padding: 10px 14px;
    font-size: var(--font-size-sm);
    border-radius: 6px;
  }

  .email-change-section.very-compact .input {
    padding: 8px 12px;
    font-size: var(--font-size-compact);
    border-radius: 6px;
  }

  .input:focus {
    outline: none;
    border-color: color-mix(
      in srgb,
      var(--theme-accent, var(--theme-accent)) 60%,
      transparent
    );
    background: var(--theme-card-hover-bg, var(--theme-card-bg));
  }

  .input.error {
    border-color: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 60%,
      transparent
    );
  }

  .input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .error-message {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(--font-size-compact);
    color: color-mix(in srgb, var(--semantic-error, #ef4444) 90%, transparent);
    margin: 6px 0 0 0;
  }

  .email-change-section.compact .error-message {
    font-size: var(--font-size-compact);
    margin: 4px 0 0 0;
  }

  .email-change-section.very-compact .error-message {
    font-size: var(--font-size-compact);
    margin: 3px 0 0 0;
  }

  .error-message i {
    font-size: var(--font-size-compact);
  }

  /* Actions */
  .actions {
    display: flex;
    gap: 12px;
    margin-top: clamp(20px, 3vh, 28px);
  }

  .email-change-section.compact .actions {
    gap: 10px;
    margin-top: 18px;
  }

  .email-change-section.very-compact .actions {
    gap: 8px;
    margin-top: 14px;
  }

  .button {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: clamp(8px, 1.2vh, 12px);
    padding: clamp(12px, 1.8vh, 16px) clamp(20px, 3vw, 28px);
    min-height: var(--min-touch-target);
    border-radius: 10px;
    font-size: clamp(14px, 1.9vh, 17px);
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
    border: none;
  }

  .email-change-section.compact .button {
    padding: 11px 20px;
    min-height: var(--min-touch-target);
    font-size: var(--font-size-sm);
    gap: 8px;
    border-radius: 8px;
  }

  .email-change-section.very-compact .button {
    padding: 11px 18px;
    min-height: var(--min-touch-target);
    font-size: var(--font-size-compact);
    gap: 6px;
    border-radius: 8px;
  }

  .button i {
    font-size: var(--font-size-base);
  }

  .email-change-section.compact .button i {
    font-size: var(--font-size-sm);
  }

  .email-change-section.very-compact .button i {
    font-size: var(--font-size-compact);
  }

  .button--primary {
    background: linear-gradient(
      135deg,
      var(--theme-accent, var(--theme-accent)),
      var(--theme-accent-strong)
    );
    color: white;
    box-shadow: 0 2px 8px
      color-mix(
        in srgb,
        var(--theme-accent, var(--theme-accent)) 30%,
        transparent
      );
  }

  .button--primary:hover:not(:disabled) {
    background: linear-gradient(
      135deg,
      var(--theme-accent-strong),
      color-mix(in srgb, var(--theme-accent-strong) 85%, black)
    );
    transform: translateY(-2px);
    box-shadow: 0 4px 12px
      color-mix(
        in srgb,
        var(--theme-accent, var(--theme-accent)) 40%,
        transparent
      );
  }

  .button--secondary {
    background: var(--theme-card-hover-bg, var(--theme-card-bg));
    color: var(--theme-text, var(--theme-text));
    border: 1px solid var(--theme-stroke-strong, var(--theme-stroke-strong));
  }

  .button--secondary:hover:not(:disabled) {
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-stroke-strong);
    transform: translateY(-2px);
  }

  .button:active:not(:disabled) {
    transform: scale(0.98);
  }

  .button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none !important;
  }

  /* Mobile Responsive */
  @media (max-width: 480px) {
    .actions {
      flex-direction: column;
    }

    .button {
      width: 100%;
    }
  }

  /* Accessibility - Focus Indicators */
  .input:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--theme-accent) 90%, transparent);
    outline-offset: 2px;
  }

  .button:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--theme-accent) 90%, transparent);
    outline-offset: 2px;
  }

  /* Accessibility - Reduced Motion */
  @media (prefers-reduced-motion: reduce) {
    .button,
    .email-change-section {
      transition: none;
    }

    .button:hover,
    .button:active {
      transform: none;
    }
  }

  /* Accessibility - High Contrast */
  @media (prefers-contrast: high) {
    .input:focus-visible {
      outline: 3px solid white;
    }

    .button:focus-visible {
      outline: 3px solid white;
    }

    .email-change-section {
      border: 2px solid white;
    }
  }
</style>
