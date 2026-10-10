<!--
  EmailLinkingFormStep Component

  Form step for entering email and password to link to account.
  Handles input validation and submission.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";

  interface Props {
    email: string;
    password: string;
    showPassword: boolean;
    formError: string | null;
    isSubmitting: boolean;
    onEmailChange: (value: string) => void;
    onPasswordChange: (value: string) => void;
    onTogglePassword: () => void;
    onSubmit: () => void;
    onCancel: () => void;
  }

  let {
    email,
    password,
    showPassword,
    formError,
    isSubmitting,
    onEmailChange,
    onPasswordChange,
    onTogglePassword,
    onSubmit,
    onCancel,
  }: Props = $props();

  function handleSubmit(e: Event) {
    e.preventDefault();
    onSubmit();
  }
</script>

<form class="email-form" onsubmit={handleSubmit}>
  <div class="form-group">
    <label for="email-link-email">{t("form_email")}</label>
    <div class="input-wrapper">
      <i class="fas fa-envelope input-icon" aria-hidden="true"></i>
      <input
        id="email-link-email"
        type="email"
        value={email}
        oninput={(e) => onEmailChange(e.currentTarget.value)}
        placeholder={t("form_placeholder_email")}
        required
        disabled={isSubmitting}
        autocomplete="username"
        class:has-value={email.length > 0}
      />
    </div>
  </div>

  <div class="form-group">
    <label for="email-link-password">{t("form_password")}</label>
    <div class="input-wrapper">
      <i class="fas fa-lock input-icon" aria-hidden="true"></i>
      <input
        id="email-link-password"
        type={showPassword ? "text" : "password"}
        value={password}
        oninput={(e) => onPasswordChange(e.currentTarget.value)}
        placeholder={t("form_placeholder_password")}
        required
        minlength="8"
        disabled={isSubmitting}
        autocomplete="new-password"
        class:has-value={password.length > 0}
      />
      <button
        type="button"
        class="toggle-password"
        onclick={onTogglePassword}
        aria-label={showPassword ? t("auth_hide_password") : t("auth_show_password")}
        disabled={isSubmitting}
        tabindex={-1}
      >
        <i
          class="fas {showPassword ? 'fa-eye-slash' : 'fa-eye'}"
          aria-hidden="true"
        ></i>
      </button>
    </div>
    <span class="field-hint">
      <i class="fas fa-eye" aria-hidden="true"></i> {t("form_verify_password_hint")}
    </span>
  </div>

  {#if formError}
    <div class="form-error" role="alert">
      <i class="fas fa-exclamation-circle" aria-hidden="true"></i>
      <span>{formError}</span>
    </div>
  {/if}

  <div class="form-actions">
    <button
      type="button"
      class="cancel-btn"
      onclick={onCancel}
      disabled={isSubmitting}
    >
      {t("action_cancel")}
    </button>
    <button
      type="submit"
      class="submit-btn"
      disabled={isSubmitting}
      aria-busy={isSubmitting}
    >
      {#if isSubmitting}
        <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
        <span>{t("auth_linking")}</span>
      {:else}
        <i class="fas fa-link" aria-hidden="true"></i>
        <span>{t("auth_link_email")}</span>
      {/if}
    </button>
  </div>
</form>

<style>
  .email-form {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .form-group label {
    font-size: var(--font-size-compact);
    font-weight: 500;
    color: color-mix(in srgb, var(--theme-text, white) 70%, transparent);
  }

  .input-wrapper {
    position: relative;
    display: flex;
    align-items: center;
  }

  .input-icon {
    position: absolute;
    left: 14px;
    font-size: var(--font-size-sm);
    color: var(--theme-text-dim);
    transition: color var(--duration-normal) ease;
    pointer-events: none;
  }

  .input-wrapper:focus-within .input-icon {
    color: var(--theme-accent-strong);
  }

  .form-group input {
    width: 100%;
    padding: 14px 14px 14px 44px;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid var(--theme-stroke, var(--theme-stroke-strong));
    border-radius: 12px;
    color: color-mix(in srgb, var(--theme-text, white) 95%, transparent);
    font-size: var(--font-size-sm);
    transition: all var(--duration-normal) ease;
  }

  .form-group input::placeholder {
    color: color-mix(in srgb, var(--theme-text, white) 35%, transparent);
  }

  .form-group input:focus {
    outline: none;
    border-color: var(--theme-accent-strong, var(--theme-accent-strong));
    box-shadow: 0 0 0 3px
      color-mix(
        in srgb,
        var(--theme-accent-strong, var(--theme-accent-strong)) 15%,
        transparent
      );
  }

  .form-group input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .toggle-password {
    position: absolute;
    right: 4px;
    width: var(--min-touch-target); /* WCAG AAA touch target */
    height: var(--min-touch-target);
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    color: var(--theme-text-dim, var(--theme-text-dim));
    cursor: pointer;
    border-radius: 8px;
    transition: all var(--duration-normal) ease;
  }

  .toggle-password:hover:not(:disabled) {
    color: color-mix(in srgb, var(--theme-text, white) 80%, transparent);
    background: var(--theme-card-bg);
  }

  .toggle-password:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .field-hint {
    font-size: var(--font-size-compact);
    display: flex;
    align-items: center;
    gap: 4px;
    color: var(--theme-text-dim, var(--theme-text-dim));
  }

  .field-hint i {
    opacity: 0.7;
  }

  .form-error {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 12px 14px;
    background: color-mix(
      in srgb,
      var(--semantic-error, var(--semantic-error)) 15%,
      transparent
    );
    border: 1px solid
      color-mix(
        in srgb,
        var(--semantic-error, var(--semantic-error)) 30%,
        transparent
      );
    border-radius: 10px;
    color: #fca5a5;
    font-size: var(--font-size-sm);
    line-height: 1.4;
  }

  .form-error i {
    color: var(--semantic-error, var(--semantic-error));
    flex-shrink: 0;
    margin-top: 2px;
  }

  .form-actions {
    display: flex;
    gap: 12px;
    margin-top: 8px;
  }

  .cancel-btn {
    flex: 1;
    padding: 14px 20px;
    background: var(--theme-card-bg, var(--theme-card-bg));
    border: 1px solid var(--theme-stroke, var(--theme-stroke-strong));
    border-radius: 12px;
    color: color-mix(in srgb, var(--theme-text, white) 70%, transparent);
    font-size: var(--font-size-sm);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .cancel-btn:hover:not(:disabled) {
    background: var(--theme-card-hover-bg);
    color: color-mix(in srgb, var(--theme-text, white) 90%, transparent);
  }

  .cancel-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .submit-btn {
    flex: 1.5;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 14px 20px;
    background: linear-gradient(
      135deg,
      var(--theme-accent-strong, var(--theme-accent-strong)) 0%,
      #7c3aed 100%
    );
    border: none;
    border-radius: 12px;
    color: var(--theme-text, white);
    font-size: var(--font-size-sm);
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .submit-btn:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 20px
      color-mix(
        in srgb,
        var(--theme-accent-strong, var(--theme-accent-strong)) 40%,
        transparent
      );
  }

  .submit-btn:active:not(:disabled) {
    transform: translateY(0);
  }

  .submit-btn:disabled {
    opacity: 0.7;
    cursor: not-allowed;
    transform: none;
  }

  /* Responsive */
  @media (max-width: 480px) {
    .form-actions {
      flex-direction: column;
    }

    .cancel-btn,
    .submit-btn {
      flex: none;
      width: 100%;
    }
  }

  /* Focus States */
  .cancel-btn:focus-visible,
  .submit-btn:focus-visible,
  .toggle-password:focus-visible {
    outline: 2px solid var(--theme-accent-strong);
    outline-offset: 2px;
  }

  /* Reduced Motion */
  @media (prefers-reduced-motion: reduce) {
    .submit-btn:hover:not(:disabled) {
      transform: none;
    }
  }
</style>
