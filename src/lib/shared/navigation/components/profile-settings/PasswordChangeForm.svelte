<!--
  PasswordChangeForm Component

  Expandable form for changing password with visibility toggles,
  strength indicator, inline error/success feedback.
  Uses shared profile-settings-state for password form state.
  Extracted from AccountSettingsSection for single responsibility.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { HapticFeedback } from "../../../application/services/haptic-feedback";
  import Crossfade from "#lib/shared/components/Crossfade.svelte";
  import { getProfileSettingsContext } from "../../state/profile-settings-context.svelte";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import { slide, fade } from "svelte/transition";

  const ctx = getProfileSettingsContext();

  interface Props {
    onChangePassword: () => Promise<void>;
    hapticService: HapticFeedback | null;
    showLabel?: boolean;
  }

  let { onChangePassword, hapticService, showLabel = true }: Props = $props();

  // Password visibility toggles
  let showCurrentPassword = $state(false);
  let showNewPassword = $state(false);

  // Track form open state for stagger animation
  let formRevealed = $state(false);

  // Inline feedback
  let errorMessage = $state("");
  let showSuccess = $state(false);

  let newPasswordInput: HTMLInputElement | undefined = $state();

  const isFormValid = $derived(
    ctx.password.current &&
      ctx.password.current.length > 0 &&
      ctx.password.new &&
      ctx.password.new.length >= 8 &&
      !ctx.ui.saving &&
      !showSuccess
  );

  // Password strength
  type Strength = "weak" | "medium" | "strong";

  const passwordStrength: Strength | null = $derived.by(() => {
    const pw = ctx.password.new;
    if (!pw || pw.length === 0) return null;
    if (pw.length < 8) return "weak";

    let score = 0;
    if (pw.length >= 12) score++;
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
    if (/\d/.test(pw)) score++;
    if (/[^a-zA-Z0-9]/.test(pw)) score++;

    if (score >= 3) return "strong";
    if (score >= 1) return "medium";
    return "weak";
  });

  const strengthLabel = $derived(
    passwordStrength === "strong"
      ? t("nav_ui_strong")
      : passwordStrength === "medium"
        ? t("nav_ui_good")
        : passwordStrength === "weak"
          ? t("nav_ui_weak")
          : ""
  );

  function handleExpand() {
    hapticService?.trigger("selection");
    ctx.ui.showPasswordSection = true;
    errorMessage = "";
    showSuccess = false;
    requestAnimationFrame(() => {
      formRevealed = true;
    });
    setTimeout(() => newPasswordInput?.focus(), 420);
  }

  function handleCancel() {
    hapticService?.trigger("selection");
    formRevealed = false;
    errorMessage = "";
    showSuccess = false;
    ctx.ui.showPasswordSection = false;
    ctx.resetPasswordForm();
    showCurrentPassword = false;
    showNewPassword = false;
  }

  async function handleSubmit() {
    errorMessage = "";
    try {
      await onChangePassword();
      // Success - show inline confirmation then collapse
      showSuccess = true;
      hapticService?.trigger("success");
      setTimeout(() => {
        handleCancel();
      }, 1500);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "WRONG_PASSWORD") {
        errorMessage = t("nav_ui_current_password_is_incorrect");
        hapticService?.trigger("error");
      } else {
        errorMessage = t("nav_ui_failed_to_change_password_please_try_again");
        hapticService?.trigger("error");
      }
    }
  }

  function toggleCurrentPassword() {
    hapticService?.trigger("selection");
    showCurrentPassword = !showCurrentPassword;
  }

  function toggleNewPassword() {
    hapticService?.trigger("selection");
    showNewPassword = !showNewPassword;
  }
</script>

<div class="section">
  {#if showLabel}
    <span class="label">{t("auth_password")}</span>
  {/if}
  <Crossfade
    key={ctx.ui.showPasswordSection}
    duration={DURATION.emphasis}
    animateHeight
  >
    {#if !ctx.ui.showPasswordSection}
      <div>
        <button class="button button--secondary" onclick={handleExpand}>
          <i class="fas fa-lock" aria-hidden="true"></i>
          {t("nav_ui_change_password")}
        </button>
      </div>
    {:else}
      <div class="password-form" class:success={showSuccess}>
        {#if showSuccess}
          <div class="success-message" in:fade={{ duration: 200 }}>
            <i class="fas fa-check-circle" aria-hidden="true"></i>
            {t("nav_ui_password_updated")}
          </div>
        {:else}
          {#if errorMessage}
            <div class="error-banner" role="alert" in:slide={{ duration: 200 }}>
              <i class="fas fa-exclamation-circle" aria-hidden="true"></i>
              {errorMessage}
            </div>
          {/if}

          <div
            class="field stagger-field"
            class:revealed={formRevealed}
            style="--stagger: 0"
          >
            <label class="field-label" for="current-password">
              {t("nav_ui_current_password")}
            </label>
            <div class="input-wrapper">
              <input
                id="current-password"
                type={showCurrentPassword ? "text" : "password"}
                class="input input-with-toggle"
                class:input-error={errorMessage.includes("incorrect")}
                bind:value={ctx.password.current}
                placeholder={t("nav_ui_enter_current_password")}
                aria-required="true"
                autocomplete="current-password"
                oninput={() => (errorMessage = "")}
              />
              <button
                type="button"
                class="toggle-visibility"
                onclick={toggleCurrentPassword}
                aria-label={showCurrentPassword
                  ? t("auth_hide_password")
                  : t("auth_show_password")}
              >
                <i
                  class="fas {showCurrentPassword ? 'fa-eye-slash' : 'fa-eye'}"
                  aria-hidden="true"
                ></i>
              </button>
            </div>
          </div>

          <div
            class="field stagger-field"
            class:revealed={formRevealed}
            style="--stagger: 1"
          >
            <label class="field-label" for="new-password"
              >{t("nav_ui_new_password")}</label
            >
            <div class="input-wrapper">
              <input
                id="new-password"
                type={showNewPassword ? "text" : "password"}
                class="input input-with-toggle"
                bind:value={ctx.password.new}
                bind:this={newPasswordInput}
                placeholder={t("nav_ui_enter_new_password")}
                aria-required="true"
                autocomplete="new-password"
              />
              <button
                type="button"
                class="toggle-visibility"
                onclick={toggleNewPassword}
                aria-label={showNewPassword
                  ? t("auth_hide_password")
                  : t("auth_show_password")}
              >
                <i
                  class="fas {showNewPassword ? 'fa-eye-slash' : 'fa-eye'}"
                  aria-hidden="true"
                ></i>
              </button>
            </div>
            {#if passwordStrength}
              <div
                class="strength-bar"
                aria-label={t("nav_password_strength", {
                  strength: strengthLabel,
                })}
              >
                <div class="strength-track">
                  <div class="strength-fill strength--{passwordStrength}"></div>
                </div>
                <span class="strength-label strength--{passwordStrength}"
                  >{strengthLabel}</span
                >
              </div>
            {/if}
          </div>

          <div
            class="button-row stagger-field"
            class:revealed={formRevealed}
            style="--stagger: 2"
          >
            <button class="button button--secondary" onclick={handleCancel}>
              {t("action_cancel")}
            </button>
            <button
              class="button button--primary"
              onclick={handleSubmit}
              disabled={!isFormValid}
            >
              {#if ctx.ui.saving}
                <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
                {t("nav_ui_updating")}
              {:else}
                <i class="fas fa-check" aria-hidden="true"></i>
                {t("nav_ui_update_password")}
              {/if}
            </button>
          </div>
        {/if}
      </div>
    {/if}
  </Crossfade>
</div>

<style>
  .section {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  /* Staggered field entrance */
  .stagger-field {
    opacity: 0;
    transform: translateY(12px);
    transition:
      opacity 250ms cubic-bezier(0.22, 1, 0.36, 1),
      transform 250ms cubic-bezier(0.22, 1, 0.36, 1);
    transition-delay: calc(var(--stagger, 0) * 80ms + 100ms);
  }

  .stagger-field.revealed {
    opacity: 1;
    transform: translateY(0);
  }

  .label {
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--theme-text);
  }

  .field-label {
    display: block;
    font-size: var(--font-size-sm);
    font-weight: 500;
    color: var(--theme-text);
    margin-bottom: 8px;
  }

  .password-form {
    background: color-mix(
      in srgb,
      var(--theme-panel-bg, #12121c) 96%,
      var(--theme-text, #fff) 4%
    );
    border: 1px solid var(--theme-stroke);
    border-radius: 12px;
    padding: 20px;
    transition: border-color 300ms ease;
  }

  .password-form.success {
    border-color: var(--semantic-success, #4caf50);
  }

  .field {
    margin-bottom: 20px;
  }

  .input-wrapper {
    position: relative;
    display: flex;
    align-items: center;
  }

  .input {
    flex: 1;
    min-width: 0;
    min-height: var(--min-touch-target, 44px);
    padding: 0.75rem 1rem;
    background: color-mix(
      in srgb,
      var(--theme-panel-bg, #12121c) 92%,
      var(--theme-text, #fff) 8%
    );
    border: 1.5px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.18));
    border-radius: 8px;
    color: var(--theme-text);
    font-size: var(--font-size-sm);
    transition: all var(--duration-normal) ease;
  }

  .input:focus {
    outline: none;
    border-color: color-mix(in srgb, var(--theme-accent) 60%, transparent);
    background: var(--theme-card-hover-bg);
  }

  .input::placeholder {
    color: var(--theme-text-dim);
    opacity: 0.6;
  }

  .input-with-toggle {
    padding-right: 50px;
  }

  .input-error {
    border-color: var(--semantic-error, #f44336);
  }

  .input-error:focus {
    border-color: var(--semantic-error, #f44336);
  }

  .toggle-visibility {
    position: absolute;
    right: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    background: transparent;
    border: none;
    border-radius: 6px;
    color: var(--theme-text-dim);
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .toggle-visibility:hover {
    color: var(--theme-text);
    background: var(--theme-card-hover-bg);
  }

  .toggle-visibility:active {
    transform: scale(0.95);
  }

  .toggle-visibility i {
    font-size: var(--font-size-base);
  }

  /* Error banner */
  .error-banner {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    margin-bottom: 16px;
    background: color-mix(
      in srgb,
      var(--semantic-error, #f44336) 12%,
      transparent
    );
    border: 1px solid
      color-mix(in srgb, var(--semantic-error, #f44336) 30%, transparent);
    border-radius: 8px;
    color: var(--semantic-error, #f44336);
    font-size: var(--font-size-compact);
    font-weight: 500;
  }

  /* Success message */
  .success-message {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 24px 16px;
    color: var(--semantic-success, #4caf50);
    font-size: var(--font-size-sm);
    font-weight: 600;
  }

  .success-message i {
    font-size: 1.25rem;
  }

  /* Strength indicator */
  .strength-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
  }

  .strength-track {
    flex: 1;
    height: 4px;
    background: var(--theme-stroke);
    border-radius: 2px;
    overflow: hidden;
  }

  .strength-fill {
    height: 100%;
    border-radius: 2px;
    transition:
      width 300ms ease,
      background 300ms ease;
  }

  .strength-fill.strength--weak {
    width: 33%;
    background: var(--semantic-error, #f44336);
  }

  .strength-fill.strength--medium {
    width: 66%;
    background: var(--semantic-warning, #ff9800);
  }

  .strength-fill.strength--strong {
    width: 100%;
    background: var(--semantic-success, #4caf50);
  }

  .strength-label {
    font-size: var(--font-size-compact);
    font-weight: 500;
    min-width: 44px;
  }

  .strength-label.strength--weak {
    color: var(--semantic-error, #f44336);
  }

  .strength-label.strength--medium {
    color: var(--semantic-warning, #ff9800);
  }

  .strength-label.strength--strong {
    color: var(--semantic-success, #4caf50);
  }

  .button-row {
    display: flex;
    gap: 12px;
    margin-top: 16px;
  }

  .button-row .button {
    flex: 1;
    margin-top: 0;
  }

  .button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: clamp(10px, 3cqi, 14px) clamp(12px, 4cqi, 24px);
    min-height: var(--min-touch-target);
    border-radius: 10px;
    font-size: var(--font-size-sm);
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
    border: none;
  }

  .button i {
    font-size: var(--font-size-base);
  }

  .button--primary {
    background: linear-gradient(
      135deg,
      var(--theme-accent),
      var(--theme-accent-strong)
    );
    color: white;
    box-shadow: 0 2px 8px
      color-mix(in srgb, var(--theme-accent) 30%, transparent);
  }

  .button--primary:hover:not(:disabled) {
    filter: brightness(1.1);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px
      color-mix(in srgb, var(--theme-accent) 40%, transparent);
  }

  .button--secondary {
    background: color-mix(in srgb, var(--theme-accent) 15%, transparent);
    color: var(--theme-accent);
    border: 1px solid color-mix(in srgb, var(--theme-accent) 40%, transparent);
  }

  .button--secondary:hover:not(:disabled) {
    background: color-mix(in srgb, var(--theme-accent) 25%, transparent);
    border-color: color-mix(in srgb, var(--theme-accent) 60%, transparent);
  }

  .button:active:not(:disabled) {
    transform: scale(0.98);
  }

  .button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none !important;
  }

  /* Accessibility */
  .input:focus-visible {
    outline: 3px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .button:focus-visible,
  .toggle-visibility:focus-visible {
    outline: 3px solid var(--theme-accent);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .button,
    .toggle-visibility,
    .stagger-field,
    .strength-fill,
    .password-form {
      transition: none;
    }

    .stagger-field {
      opacity: 1;
      transform: none;
    }

    .button:hover,
    .button:active,
    .toggle-visibility:active {
      transform: none;
    }
  }

  @media (prefers-contrast: high) {
    .input:focus-visible {
      outline: 3px solid white;
    }

    .button:focus-visible,
    .toggle-visibility:focus-visible {
      outline: 3px solid white;
    }
  }
</style>
