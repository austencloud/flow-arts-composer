<!--
  EmailLinkingVerifyStep Component

  Verification step showing pending email verification with polling indicator.
  Includes resend functionality with cooldown timer.
-->
<script lang="ts">
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import { t } from "$lib/shared/i18n/i18n.svelte";
  interface Props {
    email: string;
    checkCount: number;
    maxChecks: number;
    resendCooldown: number;
    canResend: boolean;
    formError: string | null;
    onResend: () => void;
    onSkip: () => void;
  }

  let {
    email,
    checkCount,
    maxChecks,
    resendCooldown,
    canResend,
    formError,
    onResend,
    onSkip,
  }: Props = $props();

  const progressPercent = $derived(
    Math.min((checkCount / maxChecks) * 100, 100)
  );
</script>

<div class="verification-content">
  <div class="verification-animation">
    <div class="email-icon-container">
      <i class="fas fa-envelope" aria-hidden="true"></i>
      <div class="pulse-ring"></div>
      <div class="pulse-ring delay"></div>
    </div>
  </div>

  <div class="verification-instructions">
    <p>{t("auth_linking_click_email")}</p>
    <p class="hint">{t("auth_linking_check_spam")}</p>
  </div>

  <div class="verification-status">
    <div class="status-indicator">
      <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
      <span>{t("auth_linking_waiting")}</span>
    </div>
    <div class="progress-bar">
      <div class="progress-fill" style:width="{progressPercent}%"></div>
    </div>
  </div>

  <div class="resend-section">
    <p>{t("auth_linking_not_received")}</p>
    <button class="resend-btn" onclick={onResend} disabled={!canResend}>
      {#if resendCooldown > 0}
        <i class="fas fa-clock" aria-hidden="true"></i>
        <span>{t("auth_linking_resend_in", { seconds: resendCooldown })}</span>
      {:else}
        <i class="fas fa-paper-plane" aria-hidden="true"></i>
        <span>{t("auth_linking_resend")}</span>
      {/if}
    </button>
  </div>

  {#if formError}
    <div class="form-error" role="alert">
      <i class="fas fa-exclamation-circle" aria-hidden="true"></i>
      <span>{formError}</span>
    </div>
  {/if}

  <PanelButton onclick={onSkip}>{t("auth_linking_verify_later")}</PanelButton>
</div>

<style>
  .verification-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 24px;
    text-align: center;
    padding: 8px 0;
  }

  .verification-animation {
    position: relative;
  }

  .email-icon-container {
    position: relative;
    width: 88px;
    height: 88px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(
      in srgb,
      var(--semantic-info, var(--semantic-info)) 15%,
      transparent
    );
    border-radius: 50%;
  }

  .email-icon-container i {
    font-size: var(--font-size-3xl);
    color: var(--semantic-info, var(--semantic-info));
  }

  .pulse-ring {
    position: absolute;
    inset: 0;
    border: 2px solid
      color-mix(
        in srgb,
        var(--semantic-info, var(--semantic-info)) 40%,
        transparent
      );
    border-radius: 50%;
    animation: pulse-ring 2s ease-out infinite;
  }

  .pulse-ring.delay {
    animation-delay: 1s;
  }

  @keyframes pulse-ring {
    0% {
      transform: scale(1);
      opacity: 1;
    }
    100% {
      transform: scale(1.6);
      opacity: 0;
    }
  }

  .verification-instructions {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .verification-instructions p {
    margin: 0;
    font-size: var(--font-size-sm);
    color: color-mix(in srgb, var(--theme-text, white) 80%, transparent);
  }

  .verification-instructions .hint {
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim, var(--theme-text-dim));
  }

  .verification-status {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .status-indicator {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-size: var(--font-size-sm);
    color: var(--theme-text-dim, var(--theme-text-dim));
  }

  .status-indicator i {
    color: var(--semantic-info, var(--semantic-info));
  }

  .progress-bar {
    width: 100%;
    height: 4px;
    background: var(--theme-stroke);
    border-radius: 2px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(
      90deg,
      var(--semantic-info, var(--semantic-info)),
      var(--theme-accent-strong, var(--theme-accent-strong))
    );
    border-radius: 2px;
    transition: width var(--duration-emphasis) ease;
  }

  .resend-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }

  .resend-section p {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--theme-text-dim, var(--theme-text-dim));
  }

  .resend-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 20px;
    background: var(--theme-card-bg, var(--theme-card-bg));
    border: 1px solid var(--theme-stroke, var(--theme-stroke-strong));
    border-radius: 10px;
    color: color-mix(in srgb, var(--theme-text, white) 80%, transparent);
    font-size: var(--font-size-sm);
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .resend-btn:hover:not(:disabled) {
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-stroke-strong);
  }

  .resend-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
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

  /* Focus States */
  .resend-btn:focus-visible {
    outline: 2px solid
      color-mix(in srgb, var(--theme-accent-strong) 80%, transparent);
    outline-offset: 2px;
  }

  /* Reduced Motion */
  @media (prefers-reduced-motion: reduce) {
    .pulse-ring,
    .progress-fill {
      animation: none;
    }
  }
</style>
